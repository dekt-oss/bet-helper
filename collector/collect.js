// 베트맨 승부식(1X2) 배당 자동 수집 에이전트 — 사용자 본인 PC(가정용 IP)에서 실행.
//
// 로그인 정책: 베트맨 로그인은 자동입력/인증서 등으로 헤드리스 완전자동이 어렵다.
//   → 최초 1회 `npm run login`(뜬 창에서 직접 로그인)으로 세션(betman-session.json) 저장.
//   이후 무인 수집. 25분마다 keep-alive 방문으로 세션을 살려두고, 매 사이클 세션 파일을
//   다시 읽으므로 만료 시 `npm run login` 만 다시 하면 pm2 재시작 없이 자동 반영된다.
//
// 수집 주기: 기본 BASE_INTERVAL_MINUTES(120). 가장 가까운 경기가 NEAR_WINDOW_HOURS(12)
//   이내면 NEAR_INTERVAL_MINUTES(90) 간격으로 자주 수집. 세션 keep-alive 는 KEEPALIVE_MINUTES(25).
//
// gmTs(회차): 생략 시 betman 메인에서 현재 회차를 자동 탐지한다(.env 수동 갱신 불필요).
//
// 실행: npm run login / npm run capture / npm run once / npm start(pm2)

import 'dotenv/config';
import { chromium } from 'playwright-core';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── 인자/설정 ─────────────────────────────────────────────
const ARGV = new Set(process.argv.slice(2));
const ONCE = ARGV.has('--once');
const CAPTURE_ONLY = ARGV.has('--capture-only');
const LOGIN_ONLY = ARGV.has('--login-only');
const HEADFUL = ARGV.has('--headful');

const cfg = {
  ingestUrl: process.env.INGEST_URL ?? '',
  ingestToken: process.env.ODDS_INGEST_TOKEN ?? '',

  homeUrl: process.env.BETMAN_HOME_URL ?? 'https://www.betman.co.kr/',
  // 승부식 슬립 페이지. gmTs(회차) 없으면 메인에서 현재 회차를 자동 탐지해 붙인다.
  // BETMAN_PROTO_URL 에 gmTs 를 직접 넣으면 그 회차로 고정(수동 override).
  protoUrl:
    process.env.BETMAN_PROTO_URL ??
    'https://www.betman.co.kr/main/mainPage/gamebuy/gameSlip.do?gmId=G101',
  gmId: process.env.BETMAN_GMID ?? 'G101',
  // 캡처 대상 응답 URL 부분 일치(콤마). 비워도 본문에 compSchedules 있으면 자동 인식.
  slipUrlMatch: (process.env.GAMESLIP_URL_MATCH ?? 'gameInfoInq.do,inqMainGameInfo.do,gameSlip.do')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  channel: process.env.BROWSER_CHANNEL ?? '',
  headless: HEADFUL ? false : (process.env.HEADLESS ?? 'true') !== 'false',

  baseIntervalMin: Number(process.env.BASE_INTERVAL_MINUTES ?? '120'),
  nearIntervalMin: Number(process.env.NEAR_INTERVAL_MINUTES ?? '90'),
  nearWindowHours: Number(process.env.NEAR_WINDOW_HOURS ?? '12'),
  keepaliveMin: Number(process.env.KEEPALIVE_MINUTES ?? '25'),
  jitterSec: Number(process.env.JITTER_SECONDS ?? '120'),

  sessionFile: process.env.SESSION_FILE ?? path.join(HERE, 'betman-session.json'),
  capturesDir: path.join(HERE, 'captures'),
  navTimeout: Number(process.env.NAV_TIMEOUT_MS ?? '30000'),

  // 무중단(hang 방지)
  cycleTimeoutMs: Number(process.env.CYCLE_TIMEOUT_SEC ?? '210') * 1000, // 한 사이클 상한
  maxFails: Number(process.env.MAX_FAILS ?? '4'), // 연속 hang 시 프로세스 재시작
  restartHours: Number(process.env.RESTART_HOURS ?? '6'), // 주기적 하드 재시작

  userAgent:
    process.env.BETMAN_USER_AGENT ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

// ── 유틸 ──────────────────────────────────────────────────
const log = (...a) => console.info(`[collector ${new Date().toISOString()}]`, ...a);
const warn = (...a) => console.warn(`[collector ${new Date().toISOString()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForEnter(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

function requireConfig() {
  const missing = [];
  if (!CAPTURE_ONLY && !LOGIN_ONLY) {
    if (!cfg.ingestUrl) missing.push('INGEST_URL');
    if (!cfg.ingestToken) missing.push('ODDS_INGEST_TOKEN');
  }
  if (missing.length) {
    throw new Error(`필수 환경변수 누락: ${missing.join(', ')} (collector/.env 확인)`);
  }
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function urlLooksLoggedOut(url) {
  return /accessDenied|loginPage|\/login/i.test(url);
}

const buildSlipUrl = (gmTs) =>
  `https://www.betman.co.kr/main/mainPage/gamebuy/gameSlip.do?gmId=${cfg.gmId}&gmTs=${gmTs}`;

// ── 무중단 헬퍼(hang 방지) ────────────────────────────────
/** ms 안에 안 끝나면 reject. (멈춘 작업 자체는 못 끊으므로 호출부에서 브라우저를 죽여 회복) */
function withTimeout(promise, ms, label) {
  let to;
  const t = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(`timeout:${label}`)), ms);
  });
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(to)), t]);
}

