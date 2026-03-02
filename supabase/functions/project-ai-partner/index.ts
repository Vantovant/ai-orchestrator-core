import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SNAPSHOT_CAP = 3000;

function redact(text: string): string {
  return text
    .replace(/\b\d{13}\b/g, "[ID_REDACTED]")
    .replace(/\b\d{10,12}\b/g, "[ACCT_REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]")
    .replace(/\b(?:\+27|0)\d{9}\b/g, "[PHONE_REDACTED]")
    .replace(/\[CONFIDENTIAL\].*?\[\/CONFIDENTIAL\]/gi, "[REDACTED_BLOCK]");
}

async function buildSnapshot(supabase: any, projectId: string): Promise<{ text: string; json: any }> {
  // Fetch memory FIRST
  const [memoryRes, projectRes, tasksRes, meetingsRes, notesRes, linksRes] = await Promise.all([
    supabase.from("project_partner_memory").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("projects").select("name, status, progress_manual, progress_mode, is_blocked, description, tags, updated_at").eq("id", projectId).single(),
    supabase.from("tasks").select("id, title, status, priority, due_date, estimated_minutes").eq("project_id", projectId).is("deleted_at", null).in("status", ["pending", "in_progress"]).order("due_date", { ascending: true, nullsFirst: false }).limit(10),
    supabase.from("meetings").select("id, title, start_time, end_time, location").eq("project_id", projectId).is("deleted_at", null).gte("start_time", new Date().toISOString()).order("start_time", { ascending: true }).limit(3),
    supabase.from("project_notes").select("note_date, content").eq("project_id", projectId).is("deleted_at", null).order("note_date", { ascending: false }).limit(7),
    supabase.from("project_links").select("label, url").eq("project_id", projectId).is("deleted_at", null).limit(5),
  ]);

  const memory = memoryRes.data;
  const project = projectRes.data;
  const tasks = tasksRes.data ?? [];
  const meetings = meetingsRes.data ?? [];
  const notes = notesRes.data ?? [];
  const links = linksRes.data ?? [];

  const allTasksRes = await supabase.from("tasks").select("status").eq("project_id", projectId).is("deleted_at", null);
  const allTasks = allTasksRes.data ?? [];
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t: any) => t.status === "done").length;
  const progress = project?.progress_mode === "tasks_based" && totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : (project?.progress_manual ?? 0);
  const overdueTasks = tasks.filter((t: any) => t.due_date && new Date(t.due_date) < new Date());
  const health = project?.is_blocked ? "blocked" : overdueTasks.length >= 2 ? "blocked" : overdueTasks.length >= 1 ? "at_risk" : "on_track";

  const json = {
    memory,
    project: { ...project, progress, health, total_tasks: totalTasks, done_tasks: doneTasks },
    open_tasks: tasks,
    upcoming_meetings: meetings,
    recent_notes: notes.map((n: any) => ({ date: n.note_date, snippet: n.content?.slice(0, 300) })),
    links,
  };

  // Build text snapshot — memory first
  let text = "";
  if (memory) {
    text += "PARTNER MEMORY:\n";
    if (memory.north_star) text += `North Star: ${memory.north_star}\n`;
    if (memory.target_customer) text += `Target Customer: ${memory.target_customer}\n`;
    if (memory.business_model) text += `Business Model: ${memory.business_model}\n`;
    if (memory.stage) text += `Stage: ${memory.stage}\n`;
    if (memory.primary_constraint) text += `Constraint: ${memory.primary_constraint}\n`;
    if (memory.weekly_focus) text += `Weekly Focus: ${memory.weekly_focus}\n`;
    if (memory.last_partner_summary) text += `Last Summary: ${memory.last_partner_summary}\n`;
    text += "\n";
  }

  text += `PROJECT: ${project?.name ?? "Unknown"}\nStatus: ${project?.status} | Progress: ${progress}% | Health: ${health}\n`;
  if (project?.description) text += `Description: ${project.description.slice(0, 200)}\n`;
  if (project?.tags?.length) text += `Tags: ${project.tags.join(", ")}\n`;
  text += `\nOPEN TASKS (${tasks.length}):\n`;
  for (const t of tasks) {
    text += `- [${t.priority}] ${t.title}${t.due_date ? ` (due: ${t.due_date.slice(0, 10)})` : ""}\n`;
  }
  text += `\nUPCOMING MEETINGS (${meetings.length}):\n`;
  for (const m of meetings) {
    text += `- ${m.title} at ${m.start_time?.slice(0, 16)}\n`;
  }
  text += `\nRECENT NOTES (last 7 days):\n`;
  for (const n of notes) {
    text += `[${n.note_date}] ${n.content?.slice(0, 150)}…\n`;
  }
  if (links.length) {
    text += `\nLINKS:\n`;
    for (const l of links) text += `- ${l.label}: ${l.url}\n`;
  }

  if (text.length > SNAPSHOT_CAP) text = text.slice(0, SNAPSHOT_CAP) + "\n[TRUNCATED]";
  text = redact(text);

  return { text, json };
}

