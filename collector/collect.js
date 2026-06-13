// 베트맨 승부식(1X2) 배당 자동 수집 에이전트 — 사용자 본인 PC/홈서버(가정용 IP)에서 실행.
//
// 흐름: 세션 복원/자동 로그인 → 승부식 페이지에서 gameSlip.do 응답(raw) 캡처
//       → bet-helper 앱의 /api/odds/ingest 로 POST(x-ingest-token).
// 파싱·매칭·저장은 앱(ingestBetmanRaw → parseBetmanGameSlip → upsertOdds)이 전담한다.
// 이 스크립트는 "정상 방문자로서" 본인 세션 쿠키로 화면에 보이는 배당을 가져올 뿐이며,
// 프록시/IP 로테이션/안티봇 무력화 같은 우회 장치는 일절 사용하지 않는다.
//
// 실행:
//   npm run capture   첫 회(헤드풀): 로그인 + raw 를 captures/ 에 덤프(POST 안 함) → 파서 보정용
//   npm run login     헤드풀 로그인만 수행해 세션(betman-session.json) 시드
//   npm run once      1회 수집 후 종료(cron 용)
//   npm start         주기 루프(pm2 용)
//
// 환경변수(.env): .env.example 참고. 베트맨 DOM/URL 은 사이트 개편으로 바뀔 수 있어
// 셀렉터·URL 을 전부 env 로 빼두었다(코드 수정 없이 교체 가능).

import 'dotenv/config';
import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── 설정 ──────────────────────────────────────────────────
const ARGV = new Set(process.argv.slice(2));
const ONCE = ARGV.has('--once');
const CAPTURE_ONLY = ARGV.has('--capture-only');
const LOGIN_ONLY = ARGV.has('--login-only');
const HEADFUL = ARGV.has('--headful');

