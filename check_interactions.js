/* 验证回路：检查所有交互元素是否具备交互动画（transition + :active 反馈）
   红 = 缺失，绿 = 齐全。用法: node check_interactions.js */
const fs = require("fs");
const path = require("path");
const root = __dirname;
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const examHtml = fs.readFileSync(path.join(root, "exam.html"), "utf8");
// 内联样式也算数（.choice 在 exam.html 里）
const all = css + "\n" + examHtml;

const checks = [
  // [名称, 必须包含的规则片段(正则)]
  [".speak-btn 有 transition",        /\.speak-btn[^{]*\{[^}]*transition/],
  [".speak-btn 有 :active 反馈",      /\.speak-btn:active/],
  [".tab-btn 有 transition",          /\.tab-btn[^,{]*\{[^}]*transition/],
  [".tab-btn 有 :active 反馈",        /\.tab-btn:active/],
  [".tab-link 的 transition 覆盖边框色", /\.tab-link[^,{]*\{[^}]*transition[^}]*(border-color|all)/],
  [".choice 有 transition",           /\.choice[^,{]*\{[^}]*transition/],
  [".choice 有 :active 反馈",         /\.choice:active/],
  ["打卡 .cb 有状态过渡",             /\.cb\s*\{[^}]*transition/],
  ["弹窗有打开动画",                  /\.modal-mask\.open[^{]*\{[^}]*(animation|opacity)/],
];

let fail = 0;
for (const [name, re] of checks) {
  const ok = re.test(all);
  console.log((ok ? "PASS" : "FAIL") + "  " + name);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
