/* 共享状态层：localStorage 持久化（SSOT） */
"use strict";
const LS_KEY = "cet4wb.v2";

function todayStr(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; }
  catch (e) { return null; }
}

let S = loadState() || {
  examDate: "2026-12-12",
  banks: {},            // bankId -> { word: {box, due} }
  cursors: {},          // bankId -> 新词发到的下标
  bankId: "core",
  dailyNew: 10,
  newToday: { date: "", count: 0 },
  checkins: {},         // date -> [bool x4]
  stats: { good: 0, fuzzy: 0, again: 0, reviews: 0 },
  startDate: todayStr()
};

(function migrate() {
  // v1 单文件版迁移
  if ((!S.banks || typeof S.banks !== "object") && typeof localStorage !== "undefined") {
    const old = localStorage.getItem("cet4wb.v1");
    if (old) {
      try {
        const o = JSON.parse(old);
        if (!S.banks) S.banks = {};
        if (!S.banks.core && o.words) S.banks.core = o.words;
        if (o.cursor > 0) { S.cursors = S.cursors || {}; S.cursors.core = Math.max(S.cursors.core || 0, o.cursor); }
      } catch (e) {}
    }
  }
  if (!S.banks || typeof S.banks !== "object") S.banks = {};
  if (!S.cursors || typeof S.cursors !== "object") S.cursors = {};
  if (typeof S.dailyNew !== "number" || S.dailyNew < 1) S.dailyNew = 10;
})();

if (typeof window.CET_BANKS === "undefined" || !window.CET_BANKS[S.bankId]) S.bankId = "core";
if (!window.CET_BANKS[S.bankId]) window.CET_BANKS = window.CET_BANKS || {};
if (!window.CET_BANKS[S.bankId]) window.CET_BANKS[S.bankId] = null;
// 保证活动词库存在
if (!window.CET_BANKS["core"]) window.CET_BANKS["core"] = { id: "core", name: "核心", list: [] };
const ACTIVE_BANK = () => window.CET_BANKS[S.bankId] || window.CET_BANKS["core"];
if (!S.banks[S.bankId] || typeof S.banks[S.bankId] !== "object") S.banks[S.bankId] = {};

S.words = S.banks[S.bankId];   // 当前词库进度的活动别名
S.cursor = S.cursors[S.bankId] || 0;

function save() {
  S.cursors[S.bankId] = S.cursor;
  const clone = Object.assign({}, S);
  delete clone.words; delete clone.cursor;   // 别名不落盘
  localStorage.setItem(LS_KEY, JSON.stringify(clone));
}

function ensureNewQuota() {
  if (S.newToday.date !== todayStr()) S.newToday = { date: todayStr(), count: 0 };
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n);
  return todayStr(d);
}
const BOX_DAYS = [0, 1, 2, 4, 7, 15];
function dailyNew() { return S.dailyNew; }

/* 队列：到期复习优先，再补今日新词 */
function buildQueue() {
  ensureNewQuota();
  const t = todayStr();
  const LIST = ACTIVE_BANK().list;
  const words = S.banks[S.bankId] || {};
  const due = [], news = [];
  for (const rec of LIST) {
    const st = words[rec.w];
    if (st && st.due <= t && st.box < 5) due.push(rec);
  }
  due.sort((a, b) => words[a.w].box - words[b.w].box);
  let idx = S.cursor, quota = dailyNew() - S.newToday.count;
  while (idx < LIST.length && quota > 0) {
    const rec = LIST[idx];
    if (!words[rec.w]) { news.push(rec); quota--; }
    idx++;
  }
  return { queue: [...due, ...news], dueCount: due.length, newCount: news.length };
}

function switchBank(id) {
  if (!window.CET_BANKS[id]) return false;
  S.cursors[S.bankId] = S.cursor;
  S.bankId = id;
  if (!S.banks[id] || typeof S.banks[id] !== "object") S.banks[id] = {};
  S.words = S.banks[id];
  S.cursor = S.cursors[id] || 0;
  save();
  return true;
}
