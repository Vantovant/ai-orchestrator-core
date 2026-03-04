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
      .from("extension_tokens")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (data) return data.user_id;
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await userClient.auth.getUser();
    if (user && !error) return user.id;
  }

  throw new Error("Unauthorized");
}

async function hashString(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const userId = await resolveUser(req);
    const { title, project_id, priority, dedupe_key, source_context_id, source } = await req.json();

    if (!title || typeof title !== "string" || !title.trim()) {
      throw new Error("title is required");
    }

    const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
    const effectiveDedupeKey = dedupe_key ||
      await hashString(`${userId}|${project_id || ""}|${normalizedTitle}|${source_context_id || ""}|${source || ""}`);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check for existing task with same dedupe_key
    let query = sb
      .from("tasks")
      .select("id, title, priority, project_id, last_touched_at")
      .eq("user_id", userId)
      .eq("dedupe_key", effectiveDedupeKey)
      .is("deleted_at", null);

    if (project_id) {
      query = query.eq("project_id", project_id);
    } else {
      query = query.is("project_id", null);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      // Merge: update last_touched_at, optionally update priority/title
      const updates: Record<string, unknown> = { last_touched_at: new Date().toISOString() };
      if (priority && priority !== existing.priority) updates.priority = priority;

      const { error: updateErr } = await sb
        .from("tasks")
        .update(updates)
        .eq("id", existing.id);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({
        action: "merged",
        task_id: existing.id,
        project_id: existing.project_id,
        last_touched_at: updates.last_touched_at,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create new task
    const now = new Date().toISOString();
    const { data: inserted, error: insertErr } = await sb
      .from("tasks")
      .insert({
        user_id: userId,
        title: title.trim(),
        priority: priority || "medium",
        project_id: project_id || null,
        dedupe_key: effectiveDedupeKey,
        source: source || "smart-capture",
        last_touched_at: now,
        status: "todo",
      })
      .select("id, project_id, last_touched_at")
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({
      action: "created",
      task_id: inserted.id,
      project_id: inserted.project_id,
      last_touched_at: inserted.last_touched_at,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Unauthorized" ? 401 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
