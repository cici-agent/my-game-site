import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Agora AccessToken2 简化实现
// 对于没有开启 Primary Certificate 的项目，token 传 null 即可
async function buildToken(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  expireSeconds: number
): Promise<string | null> {
  // 如果没有配置 Certificate，返回 null（App ID 鉴权模式）
  if (!appCertificate || appCertificate === "NONE" || appCertificate === "") {
    return null;
  }

  // 生成 Agora RTC Token（简化版，适合小项目）
  const currentTime = Math.floor(Date.now() / 1000);
  const expireTime = currentTime + expireSeconds;

  const msgBuf = new TextEncoder().encode(
    `${appId}${channelName}${uid}${expireTime}`
  );
  const keyBuf = new TextEncoder().encode(appCertificate);

  const key = await crypto.subtle.importKey(
    "raw", keyBuf, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, msgBuf);
  const sigHex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  // 简单 token 格式（非官方 AccessToken2，适合测试）
  const payload = btoa(JSON.stringify({ appId, channelName, uid, expireTime, sig: sigHex }));
  return `007${payload}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      channelName,
      uid = Math.floor(Math.random() * 100000),
      expireSeconds = 3600,
    } = body;

    if (!channelName) {
      return new Response(
        JSON.stringify({ error: "channelName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appId = Deno.env.get("AGORA_APP_ID");
    const appCertificate = Deno.env.get("AGORA_APP_CERTIFICATE") ?? "";

    if (!appId) {
      return new Response(
        JSON.stringify({ error: "Agora App ID not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await buildToken(appId, appCertificate, channelName, uid, expireSeconds);

    return new Response(
      JSON.stringify({ appId, token, channelName, uid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("agora-token error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
