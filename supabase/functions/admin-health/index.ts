import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminEmail = Deno.env.get("ADMIN_EMAIL") || "";

    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Admin check
    if (adminEmail && user.email !== adminEmail) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use service role for aggregated queries
    const db = createClient(supabaseUrl, serviceKey);

    // AI provider usage & status from assistant_runs
    const { data: runs } = await db.from("assistant_runs").select("result_json").order("created_at", { ascending: false }).limit(500);
    const aiProviders: Record<string, number> = {};
    const aiStatuses: Record<string, number> = {};
    let voiceTotal = 0;
    let voiceEmpty = 0;

    for (const run of (runs ?? [])) {
      const r = run.result_json as any;
      if (r?.provider_used) aiProviders[r.provider_used] = (aiProviders[r.provider_used] || 0) + 1;
      const status = r?.ai_status ?? "unknown";
      aiStatuses[status] = (aiStatuses[status] || 0) + 1;
    }

    // Bank import stats
    const { data: imports } = await db.from("bank_statement_imports").select("status, file_type, error_message").limit(1000);
    const importStatuses: Record<string, number> = {};
    const importTypes: Record<string, number> = {};
    const failureReasons: Record<string, number> = {};

    for (const imp of (imports ?? [])) {
      importStatuses[imp.status] = (importStatuses[imp.status] || 0) + 1;
      importTypes[imp.file_type] = (importTypes[imp.file_type] || 0) + 1;
      if (imp.status === "failed" && imp.error_message) {
        const reason = imp.error_message.slice(0, 80);
        failureReasons[reason] = (failureReasons[reason] || 0) + 1;
      }
    }

    const topFailures = Object.entries(failureReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([r, c]) => `${r} (${c})`);

    const result = {
      ai_providers: aiProviders,
      ai_statuses: aiStatuses,
      voice_total: voiceTotal,
      voice_empty_rate: voiceTotal > 0 ? voiceEmpty / voiceTotal : 0,
      import_statuses: importStatuses,
      import_types: importTypes,
      top_failures: topFailures,
      total_runs: (runs ?? []).length,
    };

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
