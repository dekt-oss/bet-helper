// 베트맨 승부식(1X2) 배당 자동 수집 에이전트 — 사용자 본인 PC(가정용 IP)에서 실행.
//
// 로그인 정책(중요): 베트맨 로그인은 자동입력/인증서 등으로 헤드리스 완전자동이 어렵다.
//   → 최초 1회 "뜬 크롬 창에서 직접 로그인"하면 세션(betman-session.json)이 저장되고,
//     이후에는 그 세션으로 무인 자동 수집한다. 세션 만료 시에만 다시 `npm run login`.
//   이 방식은 셀렉터 추측에 의존하지 않아 사이트가 바뀌어도 안 깨진다.
//
// 흐름: (세션 복원/직접 로그인) → 승부식 페이지의 배당 응답(compSchedules) 캡처
//       → bet-helper 앱의 /api/odds/ingest 로 POST. 파싱·매칭·저장은 앱이 전담.
//
// 실행:
//   npm run login     크롬 창에서 직접 로그인 1회 → 세션 저장
//   npm run capture   실데이터 캡처 1회(POST 안 함) → 앱 파서 보정용
//   npm run once      1회 수집 후 종료(cron)
//   npm start         주기 루프(pm2)

import 'dotenv/config';
import { chromium } from 'playwright-core';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
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
  // 회원 전용(승부식) 페이지 — 로그인 여부 판별 & 배당 캡처 대상
  protoUrl:
    process.env.BETMAN_PROTO_URL ??
    'https://www.betman.co.kr/main/mainPage/gamebuy/gameBuyMain.do',
  // 캡처 대상 응답 URL 부분 일치(콤마). 비워도 본문에 compSchedules 있으면 자동 인식.
  slipUrlMatch: (process.env.GAMESLIP_URL_MATCH ?? 'gameSlip.do,protoMatchList.do')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  channel: process.env.BROWSER_CHANNEL ?? '',
  headless: HEADFUL ? false : (process.env.HEADLESS ?? 'true') !== 'false',
  intervalMin: Number(process.env.INTERVAL_MINUTES ?? '12'),
  jitterSec: Number(process.env.JITTER_SECONDS ?? '120'),
  sessionFile: process.env.SESSION_FILE ?? path.join(HERE, 'betman-session.json'),
  capturesDir: path.join(HERE, 'captures'),
  navTimeout: Number(process.env.NAV_TIMEOUT_MS ?? '30000'),

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

// ── 브라우저 ──────────────────────────────────────────────
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

// ── 로그인 ────────────────────────────────────────────────

/** 회원 전용 페이지로 이동했을 때 로그인 필요 페이지로 안 튕기면 로그인된 것. */
async function probeLoggedIn(page) {
  try {
    await page.goto(cfg.protoUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeout });
    if (urlLooksLoggedOut(page.url())) return false;
    const body = await page.content().catch(() => '');
    if (body.includes('로그인이 필요')) return false;
    return true;
  } catch {
    return false;
  }
}

/** 뜬 창에서 사용자가 직접 로그인 → Enter → 세션 저장. (셀렉터 추측 의존 없음) */
async function manualLogin(context, page) {
  log('▶ 열린 크롬 창에서 베트맨에 "직접" 로그인하세요(아이디/비번/인증 등 사이트 방식대로).');
  await page.goto(cfg.homeUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeout }).catch(
    () => {},
  );
  await waitForEnter('   로그인을 모두 마쳤으면 이 창에서 Enter 를 누르세요… ');
  if (await probeLoggedIn(page)) {
    await context.storageState({ path: cfg.sessionFile });
    log(`로그인 확인 → 세션 저장 완료(${path.basename(cfg.sessionFile)}). 이후엔 무인 자동.`);
    return true;
  }
  warn('아직 로그인 안 된 것으로 보입니다. 창에서 로그인 완료 후 `npm run login` 을 다시 실행하세요.');
  return false;
}

/** 세션 보장: 유효하면 통과, 아니면 (headful)직접 로그인 / (headless)재시드 안내 throw. */
async function ensureSession(context, page) {
  if (await probeLoggedIn(page)) {
    log('세션 유효.');
    return true;
  }
  if (cfg.headless) {
    throw new Error(
      '세션이 없거나 만료됨. 먼저 `npm run login`(크롬 창이 뜸)으로 1회 직접 로그인해 세션을 시드하세요.',
    );
  }
  return manualLogin(context, page);
}

// ── 배당 캡처 ─────────────────────────────────────────────
// gameSlip.do 는 HTML 화면만 주고, 실제 배당 데이터는 페이지 JS 가 별도 XHR(JSON)로 받아온다.
// 그래서 "HTML 껍데기는 버리고 배당 신호(winAllot 등)가 든 JSON 응답만" 골라 수집한다.

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

