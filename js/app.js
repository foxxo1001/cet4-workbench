/* 全站共用：导航高亮 / 倒计时 / toast / 打卡 */
"use strict";
const $ = id => document.getElementById(id);

/* 导航高亮 */
(function () {
  const page = (location.pathname.split("/").pop() || "index.html").replace(".html", "");
  document.querySelectorAll("[data-page]").forEach(a => {
    if (a.dataset.page === page) a.setAttribute("aria-current", "page");
  });
})();

/* 倒计时（存在 #cdDays 时启用） */
function tickCountdown() {
  if (!$("cdDays")) return;
  const target = new Date(S.examDate + "T09:00:00");
  let diff = Math.max(0, target - new Date());
  const days = Math.floor(diff / 86400000); diff -= days * 86400000;
  const h = Math.floor(diff / 3600000), m = Math.floor(diff % 3600000 / 60), sec = Math.floor(diff % 60);
  $("cdDays").textContent = days;
  $("cdHms").textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")} 后开考`;
  $("examDateText").textContent = S.examDate;
}
if ($("cdDays")) {
  tickCountdown();
  setInterval(tickCountdown, 1000);
}

/* 阶段高亮（计划页） */
function highlightPhase() {
  const grid = $("phaseGrid");
  if (!grid) return;
  const target = new Date(S.examDate + "T09:00:00");
  const daysLeft = Math.max(0, Math.ceil((target - new Date()) / 86400000));
  const ph = daysLeft > 60 ? 1 : (daysLeft > 30 ? 2 : 3);
  grid.querySelectorAll(".phase-card").forEach(c =>
    c.classList.toggle("current", Number(c.dataset.phase) === ph));
}
highlightPhase();

/* toast */
let _toastTimer = null;
function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

/* 考试日期弹窗（存在按钮时绑定） */
if ($("editDateBtn") && $("dateModal")) {
  $("editDateBtn").addEventListener("click", () => {
    $("dateInput").value = S.examDate;
    $("dateModal").classList.add("open");
  });
  $("dateCancel").addEventListener("click", () => $("dateModal").classList.remove("open"));
  $("dateSave").addEventListener("click", () => {
    const v = $("dateInput").value;
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { S.examDate = v; save(); tickCountdown(); highlightPhase(); }
    $("dateModal").classList.remove("open");
    toast("考试日期已更新");
  });
}

/* 连续打卡天数 */
function streak() {
  let n = 0, d = todayStr();
  while (S.checkins[d] && S.checkins[d].some(v => v)) { n++; d = addDays(d, -1); }
  return n;
}
/* 学过词即打卡（第 1 格） */
function markCheckinAuto() {
  const t = todayStr();
  if (!S.checkins[t]) S.checkins[t] = [false, false, false, false];
  S.checkins[t][0] = true;
}
