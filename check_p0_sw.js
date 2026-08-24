/* P0-SW 行为回归：在 Node 里真实驱动 sw.js 的 fetch 处理器。
   红 = HTML 等静态资源是 cache-first（改版后用户看到的还是旧缓存）。
   期望：非词库资源 network-first（在线拿新版、离线回退缓存）；bank-* 大文件 cache-first。 */
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");

function makeWorld({ netOk = true, netBody = "NEW" }) {
  const store = new Map([["https://site/css/style.css", { body: "OLD-CACHED" }]]);
  const cacheObj = {
    match: async req => {
      const hit = store.get(req.url);
      return hit ? { ok: true, body: hit.body, url: req.url, _c: true } : undefined;
    },
    put: async (req, res) => store.set(req.url, { body: res.body })
  };
  const caches = {
    match: async req => {
      const hit = store.get(req.url);
      return hit ? { ok: true, body: hit.body, url: req.url, _c: true } : undefined;
    },
    open: async () => cacheObj,
    keys: async () => ["cet4wb-old"],
    delete: async () => true
  };
  const fetchFn = async req => {
    if (!netOk) throw new Error("offline");
    return { ok: true, body: netBody, url: req.url, clone() { return this; } };
  };
  const loc = { origin: "https://site" };
  const selfStub = {
    _evts: {},
    addEventListener(n, f) { this._evts[n] = f; }
  };
  const returnedSelf = new Function("self", "caches", "location", "fetch",
    '"use strict";' + src + ";return self;")(
    selfStub, caches, loc, fetchFn);
  const handlers = returnedSelf._evts;

  async function handle(url) {
    let out = null;
    const evt = {
      request: { method: "GET", url },
      respondWith: p => { out = p; }
    };
    handlers.fetch(evt);
    return out ? await out : null;
  }
  return { handle, store };
}

let fail = 0;
const ok = (c, name) => { console.log((c ? "PASS" : "FAIL") + "  " + name); if (!c) fail++; };

(async () => {
  /* 1. CSS/HTML：在线时必须返回网络新版（network-first）*/
  {
    const w = makeWorld({});
    const res = await w.handle("https://site/css/style.css");
    ok(res && res.body === "NEW", "在线：样式返回新版而非旧缓存 (拿到 " + (res && res.body) + ")");
    ok(w.store.get("https://site/css/style.css").body === "NEW", "在线：新版本已回写缓存");
  }

  /* 2. CSS/HTML：离线时回退到旧缓存（不白屏）*/
  {
    const w = makeWorld({ netOk: false });
    const res = await w.handle("https://site/css/style.css");
    ok(res && res.body === "OLD-CACHED", "离线：回退旧缓存可用");
  }

  /* 3. bank-* 大词库：cache-first（命中就不走网络）*/
  {
    const w = makeWorld({});
    w.store.set("https://site/js/bank-full.js", { body: "BIG-DATA" });
    let netTouched = false;
    const res = await w.handle("https://site/js/bank-full.js");
    void netTouched;
    ok(res && res.body === "BIG-DATA", "词库大文件：命中缓存直接用");
  }

  /* 4. 版本号必须升级（触发旧缓存清空）*/
  ok(/cet4wb-(?!v1\b)[a-z0-9-]+/.test(src) && !/"cet4wb-v1"/.test(src),
     "CACHE 版本号已离开 v1");

  process.exit(fail ? 1 : 0);
})();
