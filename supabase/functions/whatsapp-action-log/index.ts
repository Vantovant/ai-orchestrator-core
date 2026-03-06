import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token",
};

async function resolveUser(req: Request): Promise<string> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const extToken = req.headers.get("x-extension-token");
  if (extToken) {
    const tokenHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extToken)))
    ).map(b => b.toString(16).padStart(2, "0")).join("");
    const { data } = await sb
      .from("extension_tokens").select("user_id")
      .eq("token_hash", tokenHash).is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (data) return data.user_id;
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await uc.auth.getUser();
    if (user && !error) return user.id;
  }
  throw new Error("Unauthorized");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await resolveUser(req);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // GET: fetch actions for a chat_key
    if (req.method === "GET") {
      const url = new URL(req.url);
      const chatKey = url.searchParams.get("chat_key");
      if (!chatKey) throw new Error("chat_key required");

      const { data, error } = await sb
        .from("whatsapp_action_log")
        .select("id, chat_key, chat_title, action_type, related_id, meta_json, created_at")
        .eq("user_id", userId)
        .eq("chat_key", chatKey)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ actions: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: log an action
    if (req.method === "POST") {
      const { chat_key, chat_title, action_type, related_id, meta } = await req.json();
      if (!chat_key || !action_type) throw new Error("chat_key and action_type required");

      const { data, error } = await sb
        .from("whatsapp_action_log")
        .insert({
          user_id: userId,
          chat_key,
          chat_title: chat_title || null,
          action_type,
          related_id: related_id || null,
          meta_json: meta || {},
        })
        .select("id, chat_key, action_type, created_at")
        .single();

      if (error) throw error;

      // Return updated action list for stamp
      const { data: allActions } = await sb
        .from("whatsapp_action_log")
        .select("id, chat_key, chat_title, action_type, related_id, created_at")
        .eq("user_id", userId)
        .eq("chat_key", chat_key)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      return new Response(JSON.stringify({
        logged: data,
        actions: allActions || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("GET or POST only");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Unauthorized" ? 401 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