/** page.content() 처럼 타임아웃 없는 호출을 안전하게(멈추면 빈 문자열). */
async function safeContent(page) {
  try {
    return await withTimeout(page.content(), 8000, 'content');
  } catch {
    return '';
  }
}

/** 브라우저를 확실히 종료한다. close 가 멈추면 OS 프로세스 트리를 강제 종료(좀비 chrome 방지). */
async function killBrowserHard(browser) {
  if (!browser) return;
  const proc = typeof browser.process === 'function' ? browser.process() : null;
  try {
    await withTimeout(browser.close(), 8000, 'close');
  } catch {
    /* close 가 멈춤 → 아래에서 강제 종료 */
  }
  const pid = proc?.pid;
  if (pid) {
    try {
      if (process.platform === 'win32') {
        exec(`taskkill /PID ${pid} /T /F`, () => {});
      } else {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* 이미 종료됨 */
        }
      }
    } catch {
      /* ignore */
    }
  }
}

// ── 브라우저/컨텍스트 ─────────────────────────────────────
async function launchBrowser() {
  const channels = cfg.channel ? [cfg.channel] : ['chrome', 'msedge'];
  let lastErr;
  for (const channel of channels) {
    try {
      const b = await chromium.launch({ headless: cfg.headless, channel });
      log(`브라우저: ${channel}`);
      return b;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    'Chrome/Edge 를 찾지 못했습니다. 크롬을 설치하거나 .env 에 BROWSER_CHANNEL=msedge 등을 지정하세요. ' +
      `(원인: ${lastErr?.message ?? lastErr})`,
  );
}

// 세션 파일을 매번 새로 읽어 컨텍스트를 만든다 → 재로그인 시 pm2 재시작 없이 반영됨.
async function newContextFromSession(browser) {
  const has = await fileExists(cfg.sessionFile);
  return browser.newContext({
    storageState: has ? cfg.sessionFile : undefined,
    locale: 'ko-KR',
    userAgent: cfg.userAgent,
    viewport: { width: 1366, height: 900 },
  });
}

// ── 로그인 ────────────────────────────────────────────────
async function probeLoggedIn(page) {
  try {
    await page.goto(cfg.protoUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeout });
    if (urlLooksLoggedOut(page.url())) return false;
    const body = await safeContent(page);
    if (body.includes('로그인이 필요')) return false;
    return true;
  } catch {
    return false;
  }
}

