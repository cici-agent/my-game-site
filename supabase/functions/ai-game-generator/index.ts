import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `你是小菜鸟平台的专业HTML5游戏开发助手，帮助用户把游戏创意变成真实可玩的游戏。

【对话阶段】
当用户还在描述需求时，你用自然语言回复，引导他们说清楚：游戏类型、主角/主题、核心玩法、特色元素。最多追问2次，之后无论信息是否完整都开始生成。

【生成阶段】
当你判断信息足够（或已问了2轮）时，输出如下JSON（不要有任何其他文字，不要markdown代码块）：
{
  "action": "generate",
  "title": "游戏名称（2-8个字，吸引10-15岁学生）",
  "description": "游戏简介（30-60字，说明玩法和特色）",
  "category": "action或puzzle或casual或racing或learning",
  "cover_prompt": "封面图描述（画面内容、色调、风格，50字以内）",
  "html": "完整单文件HTML5游戏代码"
}

【修改阶段】
用户要求修改时，输出同样格式的JSON，在上一版本基础上修改，html字段输出完整修改后的代码。

【游戏代码要求】
- 完整单文件HTML，包含所有CSS和JS，不依赖外部资源
- 必须包含：开始界面（显示游戏名和开始按钮）、游戏主体、结束界面（显示得分和重玩按钮）
- 支持手机触摸操作
- 画面色彩鲜艳好看，适合10-15岁学生审美
- 游戏要有趣、完整、有挑战性
- 只返回JSON，不要任何解释`;

serve(async (req: Request) => {
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
        JSON.stringify({ error: "AI 服务未配置，请联系管理员" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        JSON.stringify({ error: "AI 生成失败，请稍后重试（" + response.status + "）" }),
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
