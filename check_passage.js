/* 词文串学回归：
   1) pickWordsForPassage：到期优先、上限8、少于3个返回 null
   2) aiCall 支持自定义 system（本地直连 + 代理两路透传）
   3) aiGeneratePassage：调用→渲染(mark高亮+HTML转义)→落盘缓存→同日免请求→force 重生成→日上限10拦截
   4) aiRenderPassageSection：AI 未启用时隐藏区块
   用法: node check_passage.js */
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");

let fail = 0;
const ok = (c, name) => { console.log((c ? "PASS" : "FAIL") + "  " + name); if (!c) fail++; };

function boot(store) {
  const elems = new Map();
  const el = id => {
    if (!elems.has(id)) elems.set(id, {
      textContent: "", innerHTML: "", value: "", checked: false, style: {}, dataset: {}, className: "",
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener(t, fn) { (this._h = this._h || {})[t] = fn; },
      trigger(t) { this._h && this._h[t] && this._h[t](); },
      appendChild(c) { (this.children = this.children || []).push(c); },
      remove() {}, parentElement: { appendChild() {} },
      querySelectorAll: () => [], click() {}, append() {},
      setAttribute() {}, getAttribute: () => null
    });
    return elems.get(id);
  };
  const doc = { getElementById: el, createElement: () => el("_t" + Math.random()), querySelectorAll: () => [], body: {} };
  const mk = w => ({ w, trans: [{ pos: "n", zh: "x" }], sents: [], phrases: [], src: "core" });
  const win = { CET_BANKS: { core: { id: "core", name: "核心", desc: "",
      list: ["alpha","beta","gamma","delta","epsilon","zeta","eta","theta","iota","kappa"].map(mk) } },
    addEventListener() {} };
  win.window = win;
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  let calls = 0; const bodies = [];
  const fetchStub = async (url, opts) => {
    calls++;
    bodies.push({ url, body: JSON.parse((opts && opts.body) || "{}") });
    if (/\/api\/ai/.test(url)) return { ok: true, json: async () => ({ content: "Proxy **alpha** grows. <script>x</script>" }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: "Local **alpha** and **beta** thrive. <img src=x onerror=y> done." } }] }) };
  };
  const src = ["js/store.js", "js/ai.js", "js/app.js", "js/words.js"].map(read).join("\n;\n");
  const factory = new Function("window", "document", "localStorage", "location", "fetch", "setInterval", "setTimeout",
    '"use strict";\n' + src +
    "\nreturn { get S(){return S}, save, todayStr, addDays," +
    " pickWordsForPassage: typeof pickWordsForPassage!=='undefined'?pickWordsForPassage:null," +
    " aiGeneratePassage: typeof aiGeneratePassage!=='undefined'?aiGeneratePassage:null," +
    " aiRenderPassageSection: typeof aiRenderPassageSection!=='undefined'?aiRenderPassageSection:null }");
  const api = factory(win, doc, ls, { pathname: "/index.html" }, fetchStub, () => 0, () => 0);
  api.S.aiConfig = { on: true, base: "", model: "" };   // 代理模式
  api.save();
  return { api, el, calls: () => calls, bodies, store };
}

