// Bet-Helper 베트맨 배당 수집기 — service worker (자동 학습 + 주기 재요청).
//
// 흐름:
//  1) 사용자가 베트맨 승부식 페이지를 한 번 열면, content/inject 가 배당 응답을 캡처(BETMAN_CAPTURE)
//     → 그 요청(url/method/body)을 "학습"해 저장하고, 즉시 앱으로 전송한다.
//  2) 이후 주기(alarm)마다 학습한 요청을 백그라운드 베트맨 탭에서 사용자 세션으로 재요청 → 전송.
// 프록시/IP 우회 없음. 수집은 사용자 브라우저에서만 일어난다.

const ALARM = 'betman-collect';
const CFG_DEFAULTS = { ingestUrl: '', ingestToken: '', periodMinutes: 360 }; // 기본 6시간

async function getCfg() {
  const c = await chrome.storage.sync.get(CFG_DEFAULTS);
  return { ...CFG_DEFAULTS, ...c };
}
async function setStatus(s) {
  await chrome.storage.local.set({ lastStatus: { ...s, at: new Date().toISOString() } });
}
async function getLearned() {
  const { learnedRequest } = await chrome.storage.local.get('learnedRequest');
  return learnedRequest || null;
}

chrome.runtime.onInstalled.addListener(scheduleAlarm);
chrome.runtime.onStartup.addListener(scheduleAlarm);

async function scheduleAlarm() {
  const { periodMinutes } = await getCfg();
  const minutes = Math.max(60, Number(periodMinutes) || 360); // 최소 1시간
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { periodInMinutes: minutes });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== ALARM) return;
  const delay = Math.floor(Math.random() * 120000); // 0~2분 jitter
  setTimeout(() => replayCollect().catch((e) => setStatus({ ok: false, error: String(e) })), delay);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'BETMAN_CAPTURE') {
    onCapture(msg).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === 'COLLECT_NOW') {
    replayCollect().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === 'RESCHEDULE') {
    scheduleAlarm().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

// 사용자가 베트맨을 열어 배당 응답이 캡처됨 → 요청을 학습 저장 + 즉시 전송.
async function onCapture({ url, method, body, text }) {
  await chrome.storage.local.set({ learnedRequest: { url, method: method || 'GET', body: body || null } });
  await sendToApp(text, '브라우저에서 자동 포착');
}

// 베트맨 페이지 컨텍스트(same-origin)에서 사용자 세션 쿠키로 학습한 요청을 재요청한다.
// 직렬화되어 주입되므로 외부 변수 참조 금지.
async function fetchInPage(url, method, body) {
  const opts = { method, credentials: 'include', headers: {} };
  if (method !== 'GET' && body != null) {
    opts.headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    opts.body = body;
  }
  const res = await fetch(url, opts);
  return await res.text();
}

function waitForComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('베트맨 페이지 로딩 시간초과'));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// 주기/수동 수집: 학습한 요청을 백그라운드 탭에서 재요청 → 전송.
async function replayCollect() {
  const learned = await getLearned();
  if (!learned) {
    const error = '아직 학습된 요청이 없습니다. 베트맨 승부식 페이지를 한 번 열어주세요.';
    await setStatus({ ok: false, error });
    return { ok: false, error };
  }
  const origin = new URL(learned.url).origin;
  const tab = await chrome.tabs.create({ url: origin + '/', active: false });
  try {
    await waitForComplete(tab.id);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fetchInPage,
      args: [learned.url, learned.method || 'GET', learned.body || null],
    });
    const text = results?.[0]?.result;
    if (!text) throw new Error('베트맨 응답이 비어있습니다(세션 만료 시 다시 로그인).');
    return await sendToApp(text, '주기 재요청');
  } finally {
    if (tab?.id != null) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// 캡처한 원본(text)을 앱 ingest 로 전송.
async function sendToApp(text, how) {
  const cfg = await getCfg();
  if (!cfg.ingestUrl || !cfg.ingestToken) {
    const error = '옵션에서 앱 주소(ingestUrl)와 토큰을 설정하세요.';
    await setStatus({ ok: false, error });
    return { ok: false, error };
  }
  const resp = await fetch(cfg.ingestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ingest-token': cfg.ingestToken },
    body: JSON.stringify({ raw: text }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    const error = (data && data.error) || `ingest 실패 (HTTP ${resp.status})`;
    await setStatus({ ok: false, error });
    return { ok: false, error };
  }
  await setStatus({ ok: true, count: data.count, how });
  return { ok: true, count: data.count };
}
