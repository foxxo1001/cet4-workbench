/* 页面加载安全检查（两层）：
   A) 静态：抓"顶层（花括号深度 0）对 $("id") 直接链式取属性"—— 该 id 不存在时页面打开即抛错
   B) 行为冒烟：每页真实脚本组合在沙箱（空壳 DOM，按需创建元素）里跑完加载期，抛错即红
   用法: node check_dom_ids.js */
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");

const PAGE_SCRIPTS = {
  "index.html": ["js/store.js", "js/app.js", "js/words.js"],
  "banks.html": ["js/store.js", "js/app.js", "js/banks.js"],
  "plan.html":  ["js/store.js", "js/app.js", "js/plan.js"],
  "stats.html": ["js/store.js", "js/app.js", "js/stats.js"],
  "exam.html":  ["js/store.js", "js/app.js", "js/exam.js"]
};
const BANKS_STUB = `
window.CET_BANKS = {
  core:{id:"core",name:"核心",desc:"",list:[{w:"alpha",trans:[],sents:[],phrases:[],src:"core"}]},
  exam:{id:"exam",name:"真题",desc:"",list:[{w:"qone",src:"exam",exam:{q:"_",choices:["a","b"],answer:0,explain:"e"}}]},
  freq:{id:"freq",name:"高频",desc:"",list:[{w:"beta",trans:[],sents:[],phrases:[],src:"freq"}]},
  full:{id:"full",name:"全量",desc:"",list:[{w:"gamma",trans:[],sents:[],phrases:[],src:"full"}]}
};`;

let fail = 0;
const ok = (c, name) => { console.log((c ? "PASS" : "FAIL") + "  " + name); if (!c) fail++; };

/* ---- A) 静态：顶层 $("id").prop 访问（字符级深度扫描，剔除注释与字符串字面量）---- */
function topLevelBareChains(src) {
  const out = [];
  let i = 0, depth = 0;
  const n = src.length;
  const lineOf = pos => src.slice(0, pos).split("\n").length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === "\"" || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++; continue;
    }
    if (depth === 0 && c === "$" && src.slice(i, i + 2) === "$(") {
      const m = /^\$\("([^"]+)"\)\s*\./.exec(src.slice(i));
      if (m) out.push({ id: m[1], line: lineOf(i) });
    }
    if (c === "{" || c === "(" || c === "[") { depth++; i++; continue; }
    if (c === "}" || c === ")" || c === "]") { depth--; i++; continue; }
    i++;
  }
  return out;
}
for (const [page, scripts] of Object.entries(PAGE_SCRIPTS)) {
  const bad = [];
  for (const s of scripts) topLevelBareChains(read(s))
    .forEach(x => bad.push(`${s}:${x.line}(${"$" }("${x.id}"))`));
  ok(bad.length === 0, `${page} 无顶层裸链式访问${bad.length ? " -> " + bad.join(", ") : ""}`);
}

/* ---- B) 行为冒烟 ---- */
function smoke(page, files) {
  const elems = new Map();
  const el = id => {
    if (!elems.has(id)) elems.set(id, {
      textContent: "", innerHTML: "", value: "", checked: false, style: {}, dataset: {}, className: "",
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener() {}, appendChild() {}, remove() {}, parentElement: { appendChild() {} },
      querySelectorAll: () => [], click() {},
      setAttribute() {}, getAttribute: () => null, toggleAttribute() {},
      append() {}, prepend() {}, before() {}, after() {}, focus() {}, blur() {},
      closest: () => null, contains: () => false, insertBefore() {}, replaceChild() {}
    });
    return elems.get(id);
  };
  const doc = { getElementById: el, createElement: () => el("_t" + Math.random()), querySelectorAll: () => [], body: {} };
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
  ok(!err, `${page} 加载冒烟通过${err ? " -> " + err : ""}`);
}

process.exit(fail ? 1 : 0);
