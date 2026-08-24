/* 统计页（stats.html） */
"use strict";

function renderBars() {
  const bank = ACTIVE_BANK();
  const LIST = bank.list;
  const words = S.banks[S.bankId] || {};
  $("barsTitle").textContent = bank.name + " · 掌握分布";
  const buckets = [
    ["未学", w => !words[w.w], "#D8D2C4"],
    ["巩固期(box1-2)", w => words[w.w] && words[w.w].box <= 2, "#FFC914"],
    ["熟悉期(box3)", w => words[w.w] && words[w.w].box === 3, "#3D6DC2"],
    ["已掌握(box5毕业)", w => words[w.w] && words[w.w].box >= KNOWN_BOX, "#1B9E8F"]
  ];
  const total = LIST.length;
  $("barWrap").innerHTML = buckets.map(([label, fn, color]) => {
    const n = LIST.filter(fn).length;
    const pct = total ? Math.round(n / total * 100) : 0;
    return `<div class="bar-row"><span>${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};"></div></div>
      <span class="mono">${n}</span></div>`;
  }).join("");
}

function renderHistory() {
  const strip = $("historyStrip");
  strip.innerHTML = "";
  for (let i = 13; i >= 0; i--) {
    const d = addDays(todayStr(), -i);
    const chip = document.createElement("div");
    chip.className = "day-chip" + ((S.checkins[d] && S.checkins[d].some(v => v)) ? " hit" : "") + (i === 0 ? " today" : "");
    chip.textContent = d.slice(8);
    strip.appendChild(chip);
  }
}

function renderSummary() {
  $("sumStart").textContent = S.startDate || "—";
  const words = S.banks[S.bankId] || {};
  $("sumLearned").textContent = Object.keys(words).length + " 词";
  $("sumGood").textContent = (S.stats.good || 0) + " 次";
  $("sumAgain").textContent = (S.stats.again || 0) + " 次";
  $("sumTotal").textContent = (S.stats.reviews || 0) + " 次";
}

function renderAllBanks() {
  const wrap = $("allBanksProgress");
  wrap.innerHTML = "";
  ["core", "exam", "freq", "full"].forEach(id => {
    const bank = window.CET_BANKS[id];
    if (!bank) return;
    const rec = S.banks[id] || {};
    const learned = Object.keys(rec).length;
    const known = Object.values(rec).filter(x => x.box >= KNOWN_BOX).length;
    const line = document.createElement("div");
    line.className = "stat-line";
    line.innerHTML = `<span>${bank.name}<br><small style="font-weight:600;color:var(--muted);">已掌握 ${known} 词</small></span>
      <b>${learned} / ${bank.list.length}</b>`;
    wrap.appendChild(line);
  });
}

/* 近 14 天学词趋势：dailyLog 采集的每日新词柱状图（无记录的日子显示为空柱） */
function renderTrend() {
  const wrap = $("trendWrap");
  if (!wrap) return;
  const t = todayStr();
  const data = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(t, -i);
    const log = (S.dailyLog || {})[d] || {};
    data.push({ d, nw: log.new || 0, rv: log.reviews || 0 });
  }
  const max = Math.max(1, ...data.map(x => x.nw));
  wrap.innerHTML =
    `<div style="display:flex;align-items:flex-end;gap:5px;height:90px;padding:6px 4px 0;">` +
    data.map(x =>
      `<div title="${x.d} · 新词 ${x.nw} · 答题 ${x.rv}" ` +
      `style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;text-align:center;">` +
      `<span class="mono" style="font-size:.6rem;font-weight:800;color:${x.nw ? "var(--ink)" : "var(--muted)"};opacity:.75;">${x.d.slice(8)}</span>` +
      `<div style="height:${Math.round(x.nw / max * 62)}px;background:${x.nw ? "var(--teal)" : "#D8D2C4"};border:2px solid var(--ink);border-radius:2px;margin-top:3px;"></div>` +
      `</div>`
    ).join("") +
    `</div>
     <p class="modal-note" style="margin-top:10px;">每日新学词数 · 近 14 天。当前词库 ${etaText()}</p>`;
}

renderBars();
renderTrend();
renderHistory();
renderSummary();
renderAllBanks();