function getSystemPrompt(mode: string): string {
  const base = `You are an AI Senior Partner — a PhD-level strategist with streetwise African business execution experience. You advise a solo entrepreneur/executive on their personal projects. Be rigorous, practical, and concise. Ground all advice in the project data provided. Never invent facts about funding programs or external entities. If something needs verification, explicitly say "needs verification".`;

  switch (mode) {
    case "executive_brief":
      return `${base}\n\nProduce an Executive Brief with:\n1. Project status summary (2-3 sentences)\n2. Top 3 priorities (actionable, specific)\n3. Biggest risk and mitigation\n4. Next meeting prep notes (if meetings upcoming)\n\nReturn JSON with tool call.`;
    case "sprint_plan":
      return `${base}\n\nProduce a 7-day Sprint Plan with:\n1. This week's focus areas\n2. Daily action items (Mon-Sun, 2-3 items each)\n3. Items to postpone and why\n4. Quick wins available this week\n\nReturn JSON with tool call.`;
    case "sell_readiness":
      return `${base}\n\nConduct a Sell-Readiness Audit. Score each dimension 0-100:\n1. problem_clarity: Is the problem well-defined?\n2. solution_maturity: How developed is the solution?\n3. mvp_stability: Is the MVP stable and usable?\n4. onboarding_ux: Can users onboard easily?\n5. pricing_packaging: Is pricing clear?\n6. compliance: Privacy/legal readiness?\n7. support_docs: Documentation quality?\n\nProvide an overall score (weighted average), missing items, and exact next steps.\n\nReturn JSON with tool call.`;
    case "update_memory":
      return `${base}\n\nBased on the project data, propose updates to the Partner Memory fields. Only suggest changes where you have clear evidence from the project data. Return ONLY fields that should change.`;
    case "funding_pathways":
      return `${base}\n\nAnalyze this project's funding readiness. Provide:\n1. Recommended funding TYPES that fit (bootstrapping, pre-sales, grants, accelerator, angel, etc.) with reasons\n2. A funding readiness checklist (pitch deck, traction, unit economics, demo, compliance) with ready/not-ready status\n3. If there are cached funding opportunities provided, include them as verified opportunities. Do NOT invent funding programs.\n\nReturn JSON with tool call.`;
    default:
      return base;
  }
}

