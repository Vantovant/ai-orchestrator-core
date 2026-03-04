import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token",
};

async function hashString(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function resolveUser(req: Request): Promise<{ userId: string }> {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Try extension token first
  const extToken = req.headers.get("x-extension-token");
  if (extToken) {
    const tokenHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extToken)))
    ).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data } = await supabaseAdmin
      .from("extension_tokens")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (data) return { userId: data.user_id };
    throw new Error("Invalid extension token");
  }

  // Fall back to Supabase auth
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await supabaseUser.auth.getUser();
    if (user && !error) return { userId: user.id };
  }

  throw new Error("Unauthorized");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const { userId } = await resolveUser(req);
    const { url, title, selected_text, page_summary, project_id, metadata } = await req.json();

    if (!url) throw new Error("URL required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Domain check
    const domain = new URL(url).hostname;
    const { data: allowedDomain } = await supabaseAdmin
      .from("user_allowed_domains")
      .select("id")
      .eq("user_id", userId)
      .eq("domain", domain)
      .eq("enabled", true)
      .maybeSingle();

    if (!allowedDomain) {
      return new Response(JSON.stringify({ error: "Domain not in allowlist", domain }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedupe key
    const normalizedText = (selected_text || "").toLowerCase().replace(/\s+/g, " ").trim();
    const dedupeInput = `${userId}|${project_id || ""}|${url}|${normalizedText}`;
    const dedupeKey = await hashString(dedupeInput);

    // Upsert source_context
    const { data: existing } = await supabaseAdmin
      .from("source_context")
      .select("id")
      .eq("user_id", userId)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    let sourceContextId: string;
    let action: "created" | "merged";

    if (existing) {
      sourceContextId = existing.id;
      action = "merged";
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("source_context")
        .insert({
          user_id: userId,
          source_url: url,
          source_title: title || null,
          domain,
          snippet_text: selected_text || null,
          metadata_json: metadata || {},
          dedupe_key: dedupeKey,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      sourceContextId = inserted.id;
      action = "created";
    }

    // If project_id provided, create inbox item
    let inboxItemId: string | null = null;
    if (project_id) {
      const { data: inbox, error: inboxErr } = await supabaseAdmin
        .from("project_inbox_items")
        .insert({
          user_id: userId,
          project_id,
          title: title || url,
          body: selected_text || page_summary || null,
          source_context_id: sourceContextId,
        })
        .select("id")
        .single();
      if (inboxErr) throw inboxErr;
      inboxItemId = inbox.id;
    }

    return new Response(JSON.stringify({
      action,
      source_context_id: sourceContextId,
      inbox_item_id: inboxItemId,
      project_id: project_id || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.message === "Unauthorized" ? 401 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
