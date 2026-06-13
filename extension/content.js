// 베트맨 페이지(isolated world)에서 실행 — MAIN world 후킹 스크립트(inject.js)를 페이지에 삽입하고,
// 그 스크립트가 postMessage 로 보낸 캡처 결과를 background 로 전달한다.
(function () {
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('inject.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch (_) {}

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.source !== 'betman-collector' || !d.text) return;
    chrome.runtime.sendMessage({
      type: 'BETMAN_CAPTURE',
      url: d.url,
      method: d.method || 'GET',
      body: d.body || null,
      text: d.text,
    });
  });
})();
