/* AI 代理端点（Cloudflare Pages Functions：functions/api/ai.js → POST /api/ai）
   - 双模式：
     A) 用户在设置页填了自己的 key/base/model → 随请求透传，服务端转发（绕开浏览器 CORS 限制），不存储
     B) 未填 → 用 Pages 环境变量 AI_API_KEY（站长配置）
   - base 自动纠错：去掉结尾的 /chat/completions、/models、多余斜杠 */
const DEFAULT_BASE = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MODEL = "glm-4-flash";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function sanitizeBase(raw) {
  let b = String(raw || "").trim().replace(/\/+$/, "");
  b = b.replace(/\/(chat\/completions|models|embeddings)$/i, "");
  return b;
}

export async function onRequestPost(context) {
  const env = context.env || {};
  let body;
  try { body = await context.request.json(); }
  catch (e) { return json({ error: "请求体无效" }, 400); }

  const user = String((body && body.user) || "").trim();
  const system = String((body && body.system) || "").trim();
  if (!user) return json({ error: "缺少提问内容" }, 400);

  /* 凭证解析：请求自带优先，环境变量兜底 */
  const key = String((body && body.key) || "").trim() || env.AI_API_KEY;
  if (!key) {
    return json({ error: "未配置 AI 凭证：请在设置页填写 API Key，或由站长配置环境变量 AI_API_KEY" }, 500);
  }
  const base = sanitizeBase(body && body.base) || sanitizeBase(env.AI_BASE_URL) || DEFAULT_BASE;
  const model = String((body && body.model) || "").trim() || String(env.AI_MODEL || "").trim() || DEFAULT_MODEL;

  try {
    const res = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user.slice(0, 4000) }
        ],
        temperature: 0.8,
        max_tokens: 900
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ error: "上游服务错误 HTTP " + res.status + (detail ? "：" + detail.slice(0, 160) : "") }, 502);
    }
    const data = await res.json();
    const content = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;
    if (!content) return json({ error: "上游返回格式异常" }, 502);
    return json({ content });
  } catch (e) {
    return json({ error: "无法连接 AI 服务：" + (e && e.message) }, 502);
  }
}
