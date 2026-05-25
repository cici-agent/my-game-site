import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `你是小菜鸟平台的专业HTML5游戏开发助手。用户描述游戏需求，你需要输出一个完整的JSON对象，包含游戏的所有发布信息。

输出格式必须严格是如下JSON（不要有任何其他文字）：
{
  "title": "游戏名称（2-8个字，吸引人）",
  "description": "游戏简介（30-60字，说明玩法和特色，吸引小学生和初中生）",
  "category": "游戏分类（只能是以下之一：action/puzzle/casual/racing/learning）",
  "cover_prompt": "封面图描述（用于生成封面，描述画面内容、色调、风格，50字以内）",
  "html": "完整的单文件HTML5游戏代码"
}

游戏代码要求：
- 必须是完整的单文件HTML，包含所有CSS和JS
- 不依赖任何外部资源（无CDN、无图片URL）
- 使用Canvas或DOM实现游戏逻辑
- 必须包含：开始界面、游戏主体、结束/得分界面
- 支持手机触摸操作
- 画面色彩鲜艳，适合10-15岁学生
- 代码注释清晰

游戏名称规则：
- 简短有力，2-8个字
- 体现游戏核心玩法
- 可爱或酷炫风格，符合小学生/初中生审美
- 例如：「像素大冒险」「星际守卫战」「糖果消消乐」

多轮对话规则：
- 如果用户要求修改（如"把背景改成蓝色"、"加个计分板"），在上一版本基础上修改
- title/description/category 可根据修改内容适当调整
- 每次都输出完整JSON`;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "请提供游戏描述" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("Deepseek");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AI 服务未配置" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the full messages array with system prompt
    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: fullMessages,
        temperature: 0.8,
        max_tokens: 16384,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("DeepSeek API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "AI 生成失败，请稍后重试" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "服务器内部错误" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
