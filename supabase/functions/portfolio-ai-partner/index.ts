import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RETRIEVAL_CAP = 8000;

function redact(text: string): string {
  return text
    .replace(/\b\d{13}\b/g, "[ID_REDACTED]")
    .replace(/\b\d{10,12}\b/g, "[ACCT_REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]")
    .replace(/\b(?:\+27|0)\d{9}\b/g, "[PHONE_REDACTED]");
}

interface RetrievalMeta {
  retrieval_type: "exact_document" | "project_scoped" | "portfolio_general";
  project_ids: string[];
  project_names: string[];
  docs_used: Array<{
    id: string;
    title: string;
    project_id: string | null;
    project_name: string | null;
    source_mode: "chunks" | "raw_text";
  }>;
  missing_docs: string[];
  unindexed_docs: string[];
  unreadable_docs: string[];
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDocReferences(prompt: string): string[] {
  const refs: string[] = [];
  const patterns = [
    /refer\s+to\s+["`']?([^"'`\n,]+?)["`']?(?:\s+and|\s*$|\s*,)/gi,
    /(?:share|read|use|check|summari(?:s|z)e)\s+(?:the\s+)?(?:contents?\s+of\s+)?(?:this\s+)?document\s+["`']?([^"'`\n,]+?)["`']?(?:\s+and|\s*$|\s*,)/gi,
    /(?:use|check)\s+(?:the\s+)?([^"'`\n,]+?)\s+document/gi,
  ];

  for (const pattern of patterns) {
    for (const match of prompt.matchAll(pattern)) {
      refs.push(match[1].trim());
    }
  }

  return [...new Set(refs)].filter((ref) => ref.length > 3);
}

function matchProjectsFromPrompt(projects: any[], prompt: string): any[] {
  const normalizedPrompt = normalizeForMatch(prompt);
  if (!normalizedPrompt) return [];

  return projects
    .filter((project) => {
      const normalizedName = normalizeForMatch(project.name || "");
      return normalizedName.length >= 4 && normalizedPrompt.includes(normalizedName);
    })
    .sort(
      (a, b) =>
        normalizeForMatch(b.name || "").length - normalizeForMatch(a.name || "").length,
    );
}

// ─── Retrieval helpers (aligned to real VantoOS tables) ─────────

async function retrieveProjects(supabase: any, userId: string, tags: string[], prompt: string): Promise<any[]> {
  if (tags.includes("@global-only")) return [];

  const projectNameTag = tags.find(t => t.startsWith("@project:"));
  const projectName = projectNameTag?.slice(9)?.trim();

  let query = supabase.from("projects")
    .select("id, name, status, progress_manual, progress_mode, is_blocked, description, updated_at")
    .eq("user_id", userId).is("deleted_at", null);

  if (projectName) {
    query = query.ilike("name", `%${projectName}%`);
  } else if (!tags.includes("@global-only")) {
    // No arbitrary cap — retrieve all active projects for full portfolio awareness
    query = query.neq("status", "completed");
  }

  // Order by most recently updated, use a generous limit for portfolio-wide retrieval
  const { data } = await query.order("updated_at", { ascending: false }).limit(100);
  const projects = data ?? [];

  if (!projectNameTag && !tags.includes("@all-projects")) {
    const matchedProjects = matchProjectsFromPrompt(projects, prompt);
    if (matchedProjects.length > 0) return matchedProjects;
  }

  return projects;
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

  if (projectIds.length && tags.some(t => t.startsWith("@project:"))) {
    query = query.in("project_id", projectIds);
  }

  const { data } = await query.order("due_date", { ascending: true, nullsFirst: false }).limit(30);
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

// Uses real table: notes_daily (planning notes)
async function retrievePlanningNotes(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("notes_daily")
    .select("note_date, content, updated_at")
    .eq("user_id", userId).is("deleted_at", null)
    .order("note_date", { ascending: false }).limit(3);
  if (!data?.length) return "";
  return "RECENT PLANNING NOTES:\n" + data.map((n: any) => `- [${n.note_date}] ${(n.content||"").slice(0,200)}`).join("\n");
}

// Uses real table: project_notes
async function retrieveProjectNotes(supabase: any, userId: string, projectIds: string[]): Promise<string> {
  if (!projectIds.length) return "";
  const { data } = await supabase.from("project_notes")
    .select("project_id, note_date, content, updated_at")
    .eq("user_id", userId).is("deleted_at", null)
    .in("project_id", projectIds)
    .order("updated_at", { ascending: false }).limit(5);
  if (!data?.length) return "";
  return "PROJECT NOTES:\n" + data.map((n: any) => `- [proj:${n.project_id?.slice(0,8)} ${n.note_date}] ${(n.content||"").slice(0,200)}`).join("\n");
}

// Uses real table: project_links
async function retrieveProjectLinks(supabase: any, userId: string, projectIds: string[]): Promise<string> {
  if (!projectIds.length) return "";
  const { data } = await supabase.from("project_links")
    .select("project_id, label, url")
    .eq("user_id", userId).is("deleted_at", null)
    .in("project_id", projectIds)
    .limit(10);
  if (!data?.length) return "";
  return "PROJECT LINKS:\n" + data.map((l: any) => `- [proj:${l.project_id?.slice(0,8)}] ${l.label}: ${l.url}`).join("\n");
}

// Dynamic knowledge retrieval — always attempts retrieval unless @global-only.
// Natural-language project/doc references are supported even without explicit tags.
async function retrieveKnowledge(
  supabase: any,
  userId: string,
  projects: any[],
  tags: string[],
  prompt: string,
): Promise<{ text: string; meta: RetrievalMeta }> {
  const meta: RetrievalMeta = {
    retrieval_type: projects.length > 0 ? "project_scoped" : "portfolio_general",
    project_ids: projects.map((project) => project.id),
    project_names: projects.map((project) => project.name),
    docs_used: [],
    missing_docs: [],
    unindexed_docs: [],
    unreadable_docs: [],
  };

  if (tags.includes("@global-only")) return { text: "", meta };

  const explicitDocRefs = [
    ...new Set([
      ...tags.filter((tag) => tag.startsWith("@doc:")).map((tag) => tag.slice(5).trim()),
      ...detectDocReferences(prompt),
    ].filter(Boolean)),
  ];

  let docsQuery = supabase.from("knowledge_docs")
    .select("id, title, raw_text, status, project_id, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(projects.length > 0 ? 60 : 120);

  if (projects.length > 0) {
    docsQuery = docsQuery.in("project_id", projects.map((project) => project.id));
  }

  const { data: docs } = await docsQuery;
  if (!docs?.length) {
    if (explicitDocRefs.length > 0) meta.missing_docs = explicitDocRefs;
    return { text: "", meta };
  }

  const docMap = new Map(docs.map((doc: any) => [doc.id, doc]));
  const projectNameMap = new Map(projects.map((project) => [project.id, project.name]));
  const promptKeywords = normalizeForMatch(prompt).split(" ").filter((word) => word.length > 3);
  const targetDocs = new Map<string, any>();

  if (explicitDocRefs.length > 0) {
    meta.retrieval_type = "exact_document";
    for (const ref of explicitDocRefs) {
      const normalizedRef = normalizeForMatch(ref);
      const exactMatches = docs.filter((doc: any) => normalizeForMatch(doc.title || "") === normalizedRef);
      const partialMatches = docs.filter((doc: any) => {
        const normalizedTitle = normalizeForMatch(doc.title || "");
        return normalizedTitle.includes(normalizedRef) || normalizedRef.includes(normalizedTitle);
      });

      const rankedMatches = (exactMatches.length > 0 ? exactMatches : partialMatches).sort((a: any, b: any) => {
        const aReadable = Number(Boolean(a.raw_text?.trim()));
        const bReadable = Number(Boolean(b.raw_text?.trim()));
        if (aReadable !== bReadable) return bReadable - aReadable;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      if (rankedMatches.length === 0) {
        meta.missing_docs.push(ref);
        continue;
      }

      targetDocs.set(rankedMatches[0].id, rankedMatches[0]);
    }
  } else {
    const scoredDocs = docs
      .map((doc: any) => {
        const normalizedTitle = normalizeForMatch(doc.title || "");
        const normalizedRawPreview = normalizeForMatch((doc.raw_text || "").slice(0, 1200));
        let score = 0;
        for (const keyword of promptKeywords) {
          if (normalizedTitle.includes(keyword)) score += 6;
          if (normalizedRawPreview.includes(keyword)) score += 2;
        }
        return { doc, score };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          new Date(b.doc.created_at).getTime() - new Date(a.doc.created_at).getTime(),
      );

    const fallbackDocs = (scoredDocs.filter((entry) => entry.score > 0).slice(0, projects.length > 0 ? 6 : 4).map((entry) => entry.doc));
    const docsToUse = fallbackDocs.length > 0 ? fallbackDocs : docs.slice(0, projects.length > 0 ? 4 : 3);
    for (const doc of docsToUse) {
      targetDocs.set(doc.id, doc);
    }
  }

  const targetDocIds = [...targetDocs.keys()];
  if (targetDocIds.length === 0) return { text: "", meta };

  const { data: chunks } = await supabase.from("knowledge_chunks")
    .select("content, doc_id, chunk_index")
    .in("doc_id", targetDocIds)
    .order("chunk_index", { ascending: true })
    .limit(40);

  const chunksByDoc = new Map<string, string[]>();
  for (const chunk of chunks ?? []) {
    const existing = chunksByDoc.get(chunk.doc_id) ?? [];
    existing.push(chunk.content);
    chunksByDoc.set(chunk.doc_id, existing);
  }

  let kbText = "";
  for (const docId of targetDocIds) {
    const doc = docMap.get(docId);
    if (!doc) continue;

    const docChunks = chunksByDoc.get(docId) ?? [];
    const projectName = doc.project_id ? projectNameMap.get(doc.project_id) ?? null : null;

    if (docChunks.length > 0) {
      kbText += `\n--- KB DOC: ${doc.title} ---\n`;
      kbText += docChunks.join("\n");
      kbText += "\n";
      meta.docs_used.push({ id: doc.id, title: doc.title, project_id: doc.project_id, project_name: projectName, source_mode: "chunks" });
      continue;
    }

    if (doc.raw_text?.trim()) {
      kbText += `\n--- KB DOC (raw text): ${doc.title} ---\n`;
      kbText += doc.raw_text.slice(0, 2500);
      kbText += "\n";
      meta.docs_used.push({ id: doc.id, title: doc.title, project_id: doc.project_id, project_name: projectName, source_mode: "raw_text" });
      continue;
    }

    if (doc.status === "extraction_failed") {
      meta.unreadable_docs.push(doc.title);
    } else {
      meta.unindexed_docs.push(doc.title);
    }
  }

  if (!kbText) return { text: "", meta };
  if (kbText.length > RETRIEVAL_CAP) kbText = kbText.slice(0, RETRIEVAL_CAP) + "\n[KB_TRUNCATED]";
  return { text: "KNOWLEDGE BASE:\n" + redact(kbText), meta };
}

async function retrieveScoreHistory(supabase: any, projectIds: string[]): Promise<string> {
  if (!projectIds.length) return "";
  const { data } = await supabase.from("project_partner_score_history")
    .select("project_id, momentum_score, risk_level, sell_readiness_score, captured_at")
    .in("project_id", projectIds)
    .order("captured_at", { ascending: false }).limit(20);
  if (!data?.length) return "";
  return "SCORE HISTORY:\n" + data.map((s: any) => `[${s.project_id?.slice(0,8)} ${s.captured_at?.slice(0,10)}] M:${s.momentum_score} R:${s.risk_level} S:${s.sell_readiness_score}`).join("\n");
}

async function buildRetrievalContext(
  supabase: any,
  userId: string,
  tags: string[],
  prompt: string,
): Promise<{ context: string; retrievalMeta: RetrievalMeta }> {
  const projects = await retrieveProjects(supabase, userId, tags, prompt);
  const projectIds = projects.map((p: any) => p.id);

  const projectSummary = projects.map((p: any) =>
    `[${p.name}] id:${p.id.slice(0,8)} status:${p.status} blocked:${p.is_blocked} desc:${(p.description||"").slice(0,100)}`
  ).join("\n");

  const [knowledgeResult, ...parts] = await Promise.all([
    retrieveKnowledge(supabase, userId, projects, tags, prompt),
    retrieveMemories(supabase, projectIds),
    retrieveScores(supabase, projectIds),
    retrieveTasks(supabase, userId, projectIds, tags),
    retrieveMeetings(supabase, userId),
    retrievePlanningNotes(supabase, userId),
    retrieveProjectNotes(supabase, userId, projectIds),
    retrieveProjectLinks(supabase, userId, projectIds),
    retrieveScoreHistory(supabase, projectIds),
  ]);

  const scopedProjects = projectSummary || "No explicitly matched active projects in scope.";
  const contextParts = [knowledgeResult.text, ...parts].filter(Boolean);
  let context = "ACTIVE PROJECTS:\n" + scopedProjects + "\n\n" + contextParts.join("\n\n");
  if (context.length > RETRIEVAL_CAP) context = context.slice(0, RETRIEVAL_CAP) + "\n[CONTEXT_TRIMMED]";
  return { context: redact(context), retrievalMeta: knowledgeResult.meta };
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
10. Be rigorous but concise — executive-grade communication.
11. You DO have direct access to the retrieved VantoOS context included in this request. Never tell the user that you cannot access the knowledge base, project notes, files, or portfolio data when that context is present. If something is missing, unreadable, or not indexed yet, explain that exact limitation instead.`;

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
      const userPrompt = prompt || "Hello";
      const { context, retrievalMeta } = await buildRetrievalContext(supabase, user.id, tags, userPrompt);
      const retrievalNotes = [
        retrievalMeta.docs_used.length > 0
          ? `Knowledge sources used: ${retrievalMeta.docs_used.map((doc) => doc.title).join(", ")}`
          : "",
        retrievalMeta.missing_docs.length > 0
          ? `Requested docs not found in scope: ${retrievalMeta.missing_docs.join(", ")}`
          : "",
        retrievalMeta.unindexed_docs.length > 0
          ? `Requested docs exist but are not indexed yet: ${retrievalMeta.unindexed_docs.join(", ")}`
          : "",
        retrievalMeta.unreadable_docs.length > 0
          ? `Requested docs exist but content extraction failed: ${retrievalMeta.unreadable_docs.join(", ")}`
          : "",
      ].filter(Boolean).join("\n");

      const messages: any[] = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "system",
          content: `PORTFOLIO CONTEXT (retrieved ${new Date().toISOString().slice(0,16)}):\n\n${context}${retrievalNotes ? `\n\nRETRIEVAL NOTES:\n${retrievalNotes}` : ""}`,
        },
      ];

      if (history?.length) {
        for (const h of history.slice(-20)) {
          messages.push({ role: h.role === "assistant" ? "assistant" : "user", content: h.content });
        }
      }

      messages.push({ role: "user", content: userPrompt });

      if (stream) {
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

        const transformStream = new TransformStream({
          async transform(chunk, controller) {
            const text = new TextDecoder().decode(chunk);
            const lines = text.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const payload = line.slice(6).trim();
                if (payload === "[DONE]") {
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "retrieval_meta", data: retrievalMeta })}\n\n`));
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

        return new Response(JSON.stringify({ mode: "chat", result: { content, retrieval_meta: retrievalMeta }, context_len: context.length }), {
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
