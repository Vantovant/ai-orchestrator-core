import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RETRIEVAL_CAP = 6000;

function redact(text: string): string {
  return text
    .replace(/\b\d{13}\b/g, "[ID_REDACTED]")
    .replace(/\b\d{10,12}\b/g, "[ACCT_REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]")
    .replace(/\b(?:\+27|0)\d{9}\b/g, "[PHONE_REDACTED]");
}

// ─── Retrieval helpers ───────────────────────────────────────────

async function retrieveProjects(supabase: any, userId: string, tags: string[]): Promise<any[]> {
  const projectNameTag = tags.find(t => t.startsWith("@project:"));
  const projectName = projectNameTag?.slice(9);

  let query = supabase.from("projects")
    .select("id, name, status, progress_manual, progress_mode, is_blocked, description, updated_at")
    .eq("user_id", userId).is("deleted_at", null);

  if (projectName) {
    query = query.ilike("name", `%${projectName}%`);
  } else if (!tags.includes("@global-only")) {
    query = query.neq("status", "completed");
  }

  const { data } = await query.order("updated_at", { ascending: false }).limit(15);
  return data ?? [];
}

async function retrieveMemories(supabase: any, projectIds: string[]): Promise<string> {
  if (!projectIds.length) return "";
  const { data } = await supabase.from("project_partner_memory")
    .select("project_id, north_star, stage, weekly_focus, primary_constraint")
    .in("project_id", projectIds);
  if (!data?.length) return "";
  return data.map((m: any) => `[Memory:${m.project_id?.slice(0,8)}] Star:${m.north_star||"-"} Stage:${m.stage||"-"} Focus:${m.weekly_focus||"-"} Constraint:${m.primary_constraint||"-"}`).join("\n");
}

async function retrieveScores(supabase: any, projectIds: string[]): Promise<string> {
  if (!projectIds.length) return "";
  const { data } = await supabase.from("project_partner_scores")
    .select("project_id, sell_readiness_score, risk_level, momentum_score")
    .in("project_id", projectIds);
  if (!data?.length) return "";
  return data.map((s: any) => `[Score:${s.project_id?.slice(0,8)}] Momentum:${s.momentum_score} Risk:${s.risk_level} Sell:${s.sell_readiness_score}`).join("\n");
}

async function retrieveTasks(supabase: any, userId: string, projectIds: string[], tags: string[]): Promise<string> {
  if (tags.includes("@global-only")) return "";
  let query = supabase.from("tasks")
    .select("title, priority, due_date, status, project_id")
    .eq("user_id", userId).is("deleted_at", null)
    .in("status", ["pending", "in_progress"]);

  if (projectIds.length) query = query.in("project_id", projectIds);

  const { data } = await query.order("due_date", { ascending: true, nullsFirst: false }).limit(20);
  if (!data?.length) return "";
  return "OPEN TASKS:\n" + data.map((t: any) => `- [${t.priority}] ${t.title} (due:${t.due_date||"none"}) proj:${t.project_id?.slice(0,8)||"none"}`).join("\n");
}

async function retrieveMeetings(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("meetings")
    .select("title, start_time, project_id")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true }).limit(5);
  if (!data?.length) return "";
  return "UPCOMING MEETINGS:\n" + data.map((m: any) => `- ${m.title} at ${m.start_time?.slice(0,16)} proj:${m.project_id?.slice(0,8)||"none"}`).join("\n");
}

async function retrieveNotes(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("notes")
    .select("title, content, updated_at")
    .eq("user_id", userId).is("deleted_at", null)
    .order("updated_at", { ascending: false }).limit(3);
  if (!data?.length) return "";
  return "RECENT NOTES:\n" + data.map((n: any) => `- ${n.title}: ${(n.content||"").slice(0,150)}`).join("\n");
}

