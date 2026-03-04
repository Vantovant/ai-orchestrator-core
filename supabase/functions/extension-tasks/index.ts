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
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");
    const sort = url.searchParams.get("sort") || "latest";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (sort === "priority") {
      // Use RPC to get proper CASE-based priority ordering
      const { data, error } = await sb.rpc("get_tasks_by_priority", {
        p_user_id: userId,
        p_project_id: projectId,
        p_limit: limit,
      });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = sb
      .from("tasks")
      .select("id, title, status, priority, due_date, project_id, created_at, last_touched_at")
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (projectId) query = query.eq("project_id", projectId);

    if (sort === "due_date") {
      query = query.order("due_date", { ascending: true, nullsFirst: false });
    } else {
      // "latest" — match VantoOS: last_touched_at DESC, created_at DESC
      query = query.order("last_touched_at", { ascending: false }).order("created_at", { ascending: false });
    }

    const { data, error } = await query.limit(limit);
    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 400;
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