function getTools(mode: string) {
  if (mode === "executive_brief") {
    return [{
      type: "function",
      function: {
        name: "executive_brief",
        description: "Return executive brief for the project",
        parameters: {
          type: "object",
          properties: {
            status_summary: { type: "string" },
            top_priorities: { type: "array", items: { type: "object", properties: { priority: { type: "string" }, reason: { type: "string" }, action: { type: "string" } }, required: ["priority", "reason", "action"] } },
            biggest_risk: { type: "object", properties: { risk: { type: "string" }, impact: { type: "string" }, mitigation: { type: "string" } }, required: ["risk", "impact", "mitigation"] },
            meeting_prep: { type: "string" },
            suggested_tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] }, due_in_days: { type: "number" } }, required: ["title", "priority"] } },
          },
          required: ["status_summary", "top_priorities", "biggest_risk"],
        },
      },
    }];
  }
  if (mode === "sprint_plan") {
    return [{
      type: "function",
      function: {
        name: "sprint_plan",
        description: "Return a 7-day sprint plan",
        parameters: {
          type: "object",
          properties: {
            focus_areas: { type: "array", items: { type: "string" } },
            daily_plan: { type: "array", items: { type: "object", properties: { day: { type: "string" }, actions: { type: "array", items: { type: "string" } } }, required: ["day", "actions"] } },
            postpone: { type: "array", items: { type: "object", properties: { item: { type: "string" }, reason: { type: "string" } }, required: ["item", "reason"] } },
            quick_wins: { type: "array", items: { type: "string" } },
            suggested_tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] }, due_in_days: { type: "number" } }, required: ["title", "priority"] } },
          },
          required: ["focus_areas", "daily_plan"],
        },
      },
    }];
  }
  if (mode === "sell_readiness") {
    return [{
      type: "function",
      function: {
        name: "sell_readiness_audit",
        description: "Return sell-readiness audit scorecard",
        parameters: {
          type: "object",
          properties: {
            overall_score: { type: "number" },
            scores: { type: "object", properties: { problem_clarity: { type: "number" }, solution_maturity: { type: "number" }, mvp_stability: { type: "number" }, onboarding_ux: { type: "number" }, pricing_packaging: { type: "number" }, compliance: { type: "number" }, support_docs: { type: "number" } }, required: ["problem_clarity", "solution_maturity", "mvp_stability", "onboarding_ux", "pricing_packaging", "compliance", "support_docs"] },
            missing_items: { type: "array", items: { type: "object", properties: { area: { type: "string" }, issue: { type: "string" }, next_step: { type: "string" } }, required: ["area", "issue", "next_step"] } },
            verdict: { type: "string" },
            summary: { type: "string" },
            suggested_tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] } }, required: ["title", "priority"] } },
          },
          required: ["overall_score", "scores", "missing_items", "verdict", "summary"],
        },
      },
    }];
  }
  if (mode === "update_memory") {
    return [{
      type: "function",
      function: {
        name: "update_memory",
        description: "Propose updates to partner memory fields",
        parameters: {
          type: "object",
          properties: {
            north_star: { type: "string" },
            target_customer: { type: "string" },
            business_model: { type: "string" },
            stage: { type: "string", enum: ["idea", "mvp", "beta", "live", "scaling"] },
            primary_constraint: { type: "string" },
            weekly_focus: { type: "string" },
            last_partner_summary: { type: "string" },
            key_assumptions: { type: "array", items: { type: "string" } },
            key_risks: { type: "array", items: { type: "string" } },
          },
        },
      },
    }];
  }
  if (mode === "funding_pathways") {
    return [{
      type: "function",
      function: {
        name: "funding_pathways",
        description: "Return funding pathways analysis",
        parameters: {
          type: "object",
          properties: {
            recommended_types: { type: "array", items: { type: "object", properties: { type: { type: "string" }, reason: { type: "string" }, next_step: { type: "string" } }, required: ["type", "reason", "next_step"] } },
            readiness_checklist: { type: "array", items: { type: "object", properties: { item: { type: "string" }, ready: { type: "boolean" }, action: { type: "string" } }, required: ["item", "ready"] } },
            cached_opportunities: { type: "array", items: { type: "object", properties: { org_name: { type: "string" }, program_name: { type: "string" }, summary: { type: "string" }, source_url: { type: "string" }, source_name: { type: "string" }, fetched_at: { type: "string" }, ticket_size_range: { type: "string" } }, required: ["org_name", "program_name", "source_url"] } },
          },
          required: ["recommended_types", "readiness_checklist"],
        },
      },
    }];
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { project_id, mode } = await req.json();
    if (!project_id || !mode) {
      return new Response(JSON.stringify({ error: "project_id and mode required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text: snapshotText, json: snapshotJson } = await buildSnapshot(supabase, project_id);

    // For funding_pathways, append cached funding data
    let extraContext = "";
    if (mode === "funding_pathways") {
      const { data: cached } = await supabase.from("funding_cache").select("org_name, program_name, funding_type, summary, source_url, source_name, fetched_at, ticket_size_range")
        .eq("project_id", project_id).order("fetched_at", { ascending: false }).limit(10);
      if (cached?.length) {
        extraContext = "\n\nCACHED VERIFIED FUNDING OPPORTUNITIES:\n";
        for (const c of cached) {
          extraContext += `- ${c.org_name}: ${c.program_name} (${c.funding_type}) — ${c.summary?.slice(0, 100)} [Source: ${c.source_url}] [Fetched: ${c.fetched_at}]\n`;
        }
      }
    }

    const systemPrompt = getSystemPrompt(mode);
    const tools = getTools(mode);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent = `Here is the project snapshot:\n\n${snapshotText}${extraContext}\n\nPlease produce the ${mode.replace(/_/g, " ")} analysis.`;

    const aiBody: any = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    };
    if (tools.length) {
      aiBody.tools = tools;
      aiBody.tool_choice = { type: "function", function: { name: tools[0].function.name } };
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiBody),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      const errText = await aiRes.text();
      console.error(`AI gateway error: ${status}`, errText);
      if (status === 429) return new Response(JSON.stringify({ error: "AI rate limited, try again shortly", ai_status: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted", ai_status: "payment_required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    let result: any = null;

    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      try { result = JSON.parse(toolCall.function.arguments); } catch {}
    }
    if (!result) {
      result = { summary: aiData?.choices?.[0]?.message?.content ?? "No response" };
    }

    // After sell_readiness, update scores
    if (mode === "sell_readiness" && result.overall_score != null) {
      await supabase.from("project_partner_scores").upsert({
        user_id: user.id,
        project_id,
        sell_readiness_score: result.overall_score,
        last_audit_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,project_id" });
    }

    // After executive_brief, update scores
    if (mode === "executive_brief") {
      // Compute momentum from recent activity
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      const [recentTasks, recentNotes, recentMeetings] = await Promise.all([
        supabase.from("tasks").select("id").eq("project_id", project_id).gte("updated_at", twoWeeksAgo).is("deleted_at", null),
        supabase.from("project_notes").select("id").eq("project_id", project_id).gte("updated_at", twoWeeksAgo).is("deleted_at", null),
        supabase.from("meetings").select("id").eq("project_id", project_id).gte("updated_at", twoWeeksAgo).is("deleted_at", null),
      ]);
      const activityCount = (recentTasks.data?.length ?? 0) + (recentNotes.data?.length ?? 0) + (recentMeetings.data?.length ?? 0);
      const momentum = Math.min(100, activityCount * 10);

      const overdue = (snapshotJson.open_tasks ?? []).filter((t: any) => t.due_date && new Date(t.due_date) < new Date()).length;
      const riskLevel = snapshotJson.project?.is_blocked ? "high" : overdue >= 2 ? "high" : overdue >= 1 ? "med" : "low";

      await supabase.from("project_partner_scores").upsert({
        user_id: user.id,
        project_id,
        momentum_score: momentum,
        risk_level: riskLevel,
        last_brief_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,project_id" });
    }

    // If auto_update_enabled and mode is executive_brief or sprint_plan, update memory summary
    if (snapshotJson.memory?.auto_update_enabled && (mode === "executive_brief" || mode === "sprint_plan")) {
      const summaryText = result.status_summary || result.summary || "";
      if (summaryText) {
        await supabase.from("project_partner_memory").update({
          last_partner_summary: summaryText.slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq("project_id", project_id).eq("user_id", user.id);
      }
    }

    return new Response(JSON.stringify({
      mode,
      result,
      snapshot_len: snapshotText.length,
      was_truncated: snapshotText.includes("[TRUNCATED]"),
      ai_status: "ok",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("project-ai-partner error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
