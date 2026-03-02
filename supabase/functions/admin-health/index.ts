import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PII detection patterns (mirrors redact-sensitive)
const PII_PATTERNS: Record<string, RegExp> = {
  sa_id: /\b\d{13}\b/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone_intl: /\+27\s?\d[\d\s-]{7,12}/g,
  long_raw_prompt: /.{3001,}/g, // any string > 3000 chars = possible raw dump
};

function scanForPII(text: string): Record<string, number> {
  const hits: Record<string, number> = {};
  for (const [key, pattern] of Object.entries(PII_PATTERNS)) {
    const re = new RegExp(pattern.source, pattern.flags);
    const matches = text.match(re);
    if (matches && matches.length > 0) hits[key] = matches.length;
  }
  return hits;
}

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

    // KB stats
    const { count: kbUploads } = await db.from("kb_files").select("id", { count: "exact", head: true });
    const { count: kbQueries } = await db.from("kb_query_log").select("id", { count: "exact", head: true });

    // KB provider usage
    const { data: kbLogs } = await db.from("kb_query_log").select("provider").limit(500);
    const kbProviderUsage: Record<string, number> = {};
    for (const log of (kbLogs ?? [])) {
      kbProviderUsage[log.provider] = (kbProviderUsage[log.provider] || 0) + 1;
    }

    // ====== PII PROOF SCAN ======
    // Scan KB query logs for any leaked PII (should all be redacted)
    const { data: queryLogs } = await db.from("kb_query_log").select("query_redacted").limit(200);
    let piiTotalHits = 0;
    const piiScanDetails: Record<string, number> = {};

    for (const log of (queryLogs ?? [])) {
      const hits = scanForPII(log.query_redacted || "");
      for (const [type, count] of Object.entries(hits)) {
        piiTotalHits += count;
        piiScanDetails[type] = (piiScanDetails[type] || 0) + count;
      }
    }

    // Also scan assistant_runs snapshots for PII leaks
    for (const run of (runs ?? []).slice(0, 100)) {
      const snapshot = typeof run.result_json === "string" ? run.result_json : JSON.stringify(run.result_json);
      const hits = scanForPII(snapshot.slice(0, 5000)); // cap scan size
      for (const [type, count] of Object.entries(hits)) {
        piiTotalHits += count;
        piiScanDetails[type] = (piiScanDetails[type] || 0) + count;
      }
    }

    const result = {
      ai_providers: aiProviders,
      ai_statuses: aiStatuses,
      voice_total: voiceTotal,
      voice_empty_rate: voiceTotal > 0 ? voiceEmpty / voiceTotal : 0,
      import_statuses: importStatuses,
      import_types: importTypes,
      top_failures: topFailures,
      total_runs: (runs ?? []).length,
      kb_uploads: kbUploads || 0,
      kb_queries: kbQueries || 0,
      kb_provider_usage: kbProviderUsage,
      pii_scan: {
        total_hits: piiTotalHits,
        by_type: piiScanDetails,
        records_scanned: (queryLogs ?? []).length + Math.min((runs ?? []).length, 100),
        status: piiTotalHits === 0 ? "CLEAN" : "PII_DETECTED",
      },
    };

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