/** 배당이 든 JSON 응답 후보들을 모은다(중복 URL 은 마지막 것으로 갱신). */
function makeCollector(candidates) {
  return async (res) => {
    const type = res.request().resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    let text;
    try {
      text = await res.text();
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

/** JSON 파싱 가능 + 배당 신호가 가장 뚜렷한 후보를 고른다. */
function pickBest(candidates) {
  const scored = candidates
    .map((c) => {
      let json = null;
      try {
        json = JSON.parse(c.body);
      } catch {
        /* not json */
      }
      const signal = (c.body.match(/winAllot|matchSeq|"allot"/g) || []).length;
      return { ...c, json, signal };
    })
    .sort((a, b) => (b.json ? 1 : 0) - (a.json ? 1 : 0) || b.signal - a.signal);
  return scored[0] ?? null;
}

/** 페이지를 띄워(필요시 사용자 직접 이동) 배당 JSON 후보들을 수집. */
async function collectCandidates(page, { manual }) {
  const candidates = [];
  const listener = makeCollector(candidates);
  page.on('response', listener);
  try {
    await page
      .goto(manual ? cfg.homeUrl : cfg.protoUrl, {
        waitUntil: 'networkidle',
        timeout: cfg.navTimeout,
      })
      .catch(() => {});
    for (let i = 0; i < 10 && candidates.length === 0; i++) await sleep(800);
    if (manual) {
      log('▶ 크롬 창에서 [프로토 승부식 → 축구 → 월드컵] 경기의 배당(승/무/패 숫자)이 보이는 화면으로 이동하세요.');
      log('   (경기를 클릭해 배당이 화면에 뜨게 하면 됩니다.)');
      await waitForEnter('   배당이 화면에 보이면 이 창에서 Enter… ');
      await sleep(1000);
    }
  } finally {
    page.off('response', listener);
  }
  return candidates;
}

/** 캡처 진단: 후보 JSON 들을 파일로 저장하고 요약을 출력. */
async function dumpCandidates(candidates) {
  if (candidates.length === 0) {
    warn('배당 JSON 응답을 하나도 못 잡았습니다. 크롬 창에서 실제 배당이 보이는 화면까지 이동했는지 확인하세요.');
    return;
  }
  await fs.mkdir(cfg.capturesDir, { recursive: true });
  log(`배당 후보 ${candidates.length}개 수집:`);
  let n = 0;
  for (const c of candidates) {
    const file = path.join(cfg.capturesDir, `slip-${++n}.json`);
    await fs.writeFile(file, c.body, 'utf-8');
    let parsed = '비-JSON';
    try {
      JSON.parse(c.body);
      parsed = 'JSON';
    } catch {
      /* */
    }
    log(`  [${n}] ${parsed} ${c.body.length}B  ${c.url}`);
    log(`      앞부분: ${c.body.slice(0, 300).replace(/\s+/g, ' ')}`);
  }
  log(`→ captures\\slip-*.json 저장됨. 'node inspect.js slip-1.json' 처럼 확인하거나 개발자에게 전달하세요.`);
}

async function postToIngest(raw) {
  const res = await fetch(cfg.ingestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ingest-token': cfg.ingestToken },
    body: JSON.stringify({ raw }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    warn(`ingest 실패 HTTP ${res.status}:`, body);
    if (res.status === 422) {
      warn('422 = 승부식 파싱 0건. `npm run capture` 로 실데이터를 떠서 앱 betman.ts 필드를 보정하세요.');
    }
    return;
  }
  log(`ingest 성공: ${JSON.stringify(body)}`);
}

// ── 사이클 ────────────────────────────────────────────────
async function runOnce(context) {
  const page = await context.newPage();
  try {
    const ok = await ensureSession(context, page);
    if (!ok) return;
    if (LOGIN_ONLY) {
      log('로그인 시드 완료. 이제 `npm run capture` 또는 `npm start` 를 실행하세요.');
      return;
    }

    const candidates = await collectCandidates(page, { manual: CAPTURE_ONLY });
    if (CAPTURE_ONLY) {
      await dumpCandidates(candidates);
      return;
    }
    const best = pickBest(candidates);
    if (!best) {
      warn('배당 JSON 을 캡처하지 못했습니다. (`npm run capture` 로 진단하거나 .env BETMAN_PROTO_URL 확인)');
      return;
    }
    await postToIngest(best.body);
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  requireConfig();

  const browser = await launchBrowser();
  const hasSession = await fileExists(cfg.sessionFile);
  const context = await browser.newContext({
    storageState: hasSession ? cfg.sessionFile : undefined,
    locale: 'ko-KR',
    userAgent: cfg.userAgent,
    viewport: { width: 1366, height: 900 },
  });
  if (hasSession) log(`기존 세션 복원(${path.basename(cfg.sessionFile)}).`);

  const single = ONCE || CAPTURE_ONLY || LOGIN_ONLY;
  try {
    if (single) {
      await runOnce(context);
    } else {
      log(`주기 수집 시작: ${cfg.intervalMin}분 ± ${cfg.jitterSec}초 (Ctrl+C 종료)`);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          await runOnce(context);
        } catch (err) {
          warn('사이클 실패(다음 주기 재시도):', err?.message ?? err);
        }
        const jitter = Math.floor((Math.random() * 2 - 1) * cfg.jitterSec * 1000);
        const waitMs = Math.max(60_000, cfg.intervalMin * 60_000 + jitter);
        log(`다음 수집까지 ${Math.round(waitMs / 1000)}초 대기…`);
        await sleep(waitMs);
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[collector] 치명적 오류:', err?.message ?? err);
  process.exit(1);
});
