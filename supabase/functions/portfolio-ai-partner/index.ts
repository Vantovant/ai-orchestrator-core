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
    .replace(/\b(?:\+27|0)\d{9}\b/g, "[PHONE_REDACTED]");
}

async function buildPortfolioSnapshot(supabase: any, userId: string, projectIds?: string[]): Promise<string> {
  // Get active projects (max 5)
  let query = supabase.from("projects").select("id, name, status, progress_manual, progress_mode, is_blocked, description, updated_at")
    .eq("user_id", userId).is("deleted_at", null).neq("status", "completed").order("updated_at", { ascending: false }).limit(5);

  if (projectIds?.length) {
    query = supabase.from("projects").select("id, name, status, progress_manual, progress_mode, is_blocked, description, updated_at")
      .in("id", projectIds).is("deleted_at", null);
  }

  const { data: projects } = await query;
  if (!projects?.length) return "No active projects found.";

  let snapshot = "";

  for (const p of projects) {
    // Get memory
    const { data: mem } = await supabase.from("project_partner_memory").select("north_star, stage, weekly_focus, primary_constraint")
      .eq("project_id", p.id).maybeSingle();

    // Get scores
    const { data: scores } = await supabase.from("project_partner_scores").select("sell_readiness_score, risk_level, momentum_score")
      .eq("project_id", p.id).maybeSingle();

    // Get top 3 open tasks
    const { data: tasks } = await supabase.from("tasks").select("title, priority, due_date, status")
      .eq("project_id", p.id).is("deleted_at", null).in("status", ["pending", "in_progress"])
      .order("due_date", { ascending: true, nullsFirst: false }).limit(3);

    // Get next meeting
    const { data: meetings } = await supabase.from("meetings").select("title, start_time")
      .eq("project_id", p.id).is("deleted_at", null).gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true }).limit(1);

    snapshot += `\n--- PROJECT: ${p.name} ---\n`;
    snapshot += `Status: ${p.status} | Blocked: ${p.is_blocked}\n`;
    if (mem) {
      if ((mem as any).north_star) snapshot += `North Star: ${(mem as any).north_star}\n`;
      if ((mem as any).stage) snapshot += `Stage: ${(mem as any).stage}\n`;
      if ((mem as any).weekly_focus) snapshot += `Focus: ${(mem as any).weekly_focus}\n`;
    }
    if (scores) {
      snapshot += `Scores: Sell=${(scores as any).sell_readiness_score ?? 0} Risk=${(scores as any).risk_level ?? "unknown"} Momentum=${(scores as any).momentum_score ?? 0}\n`;
    }
    if (tasks?.length) {
      snapshot += `Open tasks: ${tasks.map((t: any) => `[${t.priority}] ${t.title}`).join("; ")}\n`;
    }
    if (meetings?.length) {
      snapshot += `Next meeting: ${(meetings[0] as any).title} at ${(meetings[0] as any).start_time?.slice(0, 16)}\n`;
    }

    if (snapshot.length > SNAPSHOT_CAP - 100) break; // leave room
  }

  if (snapshot.length > SNAPSHOT_CAP) snapshot = snapshot.slice(0, SNAPSHOT_CAP) + "\n[TRUNCATED]";
  return redact(snapshot);
}

function getTools(mode: string) {
  if (mode === "focus_plan_week") {
    return [{
      type: "function",
      function: {
        name: "focus_plan_week",
        description: "Return weekly focus plan across projects",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
            focus_project: { type: "string" },
            focus_reason: { type: "string" },
            recommendations: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, action: { type: "string" } }, required: ["title", "detail"] } },
            suggested_tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] }, project_id: { type: "string" }, due_in_days: { type: "number" } }, required: ["title", "priority"] } },
          },
          required: ["summary", "focus_project", "focus_reason"],
        },
      },
    }];
  }
  if (mode === "portfolio_scan") {
    return [{
      type: "function",
      function: {
        name: "portfolio_scan",
        description: "Return portfolio-wide scan with risks, wins, and recommendations",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
            risks: { type: "array", items: { type: "object", properties: { project: { type: "string" }, risk: { type: "string" }, mitigation: { type: "string" } }, required: ["project", "risk", "mitigation"] } },
            quick_wins: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, action: { type: "string" } }, required: ["title", "detail"] } },
            suggested_tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] } }, required: ["title", "priority"] } },
          },
          required: ["summary", "risks"],
        },
      },
    }];
  }
  if (mode === "compare_projects") {
    return [{
      type: "function",
      function: {
        name: "compare_projects",
        description: "Compare two projects and recommend focus",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
            comparison: { type: "object", properties: { recommendation: { type: "string" }, reasoning: { type: "string" } }, required: ["recommendation", "reasoning"] },
            recommendations: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, action: { type: "string" } }, required: ["title", "detail"] } },
            suggested_tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] } }, required: ["title", "priority"] } },
          },
          required: ["summary", "comparison"],
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

    const { mode, project_ids } = await req.json();
    if (!mode) {
      return new Response(JSON.stringify({ error: "mode required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const snapshot = await buildPortfolioSnapshot(supabase, user.id, project_ids);
    const tools = getTools(mode);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an AI Senior Partner advising a solo entrepreneur/executive on their portfolio of projects. Be rigorous, practical, and concise. Ground all advice in the project data provided. Never invent facts.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Portfolio snapshot:\n\n${snapshot}\n\nProduce ${mode.replace(/_/g, " ")} analysis.` },
        ],
        tools,
        tool_choice: tools.length ? { type: "function", function: { name: tools[0].function.name } } : undefined,
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    let result: any = null;
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
    if (!result) result = { summary: aiData?.choices?.[0]?.message?.content ?? "No response" };

    return new Response(JSON.stringify({ mode, result, snapshot_len: snapshot.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("portfolio-ai-partner error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
