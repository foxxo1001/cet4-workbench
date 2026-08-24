/* 词库选择页（banks.html）+ 每日新词设置 */
"use strict";

const BANK_ORDER = ["core", "exam", "freq", "full"];
const BANK_THEME = { core: "bc-core", exam: "bc-exam", freq: "bc-freq", full: "bc-full" };

function bankProgressOf(id) {
  const rec = S.banks[id] || {};
  const learned = Object.keys(rec).length;
  const total = window.CET_BANKS[id] ? window.CET_BANKS[id].list.length : 0;
  const known = Object.values(rec).filter(x => x.box >= 4).length;
  return { learned, total, known };
}

function renderBanks() {
  const wrap = $("bankCards");
  wrap.innerHTML = "";
  BANK_ORDER.forEach(id => {
    const bank = window.CET_BANKS[id];
    if (!bank) return;
    const p = bankProgressOf(id);
    const pct = p.total ? Math.round(p.learned / p.total * 100) : 0;
    const card = document.createElement("article");
    card.className = "box bank-card " + (BANK_THEME[id] || "") + (id === S.bankId ? " current" : "");
    card.innerHTML = `
      <div class="bk-head">
        <span class="bk-name">${bank.name}${id === S.bankId ? " · 使用中" : ""}</span>
        <span class="bk-count">${p.total} 词</span>
      </div>
      <div class="bk-body">
        <p class="bk-desc">${bank.desc || ""}</p>
        <div class="bk-meta">
          <span class="mini-tag">音标</span>
          <span class="mini-tag">释义</span>
          <span class="mini-tag">例句 / 短语</span>
          ${id === "exam" ? '<span class="mini-tag" style="background:var(--yellow);">251 真题选择题</span>' : ""}
        </div>
        <div class="bk-progress-line">
          <span>已学 ${p.learned}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--teal);"></div></div>
          <span class="mono">${pct}%</span>
        </div>
      </div>
      <div class="bk-foot"><button class="btn ${id === S.bankId ? "btn-teal" : "btn-red"} btn-sm" data-pick="${id}" ${id === S.bankId ? "disabled" : ""}>${id === S.bankId ? "当前词库" : "切换到这本"}</button></div>
    `;
    wrap.appendChild(card);
  });
  wrap.querySelectorAll("[data-pick]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.pick;
      if (switchBank(id)) {
        toast("已切换：" + window.CET_BANKS[id].name);
        renderBanks(); renderQuota();
      }
    });
  });
}

function renderQuota() {
  if ($("quotaInput")) $("quotaInput").value = dailyNew();
}

/* 每日新词设置 */
(function () {
  const input = $("quotaInput");
  if (!input) return;
  $("quotaSave").addEventListener("click", () => {
    const q = Math.min(200, Math.max(1, Math.round(Number(input.value)) || 10));
    S.dailyNew = q;
    save();
    toast("已保存：每日新词 " + q + " 个");
    renderBanks();
  });
})();

renderBanks();
renderQuota();
