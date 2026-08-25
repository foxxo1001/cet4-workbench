/* AI 讲词（增强模块）：
   - 服务商无关：任意 OpenAI 兼容接口（智谱/DeepSeek/Kimi/Qwen/SiliconFlow…）
   - 双通道：设置页填了 key → 浏览器直连服务商；只开开关不填 key → 走 /api/ai 代理（key 在 CF 环境变量）
   - 结果缓存进 localStorage：一个词只花一次请求
   - 每日上限 AI_DAILY_LIMIT 次，防止额度烧穿
   - 核心背词流程零依赖本模块：没网/没 key 时按钮根本不出现 */
"use strict";

const AI_DAILY_LIMIT = 30;
const PASSAGE_DAILY_LIMIT = 10;
const AI_PROVIDERS = {
  zhipu:       { label: "智谱 GLM",    base: "https://open.bigmodel.cn/api/paas/v4",                model: "glm-4-flash" },
  deepseek:    { label: "DeepSeek",    base: "https://api.deepseek.com/v1",                         model: "deepseek-chat" },
  kimi:        { label: "Kimi 月之暗面", base: "https://api.moonshot.cn/v1",                         model: "moonshot-v1-8k" },
  qwen:        { label: "通义千问",     base: "https://dashscope.aliyuncs.com/compatible-mode/v1",   model: "qwen-turbo" },
  siliconflow: { label: "SiliconFlow", base: "https://api.siliconflow.cn/v1",                       model: "THUDM/glm-4-9b-chat" },
  custom:      { label: "自定义",       base: "",                                                    model: "" }
};
const AI_SYS =
  "你是 CET-4 英语词汇老师。用中文紧凑回答：【记忆】词根词缀拆解或联想记忆法；" +
  "【辨析】1-2 个易混词对比或高频搭配；【场景】一个校园/考试相关的中文例句（英文原词保留）。" +
  "不超过 180 字，不要寒暄。结尾注明：AI 生成仅供参考。";

/* 词文串学 system：外刊风格短文 */
const PASSAGE_SYS =
  "你是外刊专栏作者兼 CET-4 词汇老师。请用所给单词写一篇 90-140 词的英文短文，" +
  "风格模仿 The Economist / Guardian 的教育、科技或社会类短评，观点清晰有细节。" +
  "要求：① 每个指定单词至少自然使用一次（可用其屈折变化）；② 难度贴合 CET-4，" +
  "其余词汇控制在高中至四级范围；③ 短文后另起一行，先用一句中文概括主旨（以「概要：」开头），" +
  "再列出文中出现的目标词及其在文中的词性和中文释义。全文不要任何 markdown 标记。" +
  "结尾注明：AI 生成短文仅供参考。";

