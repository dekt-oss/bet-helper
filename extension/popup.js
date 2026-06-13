async function render() {
  const { lastStatus } = await chrome.storage.local.get('lastStatus');
  const el = document.getElementById('status');
  if (!lastStatus) {
    el.textContent = '아직 수집 기록이 없습니다.';
    return;
  }
  const when = new Date(lastStatus.at).toLocaleString();
  el.textContent = lastStatus.ok
    ? `✅ ${lastStatus.count}건 저장 · ${when}`
    : `❌ ${lastStatus.error} · ${when}`;
}

document.getElementById('now').addEventListener('click', () => {
  const btn = document.getElementById('now');
  btn.disabled = true;
  document.getElementById('status').textContent = '수집 중…';
  chrome.runtime.sendMessage({ type: 'COLLECT_NOW' }, () => {
    btn.disabled = false;
    render();
  });
});

document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

render();