(async () => {
  /* 1. 选词：到期优先 */
  {
    const t = boot({});
    const S = t.api.S, t0 = t.api.todayStr(), past = t.api.addDays(t0, -1), future = t.api.addDays(t0, 3);
    S.banks.core.alpha = { box: 1, due: past };   // 到期
    S.banks.core.beta  = { box: 2, due: past };   // 到期
    S.banks.core.gamma = { box: 4, due: future }; // 已学未毕业
    S.banks.core.delta = { box: 5, due: future }; // 毕业 → 不选
    S.banks.core.epsilon = { box: 5, due: past }; // 毕业 → 不选
    const picked = t.api.pickWordsForPassage();
    ok(picked.length === 3, "只选未毕业的已学词 (实际 " + JSON.stringify(picked) + ")");
    ok(picked[0] === "alpha" && picked[1] === "beta", "到期词排前");
    ok(!picked.includes("delta") && !picked.includes("epsilon"), "毕业词不进短文");
    /* 少于 3 个 → null */
    delete S.banks.core.gamma;
    ok(t.api.pickWordsForPassage() === null, "已学词 <3 时返回 null");
  }

  /* 上限 8 */
  {
    const t = boot({});
    const S = t.api.S, t0 = t.api.todayStr(), past = t.api.addDays(t0, -1);
    ["alpha","beta","gamma","delta","epsilon","zeta","eta","theta","iota","kappa"].forEach(w =>
      S.banks.core[w] = { box: 1, due: past });
    ok(t.api.pickWordsForPassage().length === 8, "最多取 8 个词");
  }

  /* 2. 生成主流程：代理模式、渲染、缓存 */
  {
    const t = boot({});
    const S = t.api.S, t0 = t.api.todayStr(), past = t.api.addDays(t0, -1);
    S.banks.core.alpha = { box: 1, due: past };
    S.banks.core.beta = { box: 1, due: past };
    S.banks.core.gamma = { box: 1, due: past };

    await t.api.aiGeneratePassage(false);
    ok(t.calls() === 1, "首次生成发一次请求");
    const sent = t.bodies[0];
    ok(/\/api\/ai/.test(sent.url), "代理模式走 /api/ai");
    ok(alphaIn(JSON.stringify(sent.body)), "请求包含目标单词");
    const box = t.el("passageEn");
    ok(box && /<mark/.test(box.innerHTML), "渲染出 mark 高亮");
    ok(box && box.innerHTML.indexOf("<script>") < 0 && box.innerHTML.indexOf("&lt;script&gt;") >= 0,
       "HTML 已转义（无 XSS）");
    ok(S.passage && S.passage.date === t0 && Array.isArray(S.passage.words),
       "落盘 S.passage{date,words}");

    /* 同日缓存：不再发请求 */
    await t.api.aiGeneratePassage(false);
    ok(t.calls() === 1, "同日第二次打开命中缓存不发请求");

    /* force：重新生成 */
    await t.api.aiGeneratePassage(true);
    ok(t.calls() === 2, "换一篇(force) 发新请求");

    /* 日上限 10 */
    S.passageCount = { date: t0, count: 10 };
    await t.api.aiGeneratePassage(true);
    ok(t.calls() === 2, "达到日上限 10 → 拦截不发请求");
  }

  /* 3. 本地直连模式透传自定义 system */
  {
    const t = boot({});
    t.api.S.aiConfig = { on: true, base: "https://api.x.com/v1", model: "m", key: "sk-z" };
    t.api.save();
    const S = t.api.S, past = t.api.addDays(t.api.todayStr(), -1);
    S.banks.core.alpha = { box: 1, due: past };
    S.banks.core.beta = { box: 1, due: past };
    S.banks.core.gamma = { box: 1, due: past };
    await t.api.aiGeneratePassage(false);
    const b = t.bodies[0].body;
    ok(/v1\/chat\/completions/.test(t.bodies[0].url), "本地直连 URL 正确");
    ok(/外刊/.test(b.messages[0].content || ""), "system 含外刊要求 (实际 " + String(b.messages[0].content).slice(0, 40) + "…)");
  }

  /* 4. 未启用 → 区块隐藏 */
  {
    const t = boot({});
    t.api.S.aiConfig = { on: false };
    t.api.save();
    t.api.aiRenderPassageSection();
    ok(t.el("passageSec").style.display === "none", "AI 关闭时区块 display:none");
  }

  process.exit(fail ? 1 : 0);

  function alphaIn(s) { return /alpha/.test(s); }
})().catch(e => { console.error("HARNESS ERROR:", e.message); process.exit(2); });
