// Bet-Helper 베트맨 배당 수집기 — service worker.
//
// 동작: 주기(alarm)마다 베트맨을 백그라운드 탭으로 열고, 그 탭(= 사용자 로그인 세션,
// 베트맨과 same-origin) 안에서 gameSlip.do 응답을 사용자 쿠키로 가져온 뒤,
// 앱의 /api/odds/ingest 로 전송한다. 프록시/IP 우회 없음 — 사용자 본인 브라우저에서만 동작.

const ALARM = 'betman-collect';

const DEFAULTS = {
  ingestUrl: '',
  ingestToken: '',
  slipApiUrl: '',
  slipMethod: 'GET',
  slipBody: '',
  periodMinutes: 15,
};

async function getCfg() {
  const c = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...c };
}

async function setStatus(s) {
  await chrome.storage.local.set({ lastStatus: { ...s, at: new Date().toISOString() } });
}

chrome.runtime.onInstalled.addListener(scheduleAlarm);
chrome.runtime.onStartup.addListener(scheduleAlarm);

async function scheduleAlarm() {
  const { periodMinutes } = await getCfg();
  const minutes = Math.max(10, Number(periodMinutes) || 15); // 최소 10분(점잖은 빈도)
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { periodInMinutes: minutes });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== ALARM) return;
  // 정확한 주기 고정을 피하려 0~120초 랜덤 지연.
  const delay = Math.floor(Math.random() * 120000);
  setTimeout(() => {
    runCollect().catch((e) => setStatus({ ok: false, error: String(e) }));
  }, delay);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'COLLECT_NOW') {
    runCollect()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async
  }
  if (msg?.type === 'RESCHEDULE') {
    scheduleAlarm().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

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

// 베트맨 페이지 컨텍스트(same-origin)에서 실행된다. 사용자 세션 쿠키로 gameSlip 응답을 받는다.
// 주의: 이 함수는 직렬화되어 페이지에 주입되므로 외부 변수를 참조하면 안 된다.
async function fetchInPage(url, method, body) {
  const opts = { method, credentials: 'include', headers: {} };
  if (method === 'POST') {
    opts.headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    opts.body = body || '';
  }
  const res = await fetch(url, opts);
  return await res.text();
}

async function runCollect() {
  const cfg = await getCfg();
  if (!cfg.ingestUrl || !cfg.ingestToken || !cfg.slipApiUrl) {
    const error = '옵션에서 ingestUrl / ingestToken / slipApiUrl 을 먼저 설정하세요.';
    await setStatus({ ok: false, error });
    return { ok: false, error };
  }

  let origin;
  try {
    origin = new URL(cfg.slipApiUrl).origin;
  } catch {
    const error = 'slipApiUrl 이 올바른 URL 이 아닙니다.';
    await setStatus({ ok: false, error });
    return { ok: false, error };
  }

  const tab = await chrome.tabs.create({ url: origin + '/', active: false });
  try {
    await waitForComplete(tab.id);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fetchInPage,
      args: [cfg.slipApiUrl, cfg.slipMethod || 'GET', cfg.slipBody || ''],
    });
    const raw = results?.[0]?.result;
    if (!raw) throw new Error('베트맨 응답이 비어있습니다. 로그인/세션을 확인하세요.');

    const resp = await fetch(cfg.ingestUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ingest-token': cfg.ingestToken },
      body: JSON.stringify({ raw }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      const error = data.error || `ingest 실패 (HTTP ${resp.status})`;
      await setStatus({ ok: false, error });
      return { ok: false, error };
    }
    await setStatus({ ok: true, count: data.count });
    return { ok: true, count: data.count };
  } finally {
    if (tab?.id != null) chrome.tabs.remove(tab.id).catch(() => {});
  }
}
