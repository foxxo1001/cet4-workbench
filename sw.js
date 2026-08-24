/* CET-4 作战台 Service Worker：cache-first 静态资源，词库数据大文件也离线可用 */
const CACHE = "cet4wb-v1";
const ASSETS = [
  "/", "/index.html", "/banks.html", "/plan.html", "/stats.html", "/404.html",
  "/css/style.css", "/manifest.json",
  "/js/store.js", "/js/app.js", "/js/words.js", "/js/banks.js", "/js/plan.js", "/js/stats.js",
  "/js/bank-core.js", "/js/bank-freq.js", "/js/bank-exam.js", "/js/bank-full.js", "/js/exam.js",
  "/exam.html",
  "/icons/icon-192.png", "/icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // 同源静态资源：cache-first，后台更新
  e.respondWith(
    caches.match(e.request).then(hit => {
      const fetching = fetch(e.request).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || fetching;
    })
  );
});