const cfg = {
  id: process.env.BETMAN_ID ?? '',
  pw: process.env.BETMAN_PW ?? '',
  ingestUrl: process.env.INGEST_URL ?? '',
  ingestToken: process.env.ODDS_INGEST_TOKEN ?? '',

  // 베트맨 URL (사이트 개편 시 .env 로 교체)
  loginUrl:
    process.env.BETMAN_LOGIN_URL ?? 'https://www.betman.co.kr/main/mainPage/member/loginPage.do',
  protoUrl:
    process.env.BETMAN_PROTO_URL ??
    'https://www.betman.co.kr/main/mainPage/gamebuy/protoMatchList.do',
  // 캡처 대상 응답 URL 식별 패턴(부분 일치, 콤마 구분 가능)
  slipUrlMatch: (process.env.GAMESLIP_URL_MATCH ?? 'gameSlip.do,protoMatchList.do')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // 로그인 폼 셀렉터(베트맨 DevTools 로 확인 후 .env 로 교체 권장)
  idSel: process.env.BETMAN_ID_SELECTOR ?? '#id, input[name="userId"], input[name="loginId"]',
  pwSel: process.env.BETMAN_PW_SELECTOR ?? '#pw, input[name="password"], input[name="loginPw"]',
  submitSel:
    process.env.BETMAN_SUBMIT_SELECTOR ??
    'button[type="submit"], a.btn_login, #loginBtn, .login_btn',
  // 로그인 성공 마커(로그인 후에만 보이는 요소). 비어있으면 URL 변화로 판단.
  loggedInSel: process.env.BETMAN_LOGGEDIN_SELECTOR ?? 'a[href*="logout"], .logout, #logout',

  headless: HEADFUL ? false : (process.env.HEADLESS ?? 'true') !== 'false',
  intervalMin: Number(process.env.INTERVAL_MINUTES ?? '12'),
  jitterSec: Number(process.env.JITTER_SECONDS ?? '120'),
  sessionFile: process.env.SESSION_FILE ?? path.join(HERE, 'betman-session.json'),
  capturesDir: path.join(HERE, 'captures'),
  navTimeout: Number(process.env.NAV_TIMEOUT_MS ?? '20000'),

  // betman.ts 의 BETMAN_HEADERS UA 와 동일하게 맞춤(일관성).
  userAgent:
    process.env.BETMAN_USER_AGENT ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

// ── 유틸 ──────────────────────────────────────────────────
const log = (...a) => console.info(`[collector ${new Date().toISOString()}]`, ...a);
const warn = (...a) => console.warn(`[collector ${new Date().toISOString()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireConfig() {
  const missing = [];
  if (!cfg.id) missing.push('BETMAN_ID');
  if (!cfg.pw) missing.push('BETMAN_PW');
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

function urlMatchesSlip(url) {
  return cfg.slipUrlMatch.some((m) => url.includes(m));
}

// ── 핵심 단계 ─────────────────────────────────────────────

/** 로그인 상태인지 페이지에서 확인. 마커 셀렉터가 보이면 true. */
async function isLoggedIn(page) {
  if (!cfg.loggedInSel) return false;
  try {
    const el = await page.$(cfg.loggedInSel);
    return Boolean(el);
  } catch {
    return false;
  }
}

/**
 * 자동 로그인. 성공 시 storageState 를 저장한다.
 * 캡차/2FA/구조변경으로 실패하면 명확한 안내와 함께 throw(이번 사이클만 실패).
 */
async function login(context, page) {
  log('로그인 시도…');
  await page.goto(cfg.loginUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeout });

  // 이미 로그인된 세션이면 스킵
  if (await isLoggedIn(page)) {
    log('이미 로그인 상태(세션 유효).');
    return;
  }

  const idInput = await page.waitForSelector(cfg.idSel, { timeout: cfg.navTimeout }).catch(() => null);
  const pwInput = await page.$(cfg.pwSel);
  if (!idInput || !pwInput) {
    throw new Error(
      '로그인 입력란을 못 찾음. 베트맨 로그인 페이지 구조가 바뀌었거나 셀렉터(.env BETMAN_ID/PW_SELECTOR)가 틀림. ' +
        'HEADLESS=false(npm run login)로 직접 확인하세요.',
    );
  }
  await idInput.fill(cfg.id);
  await pwInput.fill(cfg.pw);

  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: cfg.navTimeout }).catch(() => {}),
    page.click(cfg.submitSel).catch(async () => {
      // 버튼 못 누르면 Enter 로 제출 시도
      await pwInput.press('Enter').catch(() => {});
    }),
  ]);
  await sleep(1500);

  if (!(await isLoggedIn(page))) {
    throw new Error(
      '로그인 실패(캡차/2FA/자격증명 오류 가능). HEADLESS=false(npm run login)로 1회 수동 로그인해 ' +
        '세션을 시드한 뒤 헤드리스로 재사용하세요.',
    );
  }
  await context.storageState({ path: cfg.sessionFile });
  log(`로그인 성공 → 세션 저장(${path.basename(cfg.sessionFile)}).`);
}

/** 승부식 페이지를 열어 gameSlip 응답(raw)을 네트워크 인터셉트로 캡처. */
async function captureSlip(page) {
  let raw = null;
  const onResponse = async (res) => {
    if (raw) return;
    if (!urlMatchesSlip(res.url())) return;
    try {
      const text = await res.text();
      if (text && text.trim()) raw = text;
    } catch {
      /* 본문 못 읽으면 무시 */
    }
  };
  page.on('response', onResponse);
  try {
    await page.goto(cfg.protoUrl, { waitUntil: 'networkidle', timeout: cfg.navTimeout });
    // XHR 가 지연 로딩될 수 있어 잠시 더 대기
    for (let i = 0; i < 10 && !raw; i++) await sleep(800);
  } finally {
    page.off('response', onResponse);
  }
  return raw;
}

async function dumpCapture(raw) {
  await fs.mkdir(cfg.capturesDir, { recursive: true });
  const file = path.join(cfg.capturesDir, `gameSlip-${Date.now()}.json`);
  await fs.writeFile(file, raw, 'utf-8');
  log(`캡처 저장: ${path.relative(HERE, file)} (${raw.length} bytes)`);
  log('→ 이 파일의 compSchedules.keys 를 보고 src/lib/data-sources/betman.ts 의 필드/필터를 보정하세요.');
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
      warn('422 = 승부식 파싱 0건. npm run capture 로 실데이터를 떠서 betman.ts 필드를 보정하세요.');
    }
    return;
  }
  log(`ingest 성공: ${JSON.stringify(body)}`);
}

/** 한 사이클: (필요시)로그인 → 캡처 → (캡처덤프|POST). 브라우저 컨텍스트 재사용. */
async function runCycle(context) {
  const page = await context.newPage();
  try {
    if (!(await isLoggedIn(page))) {
      // 세션 페이지 직접 확인을 위해 메인/로그인 페이지 방문은 login() 내부에서 수행
      await login(context, page);
    }
    if (LOGIN_ONLY) {
      log('로그인만 수행(--login-only) 완료.');
      return;
    }

    const raw = await captureSlip(page);
    if (!raw) {
      warn('gameSlip 응답을 캡처하지 못함. 승부식 탭/URL(.env BETMAN_PROTO_URL, GAMESLIP_URL_MATCH) 확인 필요.');
      return;
    }
    if (CAPTURE_ONLY) {
      await dumpCapture(raw);
      return;
    }
    // 정상 경로: 캡처본도 남기고(최근 1개 디버그용) ingest 전송
    await dumpCapture(raw).catch(() => {});
    await postToIngest(raw);
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  requireConfig();

  const browser = await chromium.launch({ headless: cfg.headless });
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
      await runCycle(context);
    } else {
      log(`주기 수집 시작: ${cfg.intervalMin}분 ± ${cfg.jitterSec}초 (Ctrl+C 종료)`);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          await runCycle(context);
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