async function manualLogin(context, page) {
  log('▶ 열린 크롬 창에서 베트맨에 "직접" 로그인하세요(사이트 방식대로).');
  await page
    .goto(cfg.homeUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeout })
    .catch(() => {});
  await waitForEnter('   로그인을 모두 마쳤으면 이 창에서 Enter 를 누르세요… ');
  if (await probeLoggedIn(page)) {
    await context.storageState({ path: cfg.sessionFile });
    log(`로그인 확인 → 세션 저장 완료(${path.basename(cfg.sessionFile)}). 이후엔 무인 자동.`);
    return true;
  }
  warn('아직 로그인 안 된 것으로 보입니다. 창에서 로그인 완료 후 `npm run login` 을 다시 실행하세요.');
  return false;
}

async function ensureSession(context, page) {
  if (await probeLoggedIn(page)) {
    log('세션 유효.');
    return true;
  }
  if (cfg.headless) {
    throw new Error('세션이 없거나 만료됨. 먼저 `npm run login`(크롬 창)으로 1회 로그인하세요.');
  }
  return manualLogin(context, page);
}

// ── 배당 응답 수집 ────────────────────────────────────────
function isHtmlBody(t) {
  const s = t.trimStart().slice(0, 200).toLowerCase();
  return s.startsWith('<') || s.includes('<!doctype') || s.includes('<html');
}
function looksLikeOdds(t) {
  return (
    t.includes('winAllot') ||
    t.includes('matchSeq') ||
    t.includes('compSchedules') ||
    t.includes('"allot"')
  );
}
function makeCollector(candidates) {
  return async (res) => {
    const type = res.request().resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    let text;
    try {
      text = await withTimeout(res.text(), 10000, 'restext'); // 본문 읽기 hang 방지
    } catch {
      return;
    }
    if (!text || !text.trim() || isHtmlBody(text)) return;
    const byUrl = cfg.slipUrlMatch.some((m) => res.url().includes(m));
    if (!byUrl && !looksLikeOdds(text)) return;
    const url = res.url();
    const i = candidates.findIndex((c) => c.url === url);
    if (i >= 0) candidates[i] = { url, body: text };
    else candidates.push({ url, body: text });
  };
}
/** 앱 파서가 쓰는 compSchedules 포함 JSON 을 최우선으로 고른다. */
function pickBest(candidates) {
  const scored = candidates
    .map((c) => {
      let json = null;
      try {
        json = JSON.parse(c.body);
      } catch {
        /* not json */
      }
      const comp = c.body.includes('compSchedules') ? 1 : 0;
      const signal = (c.body.match(/winAllot|matchSeq|"allot"/g) || []).length;
      return { ...c, json, comp, signal };
    })
    .sort((a, b) => b.comp - a.comp || (b.json ? 1 : 0) - (a.json ? 1 : 0) || b.signal - a.signal);
  return scored[0] ?? null;
}

/** 페이지를 url 로 이동해 배당 JSON 후보들을 수집(compSchedules 가 잡히면 일찍 종료). */
async function collectOnce(page, url) {
  const candidates = [];
  const listener = makeCollector(candidates);
  page.on('response', listener);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: cfg.navTimeout }).catch(() => {});
    for (let i = 0; i < 14 && !candidates.some((c) => c.body.includes('compSchedules')); i++) {
      await sleep(800);
    }
  } finally {
    page.off('response', listener);
  }
  return candidates;
}

/** 캡처 모드: 자동 시도 후 실패하면 사용자가 직접 이동 → Enter. */
async function collectManual(page) {
  const candidates = [];
  const listener = makeCollector(candidates);
  page.on('response', listener);
  try {
    const url = await resolveSlipUrl(page).catch(() => cfg.protoUrl);
    await page.goto(url, { waitUntil: 'networkidle', timeout: cfg.navTimeout }).catch(() => {});
    for (let i = 0; i < 8 && !candidates.some((c) => c.body.includes('compSchedules')); i++) {
      await sleep(800);
    }
    if (!candidates.some((c) => c.body.includes('compSchedules'))) {
      log('▶ 자동으로 못 잡음. 크롬 창에서 [프로토 승부식 → 축구 → 월드컵] 배당 화면으로 이동 후 Enter.');
      await waitForEnter('   배당이 화면에 보이면 이 창에서 Enter… ');
      await sleep(1000);
    }
  } finally {
    page.off('response', listener);
  }
  return candidates;
}

