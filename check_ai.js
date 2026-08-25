/* AI 讲词 MVP 行为回归：
   A) functions/api/ai.js 单元：无key→500说明、正常转发→{content}、上游挂→502
   B) 前端：未启用不注入按钮；启用后 reveal 出现按钮→点击调 /api/ai→渲染；
      同一词第二次点击走缓存不再发请求；超过日上限被拦截
   用法: node check_ai.js */
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");

let fail = 0;
const ok = (c, name) => { console.log((c ? "PASS" : "FAIL") + "  " + name); if (!c) fail++; };

/* ---------- A) Pages Function ---------- */
function loadFn(envObj, upstreamImpl) {
  const src = read("functions/api/ai.js").replace(/export\s+/g, "");
  const factory = new Function("fetch",
    '"use strict";' + src + "\nreturn { onRequestPost };");
  return factory(upstreamImpl);
}
const jsonRes = (body, status) => ({
  status: status || 200,
  ok: (status || 200) < 400,
  headers: { get: () => "application/json" },
  json: async () => body
});

(async () => {
  /* A1 无 key → 500 且带中文说明 */
  {
    const f = loadFn(null);
    const r = await f.onRequestPost({ request: { json: async () => ({ user: "hi" }) }, env: {} });
    ok(r.status === 500, "无 AI_API_KEY → 500");
    const b = await r.json();
    ok(/AI_API_KEY|未配置/.test(b.error || ""), "错误信息说明如何配置");
  }

  /* A2 有 key → 转发 chat/completions，返回 {content} */
  {
    let captured = null;
    const upstream = async (url, opts) => {
      captured = { url, opts: JSON.parse(opts.body), auth: opts.headers.Authorization };
      return jsonRes({ choices: [{ message: { content: "【词根】abc" } }] });
    };
    const f = loadFn({ AI_API_KEY: "sk-test" }, upstream);
    const r = await f.onRequestPost({
      request: { json: async () => ({ user: "讲解 absorb" }) },
      env: { AI_API_KEY: "sk-test", AI_BASE_URL: "https://api.example.com/v4", AI_MODEL: "m-1" }
    });
    const b = await r.json();
    ok(r.status === 200 && b.content === "【词根】abc", "上游成功 → 返回 content");
    ok(/chat\/completions$/.test(captured.url), "转发到 {base}/chat/completions (" + captured.url + ")");
    ok(captured.auth === "Bearer sk-test", "Authorization Bearer 正确");
    ok(captured.opts.model === "m-1", "model 透传");
    ok(captured.opts.messages.some(m2 => m2.role === "user" && m2.content === "讲解 absorb"), "用户消息透传");
    /* base 纠错 */
    {
      const upstream2 = async (url) => { captured = { url }; return jsonRes({ choices: [{ message: { content: "x" } }] }); };
      const f2 = loadFn({ AI_API_KEY: "k" }, upstream2);
      await f2.onRequestPost({
        request: { json: async () => ({ user: "u", key: "sk-z", base: "https://opencode.ai/zen/v1/models" }) },
        env: { AI_API_KEY: "env-k" }
      });
      ok(captured.url === "https://opencode.ai/zen/v1/chat/completions",
         "base 尾部 /models 自动纠正 (" + captured.url + ")");
    }
  }

  /* A3 上游挂了 → 502 */
  {
    const upstream = async () => { throw new Error("boom"); };
    const f = loadFn({ AI_API_KEY: "sk-test" }, upstream);
    const r = await f.onRequestPost({
      request: { json: async () => ({ user: "x" }) }, env: { AI_API_KEY: "k" }
    });
    ok(r.status === 502, "上游异常 → 502 (实际 " + r.status + ")");
  }

  /* ---------- B) 前端集成 ---------- */
  function boot(store, withCfg) {
    const elems = new Map();
    const el = id => {
      if (!elems.has(id)) elems.set(id, {
        textContent: "", innerHTML: "", value: "", checked: false, style: {}, dataset: {}, className: "",
        classList: {
          _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
          contains(c) { return this._s.has(c); }
        },
        disabled: false,
        addEventListener(t, fn) { (this._h = this._h || {})[t] = fn; },
        trigger(t) { this._h && this._h[t] && this._h[t](); },
        appendChild(c) { (this.children = this.children || []).push(c); },
        remove() {}, parentElement: { appendChild() {} },
        querySelectorAll: () => [], click() {},
        setAttribute() {}, getAttribute: () => null, append() {}
      });
      return elems.get(id);
    };
    const doc = { getElementById: el, createElement: () => el("_t" + Math.random()), querySelectorAll: () => [], body: {} };
    const BANK = [{ w: "absorb", uk: "əb'sɔ:b", us: "æbˈzɔrb", trans: [{ pos: "v", zh: "吸收" }], sents: [], phrases: [], src: "core" }];
    const win = { CET_BANKS: { core: { id: "core", name: "核心", desc: "", list: BANK } }, addEventListener() {} };
    win.window = win;
    const ls = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
    };
    let apiCalls = 0;
    const fetchStub = async (url) => {
      apiCalls++;
      if (/\/api\/ai/.test(url)) return { ok: true, json: async () => ({ content: "【词根拆解】ab+sort" }) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: "直连内容" } }] }) };
    };
    const src = ["js/store.js", "js/app.js", "js/ai.js", "js/words.js"].map(read).join("\n;\n");
    const factory = new Function("window", "document", "localStorage", "location", "fetch", "setInterval", "setTimeout",
      '"use strict";\n' + src +
      "\nreturn { get S(){return S}, save, todayStr, reveal: typeof reveal==='function'?reveal:null," +
      " aiEnabled: typeof aiEnabled!=='undefined'?aiEnabled:null," +
      " aiExplain: typeof aiExplain!=='undefined'?aiExplain:null };");
    const api = factory(win, doc, ls, { pathname: "/index.html" }, fetchStub, () => 0, () => 0);
    if (withCfg !== undefined) { api.S.aiConfig = withCfg; api.save(); }
    return { api, el, elems, apiCalls: () => apiCalls, store };
  }

  /* B1 未启用 → reveal 后没有 AI 按钮 */
  {
    const t = boot({}, undefined);
    t.api.reveal();
    const btns = [...t.elems.values()].filter(e => e.textContent && /AI/.test(String(e.textContent)));
    ok(btns.length === 0, "未启用 AI：翻面后无 AI 按钮");
    ok(t.apiCalls() === 0, "未启用：不发任何请求");
  }

  /* B2 启用（代理模式，无本地 key）→ reveal 出现按钮 → 点击 → 渲染 + 恰好一次请求 */
  {
    const t = boot({}, { on: true, base: "", model: "" });
    t.api.reveal();
    const actChildren = t.el("fcActions").children || [];
    const aiBtn = actChildren.find(b => /AI 讲解/.test(String(b.textContent)));
    ok(!!aiBtn, "启用后翻面出现「AI 讲解」按钮");
    await t.api.aiExplain({ w: "absorb", trans: [{ pos: "v", zh: "吸收" }] });
    ok(t.apiCalls() === 1, "点击后恰好发一次请求 (实际 " + t.apiCalls() + ")");
    const box = t.el("aiBox");
    ok(box && /词根拆解/.test(box.innerHTML), "结果渲染进 aiBox");
    /* B3 缓存：同一词第二次不再发请求 */
    await t.api.aiExplain({ w: "absorb", trans: [] });
    ok(t.apiCalls() === 1, "同词第二次命中缓存，仍只有 1 次请求 (实际 " + t.apiCalls() + ")");
    ok(t.api.S.aiCache && t.api.S.aiCache.absorb, "结果已写入 S.aiCache 持久层");
  }

  /* B4 日上限：计数满 → 拦截且不发请求 */
  {
    const t = boot({}, { on: true, base: "", model: "" });
    t.api.S.aiCount = { date: t.api.todayStr(), count: 30 };
    await t.api.aiExplain({ w: "absorb", trans: [] });
    ok(t.apiCalls() === 0, "达到日上限 30 → 不发请求");
    const toastEl = t.el("toast");
    ok(/上限|明天/.test(toastEl.textContent), "提示上限 toast (\"" + toastEl.textContent + "\")");
  }

  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e.message); process.exit(2); });
