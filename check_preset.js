/* 预设切换回归：选 DeepSeek → Base URL 与模型名必须自动带出。
   本地绿 = 代码正确；线上复现 = 用户端缓存问题。用法: node check_preset.js */
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");

function boot(store) {
  const elems = new Map();
  const el = id => {
    if (!elems.has(id)) elems.set(id, {
      textContent: "", innerHTML: "", value: "", checked: false, style: {}, dataset: {}, className: "",
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener(t, fn) { (this._h = this._h || {})[t] = fn; },
      trigger(t) { this._h && this._h[t] && this._h[t](); },
      appendChild() {}, remove() {}, parentElement: { appendChild() {} },
      querySelectorAll: () => [], click() {}, append() {},
      setAttribute() {}, getAttribute: () => null
    });
    return elems.get(id);
  };
  const doc = { getElementById: el, createElement: () => el("_t" + Math.random()), querySelectorAll: () => [], body: {} };
  const win = {
    CET_BANKS: {
      core: { id: "core", name: "核心", desc: "", list: [{ w: "alpha", trans: [], sents: [], phrases: [], src: "core" }] }
    }, addEventListener() {}
  };
  win.window = win;
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const src = ["js/store.js", "js/ai.js", "js/app.js", "js/banks.js"].map(read).join("\n;\n");
  new Function("window", "document", "localStorage", "location", '"use strict";\n' + src)(
    win, doc, ls, { pathname: "/banks.html" });
  return { el };
}

let fail = 0;
const ok = (c, name) => { console.log((c ? "PASS" : "FAIL") + "  " + name); if (!c) fail++; };

const t = boot({});
/* 初始回填：默认智谱 */
ok(t.el("aiBaseInput").value.indexOf("bigmodel.cn") >= 0, "初始回填智谱 Base (" + t.el("aiBaseInput").value + ")");
/* 切到 DeepSeek → 自动带出 */
t.el("aiPreset").value = "deepseek";
t.el("aiPreset").trigger("change");
ok(t.el("aiBaseInput").value === "https://api.deepseek.com/v1", "切 DeepSeek → base 自动切换 (实际 \"" + t.el("aiBaseInput").value + "\")");
ok(t.el("aiModelInput").value === "deepseek-chat", "模型名自动带出 (实际 \"" + t.el("aiModelInput").value + "\")");
/* 再切回智谱 → 联动回来 */
t.el("aiPreset").value = "zhipu";
t.el("aiPreset").trigger("change");
ok(t.el("aiBaseInput").value.indexOf("bigmodel.cn") >= 0, "切回智谱 → base 联动");

process.exit(fail ? 1 : 0);