/** 현재 회차(gmTs)를 betman 메인/응답에서 자동 탐지. */
async function discoverGmTs(page) {
  const texts = [];
  const onResp = async (res) => {
    const t = res.request().resourceType();
    if (t !== 'xhr' && t !== 'fetch' && t !== 'document') return;
    try {
      const x = await withTimeout(res.text(), 10000, 'restext');
      if (x) texts.push(x);
    } catch {
      /* ignore */
    }
  };
  page.on('response', onResp);
  try {
    await page.goto(cfg.homeUrl, { waitUntil: 'networkidle', timeout: cfg.navTimeout }).catch(
      () => {},
    );
    await sleep(1500);
    texts.push(await safeContent(page));
  } finally {
    page.off('response', onResp);
  }
  const blob = texts.join('\n');
  const id = cfg.gmId;
  let m =
    blob.match(new RegExp(`gmId=${id}&gmTs=(\\d{5,})`)) ||
    blob.match(new RegExp(`gmTs=(\\d{5,})&gmId=${id}`)) ||
    blob.match(new RegExp(`"gmId"\\s*:\\s*"${id}"[\\s\\S]{0,400}?"gmTs"\\s*:\\s*"?(\\d{5,})"?`)) ||
    blob.match(new RegExp(`"gmTs"\\s*:\\s*"?(\\d{5,})"?[\\s\\S]{0,400}?"gmId"\\s*:\\s*"${id}"`));
  if (m) return m[1];
  // 폴백: 가장 자주 등장하는 6자리 gmTs
  const nums = [...blob.matchAll(/gmTs["'=:\s]+(\d{6})/g)].map((x) => x[1]);
  if (nums.length) {
    const cnt = {};
    for (const n of nums) cnt[n] = (cnt[n] || 0) + 1;
    return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
  }
  return null;
}

/** 수집에 쓸 슬립 URL 결정: .env 에 gmTs 있으면 그대로, 없으면 자동 탐지. */
async function resolveSlipUrl(page) {
  if (/gmTs=\d/.test(cfg.protoUrl)) return cfg.protoUrl;
  const gmTs = await discoverGmTs(page);
  if (gmTs) {
    log(`현재 회차 자동 탐지: gmTs=${gmTs}`);
    return buildSlipUrl(gmTs);
  }
  warn('현재 회차(gmTs) 자동 탐지 실패 → gmId 만으로 시도(데이터가 비어있을 수 있음).');
  return cfg.protoUrl;
}

// ── 다음 수집 간격 계산 ───────────────────────────────────
/** 캡처 body 에서 가장 가까운 월드컵 승무패 경기 킥오프(ms). 없으면 null. */
function nearestUpcomingMs(body) {
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    return null;
  }
  const cs = j.compSchedules;
  if (!cs || !Array.isArray(cs.keys) || !Array.isArray(cs.datas)) return null;
  const k = cs.keys;
  const i = (n) => k.indexOf(n);
  const iItem = i('itemCode');
  const iLeague = i('leagueName');
  const iBet = i('betTypNm');
  const iBetId = i('betId');
  const iDate = i('gameDate');
  if (iDate < 0) return null;
  const now = Date.now();
  let min = Infinity;
  for (const r of cs.datas) {
    if (iItem >= 0 && r[iItem] !== 'SC') continue;
    if (iBet >= 0 && r[iBet] !== '승무패') continue;
    if (iBetId >= 0 && String(r[iBetId]) !== '1') continue;
    if (iLeague >= 0 && !String(r[iLeague] ?? '').includes('월드컵')) continue;
    const d = Number(r[iDate]);
    if (Number.isFinite(d) && d > now && d < min) min = d;
  }
  return min === Infinity ? null : min;
}
function intervalMinForBody(body) {
  const ms = nearestUpcomingMs(body);
  if (ms && ms - Date.now() <= cfg.nearWindowHours * 3_600_000) return cfg.nearIntervalMin;
  return cfg.baseIntervalMin;
}

// ── 저장/전송 ─────────────────────────────────────────────
async function dumpCandidates(candidates) {
  if (candidates.length === 0) {
    warn('배당 JSON 응답을 하나도 못 잡았습니다. 배당이 보이는 화면까지 이동했는지 확인하세요.');
    return;
  }
  await fs.mkdir(cfg.capturesDir, { recursive: true });
  log(`배당 후보 ${candidates.length}개:`);
  let n = 0;
  for (const c of candidates) {
    const file = path.join(cfg.capturesDir, `slip-${++n}.json`);
    await fs.writeFile(file, c.body, 'utf-8');
    const comp = c.body.includes('compSchedules') ? 'compSchedules✓' : 'compSchedules✗';
    log(`  [${n}] ${comp} ${c.body.length}B  ${c.url}`);
  }
  log(`→ captures\\slip-*.json 저장. node inspect.js slip-N.json 로 확인.`);
}

async function saveLastSent(body) {
  await fs.mkdir(cfg.capturesDir, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(cfg.capturesDir, 'last-sent.json'), body, 'utf-8').catch(() => {});
}

async function postToIngest(raw, token) {
  if (token?.cancelled) return;
  let res;
  try {
    res = await fetch(cfg.ingestUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ingest-token': cfg.ingestToken },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(cfg.navTimeout), // ingest 응답 hang 방지(이번 정지 최유력 원인)
    });
  } catch (err) {
    warn(
      `ingest 연결 실패(fetch failed): ${err?.message ?? err}\n` +
        `   → INGEST_URL 주소가 맞고 접속 가능한지 확인: ${cfg.ingestUrl}`,
    );
    return;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    warn(`ingest 실패 HTTP ${res.status}: ${JSON.stringify(body)}`);
    if (res.status === 422) {
      warn('422 = 승부식 파싱 0건. node inspect.js last-sent.json 로 응답 구조를 확인하세요.');
    }
    return;
  }
  log(`ingest 성공: ${JSON.stringify(body)}`);
}

/** 한 번 수집(슬립 URL 결정 → 캡처 → 전송). 캡처 body 반환(간격 계산용). */
async function collectAndPost(page, token) {
  const url = await resolveSlipUrl(page);
  if (token?.cancelled) return null;
  const candidates = await collectOnce(page, url);
  const best = pickBest(candidates);
  if (!best) {
    warn('배당 JSON 을 캡처하지 못했습니다.');
    return null;
  }
  if (token?.cancelled) return null;
  await saveLastSent(best.body);
  log(`전송 후보: ${best.url} (compSchedules ${best.comp ? '있음' : '없음'}, ${best.body.length}B)`);
  await postToIngest(best.body, token);
  return best.body;
}

// ── 단발 실행(--once / --capture / --login) ───────────────
async function runOnce(context) {
  const page = await context.newPage();
  try {
    const ok = await ensureSession(context, page);
    if (!ok) return;
    if (LOGIN_ONLY) {
      log('로그인 시드 완료. 이제 `npm run capture` 또는 `npm start` 를 실행하세요.');
      return;
    }
    if (CAPTURE_ONLY) {
      await dumpCandidates(await collectManual(page));
      return;
    }
    await collectAndPost(page);
  } finally {
    await page.close().catch(() => {});
  }
}

// ── 주기 루프(npm start / pm2) — 무중단(hang 방지) ─────────
// 사이클마다 새 브라우저를 띄우고 워치독으로 감싼다. 멈추면 브라우저를 강제 종료하고 다음 주기에 회복.
const loopState = {
  lastCollectAt: 0,
  collectIntervalMin: cfg.baseIntervalMin,
  currentBrowser: null, // 워치독이 멈춘 브라우저를 죽일 수 있게 보관
};

/** 한 사이클: 새 브라우저 → 세션확인(keep-alive) → 필요시 수집/전송. token 으로 취소 가능. */
async function runCycle(token) {
  const browser = await launchBrowser();
  loopState.currentBrowser = browser;
  try {
    const context = await newContextFromSession(browser); // 매번 세션 파일 재로딩
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(cfg.navTimeout);
      const ok = await probeLoggedIn(page); // 방문 자체가 keep-alive
      if (token.cancelled) return;
      if (!ok) {
        warn('세션 만료/없음 → `npm run login` 으로 재로그인하세요(다음 주기에 자동 반영).');
        return; // 예상 동작 — 실패로 카운트하지 않음
      }
      await context.storageState({ path: cfg.sessionFile }).catch(() => {});
      const due =
        loopState.lastCollectAt === 0 ||
        Date.now() - loopState.lastCollectAt >= loopState.collectIntervalMin * 60_000;
      if (due) {
        log('수집 시작…');
        const body = await collectAndPost(page, token);
        if (token.cancelled) return;
        if (body) {
          loopState.lastCollectAt = Date.now();
          loopState.collectIntervalMin = intervalMinForBody(body);
          log(`다음 수집까지 약 ${loopState.collectIntervalMin}분(가까운 경기 여부에 따라 조정).`);
        }
      }
    } finally {
      await withTimeout(context.close(), 5000, 'ctxclose').catch(() => {});
    }
  } finally {
    loopState.currentBrowser = null;
    await killBrowserHard(browser);
  }
}