function aiEnabled() {
  return !!(S.aiConfig && S.aiConfig.on);
}
function aiLocalMode() {          // 本地填了 key+base → 随代理请求透传自己的凭证
  return !!(S.aiConfig && (S.aiConfig.key || "").trim() && (S.aiConfig.base || "").trim());
}
/* base 纠错：去掉结尾 /chat/completions、/models、多余斜杠（用户常从文档复制错） */
function aiSanitizeBase(raw) {
  let b = String(raw || "").trim().replace(/\/+$/, "");
  b = b.replace(/\/(chat\/completions|models|embeddings)$/i, "");
  return b;
}
function aiEnsureCount() {
  const t = todayStr();
  if (!S.aiCount || S.aiCount.date !== t) S.aiCount = { date: t, count: 0 };
}
function aiEsc(s) {
  return String(s == null ? "" : s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}
function aiExtractContent(data) {
  return (data && data.content) ||
    (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}
function aiUserPrompt(rec) {
  const zh = (rec.trans || []).map(x => x.zh).join("；").slice(0, 80);
  return "单词 " + rec.w + (zh ? "（当前释义：" + zh + "）" : "") + "。请按系统设定给出记忆法讲解。";
}

async function aiCall(user, systemPrompt) {
  const sys = systemPrompt || AI_SYS;
  /* 统一走 /api/ai 代理：本地填了 key 就随请求透传（服务端转发，绕开浏览器 CORS），
     未填则用站长配置的环境变量凭证。任何 OpenAI 兼容服务商都可达 */
  const payload = { user, system: sys };
  if (aiLocalMode()) {
    payload.key = S.aiConfig.key.trim();
    payload.base = aiSanitizeBase(S.aiConfig.base);
    payload.model = (S.aiConfig.model || "").trim();
  }
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
  const content = aiExtractContent(data);
  if (!content) throw new Error("AI 返回为空");
  return content;
}

function aiShowBox(html) {
  const box = $("aiBox");
  if (!box) return;
  box.classList.remove("hidden-extra");
  box.innerHTML = html;
}

/* 入口：翻面后点「AI 讲解」（缓存 → 上限 → 调用 → 渲染并落盘） */
async function aiExplain(rec) {
  if (!aiEnabled() || !rec) return;
  S.aiCache = S.aiCache || {};
  const btn = $("aiBtn");

  if (S.aiCache[rec.w]) {                       // 缓存命中：零请求
    if (btn) btn.remove();
    aiShowBox(S.aiCache[rec.w]);
    return;
  }

  aiEnsureCount();
  if ((S.aiCount.count || 0) >= AI_DAILY_LIMIT) {
    toast("今日 AI 讲解已达上限 " + AI_DAILY_LIMIT + " 次，明天再来");
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "✨ 讲解中…"; }
  aiShowBox('<span style="color:var(--muted);font-weight:700;font-size:.85rem;">✨ AI 正在拆解 ' + aiEsc(rec.w) + ' …</span>');
  try {
    const content = await aiCall(aiUserPrompt(rec));
    const html = '<span class="x-cap">✨ AI 讲解</span>' +
      '<div style="font-size:.86rem;font-weight:600;line-height:1.75;white-space:pre-wrap;">' + aiEsc(content) + "</div>" +
      '<span style="display:block;margin-top:6px;font-size:.68rem;color:var(--muted);">已缓存 · 下次秒开</span>';
    S.aiCache[rec.w] = html;
    aiEnsureCount();
    S.aiCount.count = (S.aiCount.count || 0) + 1;
    save();
    aiShowBox(html);
    if (btn) btn.remove();
  } catch (e) {
    aiShowBox('<span class="x-cap">✨ AI 讲解</span>' +
      '<div style="font-size:.84rem;font-weight:700;color:var(--red);">调用失败：' + aiEsc(e.message) + "</div>");
    if (btn) { btn.disabled = false; btn.textContent = "✨ AI 讲解（重试）"; }
  }
}

/* 设置页连通性测试 */
async function aiPing() {
  return aiCall("请只回复四个字：链路正常", PASSAGE_SYS);
}

/* ============ 词文串学 ============ */
/* 选词：到期复习优先（due≤今天且未毕业），不足补已学词，上限 8；可用词 <3 返回 null */
function pickWordsForPassage() {
  const t = todayStr();
  const LIST = ACTIVE_BANK().list;
  const words = S.banks[S.bankId] || {};
  const due = [], learned = [];
  for (const rec of LIST) {
    const st = words[rec.w];
    if (!st || st.box >= KNOWN_BOX) continue;
    (st.due <= t ? due : learned).push(rec.w);
  }
  const picked = due.concat(learned).slice(0, 8);
  return picked.length >= 3 ? picked : null;
}

/* 生成当日短文（force=true 强制重生成，忽略缓存与同日去重）*/
async function aiGeneratePassage(force) {
  if (!aiEnabled()) return;
  aiEnsureCount();
  const ws = pickWordsForPassage();
  const sec = $("passageSec");
  if (!ws) {
    if (sec) sec.style.display = "none";
    return;
  }
  if (sec) sec.style.display = "";

  /* 缓存：同一天 + 同词库 + 同一批词直接复用 */
  if (!force && S.passage && S.passage.date === todayStr() &&
      S.passage.bank === S.bankId &&
      JSON.stringify(S.passage.words) === JSON.stringify(ws)) {
    aiRenderPassage();
    return;
  }

  if ((S.passageCount || { count: 0 }).count >= PASSAGE_DAILY_LIMIT) {
    toast("今日词文串学已达上限 " + PASSAGE_DAILY_LIMIT + " 篇，明天再来");
    return;
  }

  const btn = $("passageGen");
  if (btn) { btn.disabled = true; btn.textContent = "✨ 生成中…"; }
  const enBox = $("passageEn");
  if (enBox) enBox.innerHTML = '<span style="color:var(--muted);font-weight:700;">✨ AI 正在根据你的单词写外刊风短文…</span>';

  try {
    const zhList = ws.map(w => {
      const rec = ACTIVE_BANK().list.find(x => x.w === w);
      return w + (rec && rec.trans && rec.trans[0] ? "(" + rec.trans[0].zh.slice(0, 20) + ")" : "");
    });
    const user = "请围绕这些 CET-4 单词写短文：" + zhList.join("、");
    const content = await aiCall(user, PASSAGE_SYS);

    const html =
      '<div class="passage-en">' + aiHighlightWords(aiEsc(content), ws) + "</div>" +
      '<div class="passage-words">本篇单词：' + ws.map(w => "<b>" + aiEsc(w) + "</b>").join(" · ") + "</div>";
    S.passage = { date: todayStr(), bank: S.bankId, words: ws, text: content };
    aiEnsureCount();
    S.passageCount = S.passageCount || { date: "", count: 0 };
    if (S.passageCount.date !== todayStr()) S.passageCount = { date: todayStr(), count: 0 };
    S.passageCount.count++;
    save();

    aiRenderPassage(html);
    if (btn) { btn.disabled = false; btn.textContent = "🔄 换一篇"; }
  } catch (e) {
    if (enBox) enBox.innerHTML = '<span style="color:var(--red);font-weight:700;">生成失败：' + aiEsc(e.message) + "</span>";
    if (btn) { btn.disabled = false; btn.textContent = "✨ 再试一次"; }
  }
}

/* 目标词高亮（整词匹配，不区分大小写）*/
function aiHighlightWords(escapedHtml, words) {
  let out = escapedHtml;
  for (const w of words) {
    const re = new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*)\\b", "gi");
    out = out.replace(re, "<mark>$1</mark>");
  }
  return out;
}

/* 渲染：无参时从 S.passage 缓存取；有参直接用新生成的 html */
function aiRenderPassage(html) {
  const enBox = $("passageEn");
  if (!enBox) return;
  const p = S.passage;
  if (!html && (!p || !p.text)) return;
  const ws = (p && p.words) || [];
  const text = html || "";
  const bodyHtml = html ||
    '<div class="passage-en">' + aiHighlightWords(aiEsc(p.text), ws) + "</div>" +
    '<div class="passage-words">本篇单词：' + ws.map(w => "<b>" + aiEsc(w) + "</b>").join(" · ") + "</div>";
  enBox.innerHTML = bodyHtml;
}

/* 区块入口：AI 关闭或可用词不足时隐藏整个区块 */
function aiRenderPassageSection() {
  const sec = $("passageSec");
  if (!sec) return;
  if (!aiEnabled()) { sec.style.display = "none"; return; }
  sec.style.display = "";
  if (pickWordsForPassage() === null) {
    sec.style.display = "none";
    return;
  }
  /* 已有当日缓存则先展示，按钮保持「换一篇」 */
  if (S.passage && S.passage.date === todayStr()) {
    aiRenderPassage();
    const btn = $("passageGen");
    if (btn) btn.textContent = "🔄 换一篇";
  }
}

