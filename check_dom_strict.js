/* 行为级 DOM 严格检查：每页脚本组合在沙箱中加载，
   getElementById 只认该页 HTML 真实存在的 id（+动态注入白名单），缺失即返回 null。
   无守卫解引用（如 onChk.checked=...）会当场抛 TypeError —— 精确复现
   「aiOnChk 缺失导致 AI 设置整块失灵」这类 bug。用法: node check_dom_strict.js */
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");

const PAGE_SCRIPTS = {
  "index.html": ["js/store.js", "js/ai.js", "js/app.js", "js/words.js"],
  "banks.html": ["js/store.js", "js/ai.js", "js/app.js", "js/banks.js"],
  "plan.html":  ["js/store.js", "js/app.js", "js/plan.js"],
  "stats.html": ["js/store.js", "js/app.js", "js/stats.js"],
  "exam.html":  ["js/store.js", "js/app.js", "js/exam.js"]
};
// 运行时由 innerHTML/createElement 注入、或点击后才查找的 id
const DYNAMIC_IDS = new Set(["speakBtn", "aiBtn", "aiBox", "donePanelWrap"]);

const BANKS_STUB = `
window.CET_BANKS = {
  core:{id:"core",name:"核心",desc:"",list:[{w:"alpha",trans:[],sents:[],phrases:[],src:"core"}]},
  exam:{id:"exam",name:"真题",desc:"",list:[{w:"qone",src:"exam",exam:{q:"_",choices:["a","b"],answer:0,explain:"e"}}]},
  freq:{id:"freq",name:"高频",desc:"",list:[{w:"beta",trans:[],sents:[],phrases:[],src:"freq"}]},
  full:{id:"full",name:"全量",desc:"",list:[{w:"gamma",trans:[],sents:[],phrases:[],src:"full"}]}
};`;

let fail = 0;
const ok = (c, name) => { console.log((c ? "PASS" : "FAIL") + "  " + name); if (!c) fail++; };

function smoke(page, files) {
  const html = read(page);
  const realIds = new Set();
  let m; const idRe = /id="([^"]+)"/g;
  while ((m = idRe.exec(html))) realIds.add(m[1]);

  const elems = new Map();
  const makeEl = () => ({
    textContent: "", innerHTML: "", value: "", checked: false, style: {}, dataset: {}, className: "",
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener(t, fn) { (this._h = this._h || {})[t] = fn; },
    trigger(t) { this._h && this._h[t] && this._h[t](); },
    appendChild(c) { (this.children = this.children || []).push(c); },
    remove() {}, parentElement: { appendChild() {} },
    querySelectorAll: () => [], click() {}, append() {},
    setAttribute() {}, getAttribute: () => null
  });
  const doc = {
    getElementById(id) {
      if (elems.has(id)) return elems.get(id);
      if (realIds.has(id) || DYNAMIC_IDS.has(id)) { const e = makeEl(); elems.set(id, e); return e; }
      return null;                       // ← 关键差异：页面里不存在的 id 返回 null
    },
    createElement: () => { const e = makeEl(); elems.set("_dyn" + Math.random(), e); return e; },
    querySelectorAll: () => [], body: {}
  };
  const win = { addEventListener() {} }; win.window = win;
  const ls = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  try {
    new Function("window", "document", "localStorage", "location",
      '"use strict";' + BANKS_STUB + "\n" + files.map(read).join("\n;\n"))(
      win, doc, ls, { pathname: "/" + page });
    return null;
  } catch (e) { return e.message; }
}

for (const [page, scripts] of Object.entries(PAGE_SCRIPTS)) {
  const err = smoke(page, scripts);
  ok(!err, `${page} 全部引用安全${err ? " -> " + err : ""}`);
}
process.exit(fail ? 1 : 0);
