/* AI 讲词（增强模块）：
   - 服务商无关：任意 OpenAI 兼容接口（智谱/DeepSeek/Kimi/Qwen/SiliconFlow…）
   - 双通道：设置页填了 key → 浏览器直连服务商；只开开关不填 key → 走 /api/ai 代理（key 在 CF 环境变量）
   - 结果缓存进 localStorage：一个词只花一次请求
   - 每日上限 AI_DAILY_LIMIT 次，防止额度烧穿
   - 核心背词流程零依赖本模块：没网/没 key 时按钮根本不出现 */
"use strict";

const AI_DAILY_LIMIT = 30;
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

function aiEnabled() {
  return !!(S.aiConfig && S.aiConfig.on);
}
function aiLocalMode() {          // 本地填了 key+base → 浏览器直连
  return !!(S.aiConfig && (S.aiConfig.key || "").trim() && (S.aiConfig.base || "").trim());
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

async function aiCall(user) {
  let res;
  if (aiLocalMode()) {
    const base = S.aiConfig.base.replace(/\/+$/, "");
    res = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + S.aiConfig.key.trim() },
      body: JSON.stringify({
        model: (S.aiConfig.model || "").trim() || "glm-4-flash",
        messages: [{ role: "system", content: AI_SYS }, { role: "user", content: user }],
        temperature: 0.7, max_tokens: 600
      })
    });
  } else {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
  }
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
  return aiCall("请只回复四个字：链路正常");
}