async function retrieveKnowledge(supabase: any, userId: string, tags: string[]): Promise<string> {
  if (!tags.includes("@knowledge") && !tags.some(t => t.startsWith("@doc:"))) return "";
  const docNameTag = tags.find(t => t.startsWith("@doc:"));
  const docName = docNameTag?.slice(5);

  let docsQuery = supabase.from("knowledge_docs")
    .select("id, title")
    .eq("user_id", userId).is("deleted_at", null);

  if (docName) docsQuery = docsQuery.ilike("title", `%${docName}%`);
  docsQuery = docsQuery.limit(5);

  const { data: docs } = await docsQuery;
  if (!docs?.length) return "";

  const docIds = docs.map((d: any) => d.id);
  const { data: chunks } = await supabase.from("knowledge_chunks")
    .select("content, doc_id")
    .in("doc_id", docIds)
    .order("chunk_index", { ascending: true })
    .limit(10);

  if (!chunks?.length) return "";
  const docMap = new Map(docs.map((d: any) => [d.id, d.title]));
  return "KNOWLEDGE:\n" + chunks.map((c: any) => `[${docMap.get(c.doc_id)||"doc"}] ${c.content.slice(0,300)}`).join("\n");
}

async function retrieveScoreHistory(supabase: any, projectIds: string[]): Promise<string> {
  if (!projectIds.length) return "";
  const { data } = await supabase.from("project_partner_score_history")
    .select("project_id, momentum_score, risk_level, sell_readiness_score, recorded_at")
    .in("project_id", projectIds)
    .order("recorded_at", { ascending: false }).limit(20);
  if (!data?.length) return "";
  return "SCORE HISTORY:\n" + data.map((s: any) => `[${s.project_id?.slice(0,8)} ${s.recorded_at?.slice(0,10)}] M:${s.momentum_score} R:${s.risk_level} S:${s.sell_readiness_score}`).join("\n");
}

async function buildRetrievalContext(supabase: any, userId: string, tags: string[]): Promise<string> {
  const projects = await retrieveProjects(supabase, userId, tags);
  const projectIds = projects.map((p: any) => p.id);

  const projectSummary = projects.map((p: any) =>
    `[${p.name}] id:${p.id.slice(0,8)} status:${p.status} blocked:${p.is_blocked} desc:${(p.description||"").slice(0,100)}`
  ).join("\n");

  const parts = await Promise.all([
    retrieveMemories(supabase, projectIds),
    retrieveScores(supabase, projectIds),
    retrieveTasks(supabase, userId, projectIds, tags),
    retrieveMeetings(supabase, userId),
    retrieveNotes(supabase, userId),
    retrieveKnowledge(supabase, userId, tags),
    retrieveScoreHistory(supabase, projectIds),
  ]);

  let context = "ACTIVE PROJECTS:\n" + projectSummary + "\n\n" + parts.filter(Boolean).join("\n\n");
  if (context.length > RETRIEVAL_CAP) context = context.slice(0, RETRIEVAL_CAP) + "\n[CONTEXT_TRIMMED]";
  return redact(context);
}

// ─── Legacy snapshot (for structured modes) ──────────────────────

async function buildPortfolioSnapshot(supabase: any, userId: string, projectIds?: string[]): Promise<string> {
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
    const { data: mem } = await supabase.from("project_partner_memory").select("north_star, stage, weekly_focus, primary_constraint").eq("project_id", p.id).maybeSingle();
    const { data: scores } = await supabase.from("project_partner_scores").select("sell_readiness_score, risk_level, momentum_score").eq("project_id", p.id).maybeSingle();
    const { data: tasks } = await supabase.from("tasks").select("title, priority, due_date, status").eq("project_id", p.id).is("deleted_at", null).in("status", ["pending", "in_progress"]).order("due_date", { ascending: true, nullsFirst: false }).limit(3);
    const { data: meetings } = await supabase.from("meetings").select("title, start_time").eq("project_id", p.id).is("deleted_at", null).gte("start_time", new Date().toISOString()).order("start_time", { ascending: true }).limit(1);
    snapshot += `\n--- PROJECT: ${p.name} ---\nStatus: ${p.status} | Blocked: ${p.is_blocked}\n`;
    if (mem) {
      if (mem.north_star) snapshot += `North Star: ${mem.north_star}\n`;
      if (mem.stage) snapshot += `Stage: ${mem.stage}\n`;
      if (mem.weekly_focus) snapshot += `Focus: ${mem.weekly_focus}\n`;
    }
    if (scores) snapshot += `Scores: Sell=${scores.sell_readiness_score ?? 0} Risk=${scores.risk_level ?? "unknown"} Momentum=${scores.momentum_score ?? 0}\n`;
    if (tasks?.length) snapshot += `Open tasks: ${tasks.map((t: any) => `[${t.priority}] ${t.title}`).join("; ")}\n`;
    if (meetings?.length) snapshot += `Next meeting: ${meetings[0].title} at ${meetings[0].start_time?.slice(0, 16)}\n`;
    if (snapshot.length > 2900) break;
  }
  if (snapshot.length > 3000) snapshot = snapshot.slice(0, 3000) + "\n[TRUNCATED]";
  return redact(snapshot);
}

