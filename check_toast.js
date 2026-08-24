/* 验证回路：grade() 的 toast 消息必须与评级匹配。
   红 = 点「认识」也弹"新词已入队复习"。用法: node check_toast.js */
const fs = require("fs");
const src = fs.readFileSync(require("path").join(__dirname, "js/words.js"), "utf8");
const gradeBody = src.slice(src.indexOf("function grade"), src.indexOf("/* 键盘"));
const toasts = [...gradeBody.matchAll(/toast\(([\s\S]*?)\);/g)];
const m = toasts[toasts.length - 1];   // grade() 末尾的评级 toast（「again」分支提前 return，有自己的提示）
const expr = (m && m[1]) || null;
if (!expr) { console.log("FAIL  未找到 grade() 中的 toast 调用"); process.exit(1); }

function msgFor(isNew, k) {
  return Function("isNew", "k", `"use strict"; return (${expr});`)(isNew, k);
}

let fail = 0;
// [场景, isNew, k, 期望消息]
const cases = [
  ["新词·认识", true,  "good",  /很好|认识|漂亮/,        ],
  ["新词·模糊", true,  "fuzzy", /复习|近期/,             ],
  ["旧词·认识", false, "good",  /很好|间隔/,             ],
  ["旧词·模糊", false, "fuzzy", /近期|复习/,             ],
];
for (const [name, isNew, k, okRe] of cases) {
  const msg = msgFor(isNew, k);
  const bad = /入队/.test(msg) && k === "good";
  const pass = !bad && okRe.test(msg);
  console.log((pass ? "PASS" : "FAIL") + `  ${name} -> "${msg}"`);
  if (!pass) fail++;
}
process.exit(fail ? 1 : 0);
