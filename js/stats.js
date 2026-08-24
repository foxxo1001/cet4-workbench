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
    ["已掌握(box4+)", w => words[w.w] && words[w.w].box >= 4, "#1B9E8F"]
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
    const known = Object.values(rec).filter(x => x.box >= 4).length;
    const line = document.createElement("div");
    line.className = "stat-line";
    line.innerHTML = `<span>${bank.name}<br><small style="font-weight:600;color:var(--muted);">已掌握 ${known} 词</small></span>
      <b>${learned} / ${bank.list.length}</b>`;
    wrap.appendChild(line);
  });
}

renderBars();
renderHistory();
renderSummary();
renderAllBanks();
