import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token",
};

async function resolveUser(req: Request): Promise<string> {
  const extToken = req.headers.get("x-extension-token");
  if (!extToken) throw new Error("Unauthorized");

  const tokenHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extToken)))
  ).map(b => b.toString(16).padStart(2, "0")).join("");

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await sb
    .from("extension_tokens")
    .select("user_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) throw new Error("Unauthorized");
  return data.user_id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await resolveUser(req);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (req.method === "GET") {
      const { data, error } = await sb
        .from("user_allowed_domains")
        .select("id, domain, enabled")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const { domain } = await req.json();
      const normalized = (domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
      if (!normalized) throw new Error("Domain required");

      const { data, error } = await sb
        .from("user_allowed_domains")
        .insert({ user_id: userId, domain: normalized, enabled: true })
        .select("id, domain, enabled")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("Domain already exists");
        throw error;
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "PATCH") {
      const { id, enabled } = await req.json();
      if (!id) throw new Error("Domain id required");
      const { error } = await sb
        .from("user_allowed_domains")
        .update({ enabled })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "DELETE") {
      const { id } = await req.json();
      if (!id) throw new Error("Domain id required");
      const { error } = await sb
        .from("user_allowed_domains")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Method not allowed");
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 400;
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
