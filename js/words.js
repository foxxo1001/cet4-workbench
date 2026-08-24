/* 背词页（index.html） */
"use strict";

const GRADES = [
  { key: "good",  label: "认 识",   cls: "btn-teal" },
  { key: "fuzzy", label: "模 糊",   cls: "btn-yellow" },
  { key: "again", label: "不认识", cls: "btn-red" }
];

let Q = { queue: [], dueCount: 0, newCount: 0 };
let revealed = false;
let current = null;

function knownCount() {
  const words = S.banks[S.bankId] || {};
  return Object.values(words).filter(x => x.box >= KNOWN_BOX).length;
}

function renderBankBanner() {
  const bank = ACTIVE_BANK();
  $("curBankName").textContent = bank.name + " · " + bank.list.length + " 词";
  $("curBankDesc").textContent = bank.desc || "";
  const words = S.banks[S.bankId] || {};
  const learned = Object.keys(words).length;
  $("curBankProgress").textContent = `已学 ${learned} / ${bank.list.length}`;
}

function renderSideStats() {
  ensureNewQuota();
  $("stDue").textContent = Q.dueCount;
  $("stNew").textContent = `${S.newToday.count} / ${dailyNew()}`;
  $("stKnown").textContent = knownCount();
  $("stTotal").textContent = ACTIVE_BANK().list.length;
  $("stStreak").textContent = streak();
  const etaEl = $("stEta");
  if (etaEl) etaEl.textContent = etaText();
}

function speak(word) {
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US"; u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) {}
}

function fmtTrans(rec) {
  return rec.trans.map(t =>
    `<div class="tr-row"><span class="pos-tag">${t.pos}</span>${t.zh}</div>`).join("");
}

function renderCard() {
  const rec = current;
  revealed = false;
  $("fcWord").textContent = rec.w;
  const phones = [];
  if (rec.uk) phones.push(`英 ${rec.uk}`);
  if (rec.us) phones.push(`美 ${rec.us}`);
  $("fcPhones").innerHTML =
    phones.join(" · ") +
    ' <button class="speak-btn" id="speakBtn" type="button">发音</button>';
  const sb = $("speakBtn");
  sb.addEventListener("click", () => speak(rec.w));
  // 新词自动发音
  if (S.autoSpeak !== false) setTimeout(() => speak(rec.w), 350);
  $("fcPos").textContent = "";
  $("fcZh").innerHTML = fmtTrans(rec);
  $("fcZh").classList.add("hidden-zh");

  // 翻面后的补充内容：短语 + 例句（真题例句优先）
  let extra = "";
  for (const ph of (rec.phrases || []).slice(0, 3)) {
    extra += `<div class="x-block x-phrase"><span class="x-cap">短语</span>${ph.p}<span class="zh">${ph.zh}</span></div>`;
  }
  for (const s of (rec.sents || [])) {
    extra += `<div class="x-block x-sent"><span class="x-cap">${s.real ? "真题例句" : "例句"}</span><div class="en">${s.en}</div><div class="zh">${s.zh}</div></div>`;
    if (extra.length > 900) break; // 卡片信息量上限
  }
  $("fcExtra").innerHTML = extra;
  $("fcExtra").classList.add("hidden-extra");
}

function nextCard() {
  Q = buildQueue();
  renderSideStats();
  renderBankBanner();
  save();
  const fc = $("flashcard");
  if (!Q.queue.length) {
    fc.style.display = "none";
    let done = document.getElementById("donePanelWrap");
    if (!done) {
      done = document.createElement("div");
      done.id = "donePanelWrap";
      done.className = "box done-panel";
      done.innerHTML = `<div class="done-big">今日任务已完成</div>
        <p style="font-weight:700;font-size:.9rem;color:var(--muted);">明天继续，到期复习词会自动出现。<br>想加量？去「词库」页调高每日新词数。</p>`;
      fc.parentElement.appendChild(done);
      const more = document.createElement("button");
      more.className = "btn btn-blue"; more.textContent = "继续学下一批";
      more.addEventListener("click", () => {
        S.newToday.count = 0; S.newToday.date = todayStr();
        done.remove(); fc.style.display = ""; nextCard();
        toast("已刷新一批新词");
      });
      done.appendChild(more);
    }
    return;
  }
  fc.style.display = "";
  const dp = document.getElementById("donePanelWrap"); if (dp) dp.remove();
  const rec = Q.queue[0];
  current = rec;
  const isNew = !(S.banks[S.bankId] || {})[rec.w];
  $("fcMode").textContent = isNew ? "NEW" : "REVIEW";
  $("fcMode").style.background = isNew ? "#FFD54A" : "#BFF3EC";
  $("fcQueueTag").textContent = `剩余 ${Q.queue.length}`;
  $("fcTip").textContent = isNew ? "新词：先猜词义，再翻面" : "复习：先回忆，再对照";
  renderCard();
  const act = $("fcActions");
  act.innerHTML = "";
  const rb = document.createElement("button");
  rb.className = "btn btn-yellow grade-btn";
  rb.textContent = "翻 面";
  rb.dataset.k = "reveal";
  rb.addEventListener("click", reveal);
  act.appendChild(rb);
}

