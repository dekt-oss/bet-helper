// 베트맨 페이지(MAIN world)에서 실행 — 페이지가 보내는 배당 요청을 가로채 응답을 캡처한다.
// 사용자가 베트맨을 평소처럼 보기만 해도 배당 응답을 자동 포착한다.
// 캡처한 요청 정보(url/method/body)는 background 가 이후 주기적으로 재요청하는 데 쓴다.
(function () {
  // 배당 응답으로 보이는지: 베트맨 승부식 JSON 은 compSchedules / winAllot 를 포함한다.
  function looksLikeOdds(url, text) {
    if (typeof text !== 'string' || text.length < 20) return false;
    if (/compSchedules|winAllot|drawAllot|loseAllot/.test(text)) return true;
    return false;
  }

  function report(detail) {
    try {
      window.postMessage({ source: 'betman-collector', ...detail }, '*');
    } catch (_) {}
  }

  // fetch 후킹
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input?.url;
      const method = (init && init.method) || (typeof input === 'object' && input?.method) || 'GET';
      const body = (init && init.body) || null;
      res
        .clone()
        .text()
        .then((text) => {
          if (looksLikeOdds(url, text)) {
            report({ url, method: String(method).toUpperCase(), body: typeof body === 'string' ? body : null, text });
          }
        })
        .catch(() => {});
    } catch (_) {}
    return res;
  };

  // XMLHttpRequest 후킹
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__bm = { method: String(method || 'GET').toUpperCase(), url };
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    this.addEventListener('load', function () {
      try {
        const text = this.responseText;
        const info = this.__bm || {};
        if (looksLikeOdds(info.url, text)) {
          report({ url: info.url, method: info.method, body: typeof body === 'string' ? body : null, text });
        }
      } catch (_) {}
    });
    return origSend.apply(this, arguments);
  };
})();