async function runLoop() {
  const startedAt = Date.now();
  let fails = 0;
  log(
    `주기 수집 시작: 기본 ${cfg.baseIntervalMin}분 · 경기 ${cfg.nearWindowHours}시간 전부터 ` +
      `${cfg.nearIntervalMin}분 · keep-alive ${cfg.keepaliveMin}분 · 사이클상한 ` +
      `${cfg.cycleTimeoutMs / 1000}초 (Ctrl+C 종료)`,
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // 주기적 하드 재시작(누수 청소) — pm2 가 깨끗한 새 프로세스로 기동.
    if (Date.now() - startedAt > cfg.restartHours * 3_600_000) {
      log(`${cfg.restartHours}시간 경과 → 깨끗한 재시작(process.exit 0, pm2 재기동).`);
      process.exit(0);
    }
    log('tick…');
    const token = { cancelled: false };
    try {
      await withTimeout(runCycle(token), cfg.cycleTimeoutMs, 'cycle');
      fails = 0;
    } catch (err) {
      token.cancelled = true; // 멈춘(detached) 사이클의 부수효과(전송/세션쓰기) 차단
      fails += 1;
      warn(
        `사이클 실패/시간초과(${fails}/${cfg.maxFails}) → 브라우저 강제 종료:`,
        err?.message ?? err,
      );
      await killBrowserHard(loopState.currentBrowser);
      loopState.currentBrowser = null;
      if (fails >= cfg.maxFails) {
        warn('연속 실패 한계 → 프로세스 재시작(process.exit 1, pm2 가 재기동).');
        process.exit(1);
      }
    }
    const jitter = Math.floor((Math.random() * 2 - 1) * cfg.jitterSec * 1000);
    const waitMs = Math.max(60_000, cfg.keepaliveMin * 60_000 + jitter);
    await sleep(waitMs);
  }
}

async function main() {
  requireConfig();
  const single = ONCE || CAPTURE_ONLY || LOGIN_ONLY;
  if (single) {
    const browser = await launchBrowser();
    try {
      const context = await newContextFromSession(browser);
      if (await fileExists(cfg.sessionFile)) log(`기존 세션 복원(${path.basename(cfg.sessionFile)}).`);
      try {
        await runOnce(context);
      } finally {
        await context.close().catch(() => {});
      }
    } finally {
      await killBrowserHard(browser);
    }
  } else {
    await runLoop(); // 루프가 사이클마다 자체적으로 브라우저를 띄운다
  }
}

main().catch((err) => {
  console.error('[collector] 치명적 오류:', err?.message ?? err);
  process.exit(1);
});
