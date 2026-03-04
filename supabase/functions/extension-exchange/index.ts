import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const { code } = await req.json();
    if (!code || typeof code !== "string") throw new Error("Missing code");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: pairing, error: findErr } = await supabaseAdmin
      .from("extension_pairing_codes")
      .select("*")
      .eq("code", code.toUpperCase())
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (findErr) throw findErr;
    if (!pairing) throw new Error("Invalid or expired code");

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    const { error: tokenErr } = await supabaseAdmin
      .from("extension_tokens")
      .insert({ user_id: pairing.user_id, token_hash: tokenHash });
    if (tokenErr) throw tokenErr;

    await supabaseAdmin
      .from("extension_pairing_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", pairing.id);

    return new Response(JSON.stringify({
      access_token: token,
      user_id: pairing.user_id,
      expires_in_days: 30,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
