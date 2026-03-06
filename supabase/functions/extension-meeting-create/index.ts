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

async function hashString(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const userId = await resolveUser(req);
    const { title, project_id, description, start_time, end_time, location, dedupe_key, source } = await req.json();

    if (!title?.trim()) throw new Error("title is required");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Compute dedupe key
    const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
    const effectiveDedupeKey = dedupe_key || await hashString(`${userId}|meeting|${project_id || ""}|${normalizedTitle}`);

    // Check for existing meeting with same title today
    const { data: existing } = await sb
      .from("meetings")
      .select("id, title")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .ilike("title", normalizedTitle)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        action: "merged",
        meeting_id: existing.id,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Default start_time: tomorrow 9am
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() + 1);
    defaultStart.setHours(9, 0, 0, 0);
    const defaultEnd = new Date(defaultStart);
    defaultEnd.setHours(10, 0, 0, 0);

    const { data: inserted, error } = await sb
      .from("meetings")
      .insert({
        user_id: userId,
        title: title.trim(),
        description: description || null,
        project_id: project_id || null,
        start_time: start_time || defaultStart.toISOString(),
        end_time: end_time || defaultEnd.toISOString(),
        location: location || null,
        notes: source ? `Source: ${source}` : null,
      })
      .select("id")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({
      action: "created",
      meeting_id: inserted.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Unauthorized" ? 401 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
