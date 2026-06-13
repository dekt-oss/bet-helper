const FIELDS = ['ingestUrl', 'ingestToken', 'slipApiUrl', 'slipMethod', 'slipBody', 'periodMinutes'];

async function load() {
  const c = await chrome.storage.sync.get();
  for (const k of FIELDS) {
    if (c[k] != null && document.getElementById(k)) document.getElementById(k).value = c[k];
  }
}

async function save() {
  const v = {};
  for (const k of FIELDS) v[k] = document.getElementById(k).value.trim();
  v.periodMinutes = Math.max(10, parseInt(v.periodMinutes, 10) || 15);

  const msg = document.getElementById('msg');

  // 앱 도메인으로 background 가 fetch 하려면 해당 origin 의 host 권한이 필요하다.
  try {
    const origin = new URL(v.ingestUrl).origin + '/*';
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      msg.style.color = '#dc2626';
      msg.textContent = '앱 도메인 접근 권한이 거부되어 전송이 안 됩니다.';
      return;
    }
  } catch {
    msg.style.color = '#dc2626';
    msg.textContent = 'ingest URL 이 올바른 주소가 아닙니다.';
    return;
  }

  await chrome.storage.sync.set(v);
  chrome.runtime.sendMessage({ type: 'RESCHEDULE' });
  msg.style.color = '#16a34a';
  msg.textContent = '저장됨 · ' + new Date().toLocaleTimeString();
}

document.getElementById('save').addEventListener('click', save);
load();