function reveal() {
  if (revealed || !current) return;
  revealed = true;
  $("fcZh").classList.remove("hidden-zh");
  $("fcExtra").classList.remove("hidden-extra");
  const act = $("fcActions");
  act.innerHTML = "";
  GRADES.forEach(g => {
    const b = document.createElement("button");
    b.className = "btn " + g.cls + " grade-btn";
    b.textContent = g.label;
    b.dataset.k = g.key;
    b.addEventListener("click", () => grade(g.key));
    act.appendChild(b);
  });
  /* AI 讲词（增强模块，未启用不出现） */
  if (typeof aiEnabled === "function" && aiEnabled()) {
    const cached = (S.aiCache || {})[current.w];
    const aib = document.createElement("button");
    aib.id = "aiBtn";
    aib.className = "btn btn-blue btn-sm";
    aib.textContent = cached ? "✨ AI 讲解 · 已缓存" : "✨ AI 讲解";
    aib.addEventListener("click", () => aiExplain(current));
    act.appendChild(aib);
    const boxWrap = document.createElement("div");
    boxWrap.className = "x-block";
    boxWrap.id = "aiBox";
    boxWrap.classList.add("hidden-extra");
    boxWrap.style.marginTop = "10px";
    $("fcExtra").appendChild(boxWrap);
  }
}

function grade(k) {
  if (!current) return;
  const rec = current;
  ensureNewQuota();
  const words = S.banks[S.bankId];
  const isNew = !words[rec.w];
  /* 本轮评分即消费重试队列：先移出，「不认识」分支会在下方重新入队 */
  if ((S.retryQueue || []).includes(rec.w)) {
    S.retryQueue = S.retryQueue.filter(w => w !== rec.w);
  }
  let box, dueOffset;
  if (isNew) {
    box = k === "again" ? 0 : k === "fuzzy" ? 1 : 2;
    const LIST = ACTIVE_BANK().list;
    S.cursor = Math.max(S.cursor, LIST.findIndex(x => x.w === rec.w) + 1);
    S.newToday.count++;
  } else {
    const cur = words[rec.w].box;
    box = k === "again" ? Math.max(0, cur - 1) : k === "fuzzy" ? cur : Math.min(5, cur + 1);
  }
  /* 答「不认识」：记录进当日重试队列（持久化，刷新不丢），今天队尾再过一遍，第二天巩固复习 */
  if (k === "again") {
    dueOffset = 1;                       // 明天到期（巩固）
    words[rec.w] = { box, due: addDays(todayStr(), dueOffset) };
    S.retryDate = todayStr();
    S.retryQueue = S.retryQueue || [];
    if (!S.retryQueue.includes(rec.w)) S.retryQueue.push(rec.w);
    save();
    logDaily(isNew);
    S.stats[k] = (S.stats[k] || 0) + 1;
    S.stats.reviews = (S.stats.reviews || 0) + 1;
    markCheckinAuto();
    toast("已排到队尾，稍后再来一次 · 明天巩固");
    nextCard();
    // 把这个词追加到当前队列末尾（当天内重复）
    Q.queue.push(rec);
    $("fcQueueTag").textContent = `剩余 ${Q.queue.length}`;
    return;
  }
  words[rec.w] = { box, due: addDays(todayStr(), BOX_DAYS[box]) };
  logDaily(isNew);
  S.stats[k] = (S.stats[k] || 0) + 1;
  S.stats.reviews = (S.stats.reviews || 0) + 1;
  markCheckinAuto();
  toast(k === "good" ? "很好，间隔拉长" : (isNew ? "新词已入队复习" : "已安排近期复习"));
  nextCard();
}

/* 词文串学按钮绑定（index 页） */
(function () {
  const btn = $("passageGen");
  if (!btn) return;
  aiRenderPassageSection();
  btn.addEventListener("click", () => aiGeneratePassage(!!S.passage));
})();

/* 键盘：空格翻面 / 1·2·3 评级 / S 发音 */
window.addEventListener("keydown", e => {
  if ($("dateModal") && $("dateModal").classList.contains("open")) return;
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === " ") { e.preventDefault(); reveal(); }
  if (revealed) {
    if (e.key === "1") grade("good");
    if (e.key === "2") grade("fuzzy");
    if (e.key === "3") grade("again");
  }
  if (e.key.toLowerCase() === "s" && current) speak(current.w);
});

nextCard();
