async function render() {
  const [{ lastStatus }, { learnedRequest }] = await Promise.all([
    chrome.storage.local.get('lastStatus'),
    chrome.storage.local.get('learnedRequest'),
  ]);
  const learn = document.getElementById('learn');
  learn.textContent = learnedRequest
    ? '✅ 베트맨 요청 학습됨'
    : '⚠️ 아직 미학습 — 베트맨 승부식 페이지를 한 번 여세요';

  const el = document.getElementById('status');
  if (!lastStatus) {
    el.textContent = '아직 수집 기록이 없습니다.';
    return;
  }
  const when = new Date(lastStatus.at).toLocaleString();
  el.textContent = lastStatus.ok
    ? `✅ ${lastStatus.count}건 저장 (${lastStatus.how || ''}) · ${when}`
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
