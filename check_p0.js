/* P0 行为回归：真实加载 store.js + app.js + words.js 到沙箱，
   走真实 grade() 路径，再模拟页面刷新（同 localStorage 重启沙箱）断言队列。
   红 = 「不认识」的当日重试在刷新后丢失。用法: node check_p0.js */
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");

function makeEnv(store) {
  const elems = new Map();
  function el(id) {
    if (!id) return null;
    if (!elems.has(id)) elems.set(id, {
      textContent: "", innerHTML: "", value: "", checked: false, style: {}, dataset: {},
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener() {}, appendChild() {}, remove() {}, parentElement: { appendChild() {} },
      querySelectorAll: () => []
    });
    return elems.get(id);
  }
  const doc = {
    getElementById: el,
    createElement: () => el("_tmp" + Math.random()),
    querySelectorAll: () => [],
    body: {}
  };
  const BANK = [
    { w: "alpha", uk: "a", us: "a", trans: [{ pos: "n", zh: "甲" }], sents: [], phrases: [], src: "core" },
    { w: "beta",  uk: "b", us: "b", trans: [{ pos: "n", zh: "乙" }], sents: [], phrases: [], src: "core" },
    { w: "gamma", uk: "g", us: "g", trans: [{ pos: "n", zh: "丙" }], sents: [], phrases: [], src: "core" }
  ];
  const win = {
    CET_BANKS: { core: { id: "core", name: "核心", desc: "", list: BANK } },
    addEventListener() {}
  };
  win.window = win;
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  return { win, ls, doc, toasts: [] };
}

function boot(store) {
  const env = makeEnv(store);
  const src = [read("js/store.js"), read("js/app.js"), read("js/words.js")].join("\n;\n");
  const factory = new Function(
    "window", "document", "localStorage", "location", "toast",
    "setInterval", "setTimeout",
    '"use strict";\n' + src +
    "\nreturn { get S(){return S}, buildQueue, save, todayStr, addDays, grade, getQ(){return Q} };"
  );
  const api = factory(env.win, env.doc, env.ls, { pathname: "/index.html" },
    m => env.toasts.push(m), () => 0, () => 0);
  return { api, env };
}

let fail = 0;
const ok = (c, name) => { console.log((c ? "PASS" : "FAIL") + "  " + name); if (!c) fail++; };

/* 场景1：新词点「不认识」→ 刷新 → 今天必须还能见到它 */
{
  const store = {};
  const s1 = boot(store);
  const q0 = s1.api.getQ();
  ok(q0.queue[0] && q0.queue[0].w === "alpha", "初始队列第一张是 alpha");
  s1.api.grade("again");
  ok(s1.env.doc.getElementById("toast").textContent.indexOf("队尾") >= 0, "点击后提示已排队尾");
  ok(s1.api.getQ().queue.some(x => x.w === "alpha"), "内存队列里有它（当场重试）");
  const s2 = boot(store);                    // 模拟刷新
  const q1 = s2.api.buildQueue();
  ok(q1.queue.some(x => x.w === "alpha"), "刷新后 alpha 今天仍在队列（P0 核心）");
}

/* 场景2：点「认识」→ 刷新 → 今天不该再出现，due 排到后天 */
{
  const store = {};
  const s1 = boot(store);
  s1.api.grade("good");
  const s2 = boot(store);
  const q = s2.api.buildQueue();
  ok(!q.queue.some(x => x.w === "alpha"), "认识后刷新不再出现 alpha");
  const due = s2.api.S.banks.core.alpha.due;
  ok(due === s2.api.addDays(s2.api.todayStr(), 2), "认识 → due=后天 (实际 " + due + ")");
}

/* 场景3：点「模糊」→ 刷新 → 今天不出现，due=明天 */
{
  const store = {};
  const s1 = boot(store);
  s1.api.grade("fuzzy");
  const s2 = boot(store);
  const q = s2.api.buildQueue();
  ok(!q.queue.some(x => x.w === "alpha"), "模糊后刷新今天不出现 alpha");
  const due = s2.api.S.banks.core.alpha.due;
  ok(due === s2.api.addDays(s2.api.todayStr(), 1), "模糊 → due=明天 (实际 " + due + ")");
}

/* 场景4：持久层形状 —— 别名不落盘、无 againToday 死字段（pitfall #3）*/
{
  const store = {};
  const s1 = boot(store);
  s1.api.grade("again");
  const saved = JSON.parse(store["cet4wb.v2"]);
  ok(!("words" in saved) && !("cursor" in saved), "别名 words/cursor 未泄漏进持久层");
  ok(saved.banks && saved.banks.core && saved.banks.core.alpha &&
     typeof saved.banks.core.alpha.due === "string", "alpha 记录含字符串 due");
  ok(!("againToday" in (saved.banks.core.alpha || {})), "无 againToday 死字段");
}

process.exit(fail ? 1 : 0);
