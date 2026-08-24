/* 真题选择题模式（exam.html）
   - 随机抽题，答错自动加入当前词库复习队列（box1，明天到期） */
"use strict";

const EXAM_KEY = "cet4wb.exam.done";   // 已做题号（词 headWord 列表）

function examDoneSet() {
  try { return new Set(JSON.parse(localStorage.getItem(EXAM_KEY)) || []); }
  catch (e) { return new Set(); }
}
function saveExamDone(set) {
  localStorage.setItem(EXAM_KEY, JSON.stringify([...set]));
}

const ALL = (window.CET_BANKS.exam ? window.CET_BANKS.exam.list : []).filter(x => x.exam && x.exam.choices.length >= 2);
let done = examDoneSet();
let pool = [];
let cur = null;
let answered = false;
let scoreGood = 0, scoreBad = 0;

// 复用 app.js 的 $（同页已声明 const $）

function refillPool() {
  // 未做过的题优先；全做完后洗牌重来
  let fresh = ALL.filter(x => !done.has(x.w));
  if (fresh.length === 0) { done.clear(); saveExamDone(done); fresh = ALL.slice(); }
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }
  pool = fresh;
}

function updateHUD() {
  $("exProgress").textContent = done.size + " / " + ALL.length + " 已完成";
  $("exScore").textContent = "答对 " + scoreGood + " · 答错 " + scoreBad;
}

function renderQuestion() {
  if (!pool.length) refillPool();
  cur = pool.shift();
  answered = false;

  $("exDone").textContent = cur.src === "exam" ? "真题" : "考点";
  $("exQuestion").textContent = cur.exam.q.replace(/_+/g, "______");
  const wrap = $("exChoices");
  wrap.innerHTML = "";
  $("exExplainWrap").classList.add("hidden-extra");
  $("exExplain").textContent = "";
  $("exWordTag").textContent = "";

  const keys = ["A", "B", "C", "D"];
  cur.exam.choices.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = `<span class="key">${keys[i]}</span><span>${text}</span>`;
    btn.addEventListener("click", () => choose(i, btn));
    wrap.appendChild(btn);
  });
  updateHUD();
}

function choose(i, btn) {
  if (answered) return;
  answered = true;
  const correct = i === cur.exam.answer;
  const buttons = [...$("exChoices").children];
  buttons.forEach((b, idx) => {
    b.disabled = true;
    if (idx === cur.exam.answer) b.classList.add("correct");
    else if (idx === i) b.classList.add("wrong");
    else b.classList.add("dim");
  });

  if (correct) scoreGood++; else scoreBad++;

  // 答错的词 → 加入当前词库复习队列
  if (!correct) {
    const words = S.banks[S.bankId] || {};
    if (!words[cur.w]) words[cur.w] = { box: 1, due: addDays(todayStr(), BOX_DAYS[1]) };
    ensureNewQuota();
  }
  done.add(cur.w);
  saveExamDone(done);
  save();
  markCheckinAuto();

  $("exExplain").textContent = (cur.exam.explain || "").trim() || "（无解析）";
  $("exWordTag").textContent = "考点词：" + cur.w + (correct ? "" : " · 已加入复习队列");
  $("exExplainWrap").classList.remove("hidden-extra");

  const act = $("exActions");
  act.innerHTML = "";
  const next = document.createElement("button");
  next.className = "btn btn-yellow grade-btn";
  next.textContent = "下一题";
  next.addEventListener("click", () => { updateHUD(); renderQuestion(); });
  act.appendChild(next);
  updateHUD();
}

refillPool();
renderQuestion();
