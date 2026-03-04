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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Auth check
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin check via has_role
    const db = createClient(supabaseUrl, serviceKey);
    const { data: roleCheck } = await db.from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").limit(1);
    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { action } = await req.json();

    if (action === "stats") {
      // Get all users
      const { data: { users: allUsers } } = await db.auth.admin.listUsers({ perPage: 1000 });

      // Get all activity
      const { data: activities } = await db.from("user_activity").select("user_id, action, created_at").order("created_at", { ascending: false }).limit(10000);

      // Get projects count per user
      const { data: projects } = await db.from("projects").select("user_id, id").is("deleted_at", null);

      // Get tasks per user
      const { data: tasks } = await db.from("tasks").select("user_id, id, status").is("deleted_at", null);

      // Get KB uploads
      const { data: kbFiles } = await db.from("kb_files").select("user_id, id").is("deleted_at", null);

      // Get KB queries
      const { data: kbQueries } = await db.from("kb_query_log").select("user_id, id");

      // Get AI runs
      const { data: aiRuns } = await db.from("assistant_runs").select("user_id, result_json, created_at").order("created_at", { ascending: false }).limit(5000);

      // Get AI call logs (for blocked events)
      const { data: aiCallLogs } = await db.from("ai_call_log").select("user_id, used_provider, error_code").limit(10000);

      // Get user AI keys
      const { data: aiKeys } = await db.from("user_ai_keys").select("user_id, use_own_keys");

      // Get invites
      const { data: invites } = await db.from("invites").select("*").order("created_at", { ascending: false });

      // Build per-user stats
      const userStats = (allUsers ?? []).map((u: any) => {
        const uid = u.id;
        const userActivities = (activities ?? []).filter(a => a.user_id === uid);
        const userProjects = (projects ?? []).filter(p => p.user_id === uid);
        const userTasks = (tasks ?? []).filter(t => t.user_id === uid);
        const userKbFiles = (kbFiles ?? []).filter(f => f.user_id === uid);
        const userKbQueries = (kbQueries ?? []).filter(q => q.user_id === uid);
        const userAiRuns = (aiRuns ?? []).filter(r => r.user_id === uid);
        const userAiKey = (aiKeys ?? []).find(k => k.user_id === uid);

        const pageViews = userActivities.filter(a => a.action === "page_view").length;
        const aiCalls = userAiRuns.length;
        const aiErrors = userAiRuns.filter(r => {
          const res = r.result_json as any;
          return res?.ai_status === "error" || res?.ai_status === "rate_limited";
        }).length;

        const providersUsed = new Set<string>();
        userAiRuns.forEach(r => {
          const res = r.result_json as any;
          if (res?.provider_used && res.provider_used !== "none" && res.provider_used !== "lovable") providersUsed.add(res.provider_used);
        });

        // Count blocked events from ai_call_log
        const userCallLogs = (aiCallLogs ?? []).filter(l => l.user_id === uid);
        const blockedCount = userCallLogs.filter(l => l.used_provider === "blocked_missing_byok").length;

        const lastActivity = userActivities.length > 0 ? userActivities[0].created_at : null;

        return {
          id: uid,
          email: u.email,
          joinedAt: u.created_at,
          lastActive: lastActivity,
          totalActions: userActivities.length,
          pagesVisited: pageViews,
          projectsCreated: userProjects.length,
          tasksCreated: userTasks.length,
          tasksDone: userTasks.filter(t => t.status === "done").length,
          kbUploads: userKbFiles.length,
          kbQueries: userKbQueries.length,
          aiCalls,
          aiErrors,
          providersUsed: Array.from(providersUsed),
          hasOwnKey: userAiKey?.use_own_keys ?? false,
          blockedCount,
        };
      });

      // Summary
      const now = new Date();
      const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const activeTesters = userStats.filter(u => u.lastActive && new Date(u.lastActive) > h24).length;

      const totalAiCalls = userStats.reduce((s, u) => s + u.aiCalls, 0);
      const totalAiErrors = userStats.reduce((s, u) => s + u.aiErrors, 0);
      const aiSuccessRate = totalAiCalls > 0 ? ((totalAiCalls - totalAiErrors) / totalAiCalls * 100).toFixed(1) : "N/A";

      // Snapshot health (last 24h)
      const recentRuns = (aiRuns ?? []).filter(r => new Date(r.created_at) > h24);
      const snapshotOk = recentRuns.filter(r => (r.result_json as any)?.ai_status === "ok").length;
      const snapshotFail = recentRuns.length - snapshotOk;

      const summary = {
        totalTesters: userStats.length,
        activeTesters,
        projectsCreated: userStats.reduce((s, u) => s + u.projectsCreated, 0),
        tasksDone: userStats.reduce((s, u) => s + u.tasksDone, 0),
        kbUploads: userStats.reduce((s, u) => s + u.kbUploads, 0),
        kbQueries: userStats.reduce((s, u) => s + u.kbQueries, 0),
        aiSuccessRate,
        snapshotHealth: { ok: snapshotOk, fail: snapshotFail },
      };

      return new Response(JSON.stringify({ summary, testers: userStats, invites }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ai_summary") {
      // Generate ZAZI UX report as markdown
      // First get stats
      const statsRes = await fetch(`${supabaseUrl}/functions/v1/team-analytics`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json", apikey: anonKey },
        body: JSON.stringify({ action: "stats" }),
      });
      const stats = await statsRes.json();

      const report = generateZaziReport(stats);
      return new Response(JSON.stringify({ report }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action. Use 'stats' or 'ai_summary'.");
  } catch (e: any) {
    console.error("[team-analytics] error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateZaziReport(stats: any): string {
  const s = stats.summary;
  const testers = stats.testers || [];
  const now = new Date().toISOString().split("T")[0];

  let md = `# ZAZI UX Report — ${now}\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| Total Testers | ${s.totalTesters} |\n`;
  md += `| Active (24h) | ${s.activeTesters} |\n`;
  md += `| Projects Created | ${s.projectsCreated} |\n`;
  md += `| Tasks Done | ${s.tasksDone} |\n`;
  md += `| KB Uploads | ${s.kbUploads} |\n`;
  md += `| KB Queries | ${s.kbQueries} |\n`;
  md += `| AI Success Rate | ${s.aiSuccessRate}% |\n`;
  md += `| Snapshot Health (24h) | ✅ ${s.snapshotHealth.ok} / ❌ ${s.snapshotHealth.fail} |\n`;
  md += `\n## Tester Breakdown\n\n`;
  md += `| Email | Joined | Last Active | Projects | Tasks Done | AI Calls | Errors | BYOK |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;

  for (const t of testers) {
    const joined = t.joinedAt ? t.joinedAt.split("T")[0] : "—";
    const last = t.lastActive ? t.lastActive.split("T")[0] : "—";
    md += `| ${t.email} | ${joined} | ${last} | ${t.projectsCreated} | ${t.tasksDone} | ${t.aiCalls} | ${t.aiErrors} | ${t.hasOwnKey ? "✅" : "—"} |\n`;
  }

  md += `\n## Observations\n\n`;
  const inactive = testers.filter((t: any) => !t.lastActive || new Date(t.lastActive) < new Date(Date.now() - 7 * 86400000));
  if (inactive.length > 0) {
    md += `- ⚠️ ${inactive.length} tester(s) inactive for 7+ days\n`;
  }
  const noProjects = testers.filter((t: any) => t.projectsCreated === 0);
  if (noProjects.length > 0) {
    md += `- 📋 ${noProjects.length} tester(s) haven't created any projects\n`;
  }
  const byokUsers = testers.filter((t: any) => t.hasOwnKey);
  md += `- 🔑 ${byokUsers.length} tester(s) using BYOK\n`;

  return md;
}
