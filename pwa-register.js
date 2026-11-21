/* 注册 Service Worker，并按“设置”里的频率检查新版本；有新版且你没在输入时自动刷新。
 * 路径全部相对当前页面，所以放在 /Notification_Info_Extraction/ 下或任何子目录都能用。
 * 暴露 window.banshiPwa：getMin / setMin（后台刷新频率，单位分钟，0 = 不自动检查）。 */
(function () {
  var KEY = 'banshi-refresh-min', DEF = 60;
  function getMin() { try { var v = localStorage.getItem(KEY); if (v !== null && +v >= 0) return +v; } catch (e) {} return DEF; }
  var page = location.pathname.replace(/[^\/]*$/, '') + 'index.html';
  var baseline = '', pending = false, lastCheck = Date.now(), timer = 0, regP = null;

  function stamp() {
    return fetch(page, { method: 'HEAD', cache: 'no-cache' }).then(function (r) {
      return r.ok ? (r.headers.get('etag') || r.headers.get('last-modified') || '') : '';
    }).catch(function () { return ''; });
  }
  /* 正在输入、编辑、看弹窗、锁屏时不刷新，避免丢内容 */
  function idle() {
    var src = document.getElementById('src');
    return !(src && src.value.trim()) && !document.querySelector('.ov, .fb-mask, #side.open, #settings:not([hidden]), body.locking, .card textarea') &&
      !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
  }
  function loopOk() { try { var n = +(sessionStorage.getItem('banshi-rl') || 0), t = +(sessionStorage.getItem('banshi-rlt') || 0), now = Date.now(); if (now - t > 600000) n = 0; if (n >= 2) return false; sessionStorage.setItem('banshi-rl', n + 1); sessionStorage.setItem('banshi-rlt', now); } catch (e) {} return true; }
  function apply() { if (idle()) { if (loopOk()) location.reload(); } else pending = true; }
  function check() {
    lastCheck = Date.now();
    if (regP) regP.then(function (r) { if (r) r.update().catch(function () {}); });
    stamp().then(function (s) { if (!s) return; if (!baseline) baseline = s; else if (s !== baseline) apply(); });
  }
  function schedule() {
    clearTimeout(timer); var m = getMin(); if (!m) return;
    timer = setTimeout(function () { check(); schedule(); }, m * 60 * 1000);
  }
  window.banshiPwa = { getMin: getMin, setMin: function (m) { try { localStorage.setItem(KEY, String(m)); } catch (e) {} schedule(); } };

  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'banshi-updated' && getMin()) apply(); });

  window.addEventListener('load', function () {
    regP = navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(function () { return null; });
    schedule();
    /* 空闲时把解码器预先缓存，之后离线也能读 PDF / Word / 压缩包 */
    var warm = function () { ['lib/jszip.min.js', 'lib/pdf.min.mjs', 'lib/pdf.worker.min.mjs'].forEach(function (u) { fetch(u).catch(function () {}); }); };
    setTimeout(function () { (window.requestIdleCallback || setTimeout)(warm); }, 8000);
    setTimeout(function () { stamp().then(function (s) { baseline = s; }); }, 3000);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (pending && idle() && loopOk()) { location.reload(); return; }
    var m = getMin(); if (m && Date.now() - lastCheck >= m * 60 * 1000) check();
  });
})();
