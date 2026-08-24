/* AI 代理端点（Cloudflare Pages Functions：functions/api/ai.js → POST /api/ai）
   - 密钥存在 Pages 环境变量 AI_API_KEY，绝不进入前端代码
   - 转发到任意 OpenAI 兼容接口：AI_BASE_URL（默认智谱 GLM）+ AI_MODEL（默认 glm-4-flash）
   - 前端在「词库」页填了自己的 key 时不会走到这里（浏览器直连） */
const AI_SYS =
  "你是 CET-4 英语词汇老师。用中文紧凑回答：【记忆】词根词缀拆解或联想记忆法；" +
  "【辨析】1-2 个易混词对比或高频搭配；【场景】一个校园/考试相关的中文例句（英文原词保留）。" +
  "不超过 180 字，不要寒暄。结尾注明：AI 生成仅供参考。";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestPost(context) {
  const env = context.env || {};
  const key = env.AI_API_KEY;
  if (!key) {
    return json({ error: "AI_API_KEY 未配置：请在 Cloudflare Pages 项目 Settings > Environment variables 里添加" }, 500);
  }
  const base = String(env.AI_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, "");
  const model = String(env.AI_MODEL || "glm-4-flash");

  let user;
  try { user = String((await context.request.json()).user || ""); }
  catch (e) { return json({ error: "请求体无效" }, 400); }
  if (!user.trim()) return json({ error: "缺少提问内容" }, 400);

  try {
    const res = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: AI_SYS },
          { role: "user", content: user.slice(0, 2000) }
        ],
        temperature: 0.7,
        max_tokens: 600
      })
    });
    if (!res.ok) return json({ error: "上游服务错误 HTTP " + res.status }, 502);
    const data = await res.json();
    const content = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;
    if (!content) return json({ error: "上游返回格式异常" }, 502);
    return json({ content });
  } catch (e) {
    return json({ error: "无法连接 AI 服务：" + (e && e.message) }, 502);
  }
}
