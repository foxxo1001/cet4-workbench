/* 计划页（plan.html）：每日清单 */
"use strict";

const CHECK_ITEMS = [
  "词汇任务完成（新词 + 到期复习）",
  "听力精听 1 篇，逐句跟读",
  "阅读精读 1–2 篇，整理错因",
  "翻译 / 写作素材积累 15 分钟"
];

function renderDailyCheck() {
  const t = todayStr();
  if (!S.checkins[t]) S.checkins[t] = [false, false, false, false];
  const wrap = $("dailyCheck");
  if (!wrap) return;
  wrap.innerHTML = "";
  CHECK_ITEMS.forEach((txt, i) => {
    const row = document.createElement("div");
    row.className = "check-item" + (S.checkins[t][i] ? " done" : "");
    row.setAttribute("role", "checkbox");
    row.setAttribute("aria-checked", String(!!S.checkins[t][i]));
    row.tabIndex = 0;
    const cb = document.createElement("div"); cb.className = "cb";
    cb.textContent = S.checkins[t][i] ? "✓" : "";
    const sp = document.createElement("span"); sp.textContent = txt;
    row.append(cb, sp);
    const toggle = () => {
      S.checkins[t][i] = !S.checkins[t][i];
      save(); renderDailyCheck();
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
    wrap.appendChild(row);
  });
}

renderDailyCheck();
