/* 办事卡片 Service Worker
 * 策略：
 *  - 页面（index.html / 目录）：先用缓存里的副本秒开（GitHub 慢或打不开时也能用），同时后台向网络请求最新版（绕过 HTTP 缓存）；
 *    发现版本变了就更新缓存，并通知页面：页面在你没输入时自动刷新到新版。第一次访问（没有缓存）才需要等网络。
 *  - 图标、manifest：先用缓存，同时后台更新（stale-while-revalidate）。
 *  - lib/ 下的 PDF / 压缩包解码器：缓存优先（改了解码器文件时请同时把 VERSION 加 1）。
 *  - 只处理本站同源的 GET 请求；其他请求（HEAD/POST、跨域）一律不拦截。
 *  - 缓存里只有网页本身的静态文件；用户数据在 localStorage，Service Worker 不读不写。
 * 改了本文件任何字节，浏览器就会安装新版 Service Worker；需要强制清掉旧缓存时，把 VERSION 加 1。
 */
var VERSION = 'v6';
var CACHE = 'banshi-' + VERSION;
var PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    /* 用 reload 绕开 HTTP 缓存；单个文件失败（例如还没上传图标）不应让安装整体失败 */
    return Promise.all(PRECACHE.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return /^banshi-/.test(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function put(req, res) {
  if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
  return res;
}
function stamp(r) { return r ? (r.headers.get('etag') || r.headers.get('last-modified') || '') : ''; }
function tell() { return self.clients.matchAll({ type: 'window' }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ type: 'banshi-updated' }); }); }); }

function page(e) {
  var req = e.request, key = new URL('index.html', self.registration.scope).href;
  return caches.match(key).then(function (hit) {
    var net = fetch(req.url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok || res.type !== 'basic') return res;
      var changed = hit && stamp(res) && stamp(hit) && stamp(res) !== stamp(hit), copy = res.clone();
      return caches.open(CACHE).then(function (c) { return c.put(key, copy); }).then(function () { return changed ? tell() : 0; }).then(function () { return res; });
    });
    if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
    return net.catch(function () { return caches.match(key); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/\/lib\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req).then(function (res) { return put(req, res); }); }));
    return;
  }
  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname)) { e.respondWith(page(e)); return; }
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req, { cache: 'no-cache' }).then(function (res) { return put(req, res); }).catch(function () { return hit; });
    return hit || net;
  }));
});
