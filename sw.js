/* CET-4 作战台 Service Worker
   - 页面 / 样式 / 脚本：network-first（在线优先拿新版并回写缓存，离线回退旧缓存）→ 改版后用户刷新即见新版本
   - 词库大文件（bank-*.js，约 2MB）：cache-first（命中直接用，保证秒开与离线）
   发布了会变动的静态资源时，务必把 CACHE 里的版本号递增一位以清空旧缓存 */
const CACHE = "cet4wb-v3";
const BANK_RE = /\/js\/bank-[a-z]+\.js$/;
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
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  /* 词库大文件：cache-first（数据不变式资源） */
  if (BANK_RE.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }))
    );
    return;
  }

  /* 其余（HTML/CSS/JS/图标）：network-first */
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then(hit => hit || caches.match("/404.html"))
    )
  );
});