// ─── Tool definitions for structured modes ──────────────────────

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

// ─── System prompt ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Chief Portfolio Strategist for VantoOS — a persistent AI co-founder and senior partner.

OPERATING RULES:
1. Cross-reference projects, risks, meetings, tasks, and knowledge docs when answering.
2. Spot conflicts, duplicated effort, hidden opportunities, and resource strain across the portfolio.
3. Treat knowledge documents as frameworks and reference material, not absolute truth.
4. Prioritize live project reality (tasks, meetings, scores) over theory when they conflict.
5. Stay portfolio-aware unless the user explicitly narrows scope with tags.
6. Never hallucinate facts. If you lack data, say so.
7. Never expose secrets, unredacted PII, or cross-user data.
8. Format responses in clear markdown. Use headings, bullets, and bold for readability.
9. When relevant, suggest actionable next steps the user can apply as tasks.
10. Be rigorous but concise — executive-grade communication.`;

// ─── Main handler ───────────────────────────────────────────────

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

    const body = await req.json();
    const { mode, project_ids, prompt, context_tags, history, stream, thread_id } = body;

    if (!mode) {
      return new Response(JSON.stringify({ error: "mode required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Chat mode with retrieval + SSE ─────────────────────────
    if (mode === "chat") {
      const tags: string[] = context_tags || [];
      const context = await buildRetrievalContext(supabase, user.id, tags);

      const messages: any[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `PORTFOLIO CONTEXT (retrieved ${new Date().toISOString().slice(0,16)}):\n\n${context}` },
      ];

      // Add conversation history
      if (history?.length) {
        for (const h of history.slice(-20)) {
          messages.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
        }
      }

      messages.push({ role: "user", content: prompt || "Hello" });

      if (stream) {
        // SSE streaming
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages,
            stream: true,
          }),
        });

        if (!aiRes.ok) {
          const status = aiRes.status;
          const errMsg = status === 429 ? "Rate limited" : status === 402 ? "Credits exhausted" : "AI unavailable";
          return new Response(JSON.stringify({ error: errMsg }), {
            status, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Transform OpenAI SSE to our SSE format
        const transformStream = new TransformStream({
          async transform(chunk, controller) {
            const text = new TextDecoder().decode(chunk);
            const lines = text.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const payload = line.slice(6).trim();
                if (payload === "[DONE]") {
                  controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                  continue;
                }
                try {
                  const parsed = JSON.parse(payload);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "text", content: delta })}\n\n`));
                  }
                } catch {}
              }
            }
          },
        });

        const streamedBody = aiRes.body!.pipeThrough(transformStream);

        return new Response(streamedBody, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      } else {
        // Non-streaming fallback
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
        });

        if (!aiRes.ok) {
          const status = aiRes.status;
          const errMsg = status === 429 ? "Rate limited" : status === 402 ? "Credits exhausted" : "AI unavailable";
          return new Response(JSON.stringify({ error: errMsg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const aiData = await aiRes.json();
        const content = aiData?.choices?.[0]?.message?.content ?? "No response";

        return new Response(JSON.stringify({ mode: "chat", result: { content }, context_len: context.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── Legacy structured modes ────────────────────────────────
    const snapshot = await buildPortfolioSnapshot(supabase, user.id, project_ids);
    const tools = getTools(mode);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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
