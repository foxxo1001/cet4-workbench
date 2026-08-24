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
  dailyReviewCap: 100,
  newToday: { date: "", count: 0 },
  retryQueue: [],       // 当日答「不认识」的词，今天队尾重来（持久化，刷新不丢）
  dailyLog: {},         // date -> { new, reviews } 每日学词采集（预测与趋势图数据源）
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
  if (typeof S.dailyReviewCap !== "number" || S.dailyReviewCap < 1) S.dailyReviewCap = 100;
})();

window.CET_BANKS = window.CET_BANKS || {};
if (!S.bankId || !window.CET_BANKS[S.bankId]) S.bankId = "core";
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
  /* retryQueue 是当日语义：跨天自动清空 */
  const t = todayStr();
  if (S.retryDate !== t && (S.retryQueue || []).length) { S.retryQueue = []; S.retryDate = t; }
}

/* 「已掌握」唯一口径：box >= KNOWN_BOX 即毕业（队列不再出现，统计按此计） */
const KNOWN_BOX = 5;

/* 每日学词采集：grade() 每次评分调用一次（预测与趋势图的数据源） */
function logDaily(isNew) {
  ensureNewQuota();
  const t = todayStr();
  if (!S.dailyLog) S.dailyLog = {};
  const d = S.dailyLog[t] || (S.dailyLog[t] = { new: 0, reviews: 0 });
  if (isNew) d.new++;
  d.reviews++;
}

/* 考前完工预测：近 7 天日均新词 → 预计多少天后背完当前词库剩余部分
   rate=0（无记录）时不给日期；remaining<=0 视为已完成 */
function etaForecast() {
  const LIST = ACTIVE_BANK().list;
  let learned = 0, known = 0;
  for (const rec of LIST) {
    const st = (S.banks[S.bankId] || {})[rec.w];
    if (st) { learned++; if (st.box >= KNOWN_BOX) known++; }
  }
  const remaining = Math.max(0, LIST.length - learned);
  const t = todayStr();
  const days7 = [];
  for (let i = 1; i <= 7; i++) {
    const d = (S.dailyLog || {})[addDays(t, -i)];
    if (d && typeof d.new === "number") days7.push(d.new);
  }
  const rate = days7.length ? Math.round(days7.reduce((a, b) => a + b, 0) / days7.length) : 0;
  if (rate <= 0) return { remaining, known, rate: 0, days: null, eta: null };
  const days = Math.ceil(remaining / rate);
  return { remaining, known, rate, days, eta: addDays(t, days) };
}

/* 预测文案（首页侧栏与统计页共用一种说法） */
function etaText() {
  const f = etaForecast();
  if (f.remaining <= 0) return "本词库已全部学完";
  if (f.rate <= 0) return "剩 " + f.remaining + " 词 · 学习几天后出预测";
  return f.eta + "（日约 " + f.rate + " 词）";
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n);
  return todayStr(d);
}
const BOX_DAYS = [0, 1, 2, 4, 7, 15];
function dailyNew() { return S.dailyNew; }
function dailyReviewCap() { return S.dailyReviewCap || 100; }

/* 溢出的到期复习词顺延：把 due 推到明天（不改变 box，只推迟出现） */
function deferOverflow(words, deferred, t) {
  const tomorrow = addDays(t, 1);
  for (const rec of deferred) {
    if (words[rec.w]) words[rec.w].due = tomorrow;
  }
}

/* 队列：到期复习优先（受上限约束），再补今日新词 */
function buildQueue() {
  ensureNewQuota();
  const t = todayStr();
  const LIST = ACTIVE_BANK().list;
  const words = S.banks[S.bankId] || {};
  const allDue = [], news = [];
  for (const rec of LIST) {
    const st = words[rec.w];
    if (st && st.due <= t && st.box < 5) allDue.push(rec);
  }
  allDue.sort((a, b) => words[a.w].box - words[b.w].box);
  // 复习上限：超出的部分顺延到明天，避免积压雪球
  let due = allDue;
  if (allDue.length > dailyReviewCap()) {
    due = allDue.slice(0, dailyReviewCap());
    deferOverflow(words, allDue.slice(dailyReviewCap()), t);
  }
  let idx = S.cursor, quota = dailyNew() - S.newToday.count;
  while (idx < LIST.length && quota > 0) {
    const rec = LIST[idx];
    if (!words[rec.w]) { news.push(rec); quota--; }
    idx++;
  }
  /* 当日重试词（「不认识」）排在最末尾，持久化在 localStorage，刷新不丢 */
  ensureNewQuota();
  const retries = [];
  for (const w of (S.retryQueue || [])) {
    const rec = LIST.find(x => x.w === w);   // 在册即入列；grade() 评分时会从队列移除
    if (rec && !due.includes(rec) && !news.includes(rec)) retries.push(rec);
  }
  return { queue: [...due, ...news, ...retries], dueCount: due.length, newCount: news.length };
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
