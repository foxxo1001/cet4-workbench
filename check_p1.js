/* P1 行为回归：
   1) 已掌握口径统一 = box>=5 毕业（KNOWN_BOX 单一来源）
   2) grade() 写入 dailyLog（每日新词/答题采集）
   3) etaForecast() 完工预测纯函数
   4) 真题做完一整轮 → toast 提示重新开始
   用法: node check_p1.js */
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");

function makeEnv(store, banksExtra) {
  const elems = new Map();
  function el(id) {
    if (!id) return null;
    if (!elems.has(id)) elems.set(id, {
      textContent: "", innerHTML: "", value: "", checked: false, style: {}, dataset: {},
      className: "",
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener() {}, appendChild(c) { (this.children = this.children || []).push(c); },
      remove() {}, parentElement: { appendChild() {} }, querySelectorAll: () => []
    });
    return elems.get(id);
  }
  const doc = {
    getElementById: el,
    createElement: () => el("_tmp" + Math.random()),
    querySelectorAll: () => [], body: {}
  };
  const BANK = [
    { w: "alpha", trans: [{ pos: "n", zh: "甲" }], sents: [], phrases: [], src: "core" },
    { w: "beta",  trans: [{ pos: "n", zh: "乙" }], sents: [], phrases: [], src: "core" },
    { w: "gamma", trans: [{ pos: "n", zh: "丙" }], sents: [], phrases: [], src: "core" }
  ];
  const win = { CET_BANKS: Object.assign({
      core: { id: "core", name: "核心", desc: "", list: BANK }
    }, banksExtra || {}),
    addEventListener() {} };
  win.window = win;
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  return { win, ls, doc };
}

function boot(store, files, banksExtra) {
  const env = makeEnv(store, banksExtra);
  const src = files.map(read).join("\n;\n");
  const factory = new Function(
    "window", "document", "localStorage", "location", "setInterval", "setTimeout",
    '"use strict";\n' + src +
    "\nreturn { get S(){return S}, buildQueue, save, todayStr, addDays," +
    " KNOWN_BOX: typeof KNOWN_BOX!=='undefined'?KNOWN_BOX:null," +
    " etaForecast: typeof etaForecast!=='undefined'?etaForecast:null," +
    " knownCount: typeof knownCount==='function'?knownCount:null," +
    " grade: typeof grade==='function'?grade:null };"
  );
  const api = factory(env.win, env.doc, env.ls, { pathname: "/index.html" }, () => 0, () => 0);
  return { api, env };
}

const WORDS_FILES = ["js/store.js", "js/ai.js", "js/app.js", "js/words.js"];

let fail = 0;
const ok = (c, name) => { console.log((c ? "PASS" : "FAIL") + "  " + name); if (!c) fail++; };

/* 1. KNOWN_BOX 单一来源存在且为 5 */
{
  const s = boot({}, WORDS_FILES);
  ok(s.api.KNOWN_BOX === 5, "KNOWN_BOX=5 从 store.js 导出（单一口径）");
}

/* 2. knownCount 按 box>=5 统计：box4 不算，box5 算 */
{
  const store = {};
  const s1 = boot(store, WORDS_FILES);
  const S = s1.api.S;
  S.banks.core.beta  = { box: 5, due: "2099-01-01" };
  S.banks.core.gamma = { box: 4, due: "2099-01-01" };
  ok(s1.api.knownCount && s1.api.knownCount() === 1, "knownCount: box5 计入、box4 不计入");
}

/* 3. grade() 采集 dailyLog：认识新词 → new+1, reviews+1 */
{
  const store = {};
  const s1 = boot(store, WORDS_FILES);
  s1.api.grade("good");                       // alpha 新词 认识
  const t = s1.api.todayStr();
  const d = s1.api.S.dailyLog && s1.api.S.dailyLog[t];
  ok(d && d.new === 1 && d.reviews === 1, "dailyLog[今天] = {new:1, reviews:1} (实际 " + JSON.stringify(d) + ")");
}

/* 3b. 「不认识」也计一次 review */
{
  const store = {};
  const s1 = boot(store, WORDS_FILES);
  s1.api.grade("again");
  const t = s1.api.todayStr();
  const d = s1.api.S.dailyLog && s1.api.S.dailyLog[t];
  ok(d && d.new === 1 && d.reviews === 1, "不认识路径 dailyLog 同样 +1/+1");
}

/* 4. etaForecast：近7天日均10词、剩30词 → 3天后背完 */
{
  const store = {};
  const s1 = boot(store, WORDS_FILES);
  const S = s1.api.S;
  const t = s1.api.todayStr();
  S.dailyLog = {};
  for (let i = 1; i <= 6; i++) S.dailyLog[s1.api.addDays(t, -i)] = { new: 10, reviews: 20 };
  S.dailyLog[t] = { new: 10, reviews: 5 };
  const f = s1.api.etaForecast ? s1.api.etaForecast() : null;
  ok(f && f.remaining === 3, "剩余未学 = 3 (实际 " + (f && f.remaining) + ")");
  ok(f && f.rate === 10, "日均新词 = 10 (实际 " + (f && f.rate) + ")");
  ok(f && f.days === 1 && f.eta === s1.api.addDays(t, 1), "预计明天背完 (实际 +" + (f && f.days) + "天 " + (f && f.eta) + ")");
}

/* 4b. 无学习记录 → rate=0 不给日期 */
{
  const store = {};
  const s1 = boot(store, WORDS_FILES);
  const f = s1.api.etaForecast ? s1.api.etaForecast() : null;
  ok(f && f.rate === 0 && !f.eta, "无记录时 rate=0 且不给 eta (实际 " + JSON.stringify(f) + ")");
}

/* 5. 真题：最后一题答完刷新池子 → toast「一轮」提示 */
{
  const Q = (w, i) => ({ w, src: "exam",
    exam: { q: "q " + w, choices: ["a" + i, "b" + i], answer: 0, explain: "e" } });
  const store = {};
  store["cet4wb.exam.done"] = JSON.stringify(["qone", "qtwo"]);   // 两题都已做过
  const s = boot(store,
    ["js/store.js", "js/app.js", "js/exam.js"],
    { exam: { id: "exam", name: "真题", desc: "", list: [Q("qone", 1), Q("qtwo", 2)] } });
  const toastText = s.env.doc.getElementById("toast").textContent;
  ok(/一轮|重新/.test(toastText), "做完一整轮弹出提示 (实际 \"" + toastText + "\")");
  const doneAfter = JSON.parse(store["cet4wb.exam.done"]);
  ok(Array.isArray(doneAfter) && doneAfter.length === 0, "进度已重置开始新一轮");
}

process.exit(fail ? 1 : 0);
