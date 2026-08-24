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
  });
})();

/* 每日复习上限 */
(function () {
  const input = $("reviewCapInput");
  if (!input) return;
  input.value = dailyReviewCap();
  $("reviewCapSave").addEventListener("click", () => {
    const q = Math.min(500, Math.max(10, Math.round(Number(input.value)) || 100));
    S.dailyReviewCap = q;
    save();
    toast("已保存：每日复习上限 " + q + " 个");
  });
})();

/* 数据备份 / 恢复 */
(function () {
  const exportBtn = $("exportBtn"), importBtn = $("importBtn"),
        fileInput = $("importFile"), info = $("backupInfo");
  if (!exportBtn) return;

  function totalLearned() {
    let n = 0;
    for (const id of Object.keys(S.banks)) n += Object.keys(S.banks[id] || {}).length;
    return n;
  }
  info.textContent = "当前已学 " + totalLearned() + " 词 · 备份于本机";

  exportBtn.addEventListener("click", () => {
    const payload = { app: "cet4-workbench", schema: 1, exportedAt: new Date().toISOString(), state: (() => { const c = Object.assign({}, S); delete c.words; delete c.cursor; return c; })() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cet4-backup-" + todayStr() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("备份已下载");
  });

  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.app !== "cet4-workbench" || !data.state || typeof data.state.banks !== "object") {
          toast("文件格式不对，不是有效的备份"); return;
        }
        if (!confirm("导入将覆盖当前全部进度，确定继续？")) return;
        localStorage.setItem(LS_KEY, JSON.stringify(data.state));
        location.reload();
      } catch (e) { toast("备份文件解析失败"); }
    };
    reader.readAsText(f);
    fileInput.value = "";
  });
})();

/* 背词设置：自动发音 */
(function(){
  const chk=$("autoSpeakChk");
  if(!chk)return;
  chk.checked=S.autoSpeak!==false;
  chk.addEventListener("change",()=>{S.autoSpeak=chk.checked;save();toast(chk.checked?"自动发音已开启":"自动发音已关闭");});
})();

renderBanks();
renderQuota();
