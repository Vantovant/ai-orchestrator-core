import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SNAPSHOT_CAP = 6000;
const KB_CHUNK_CAP = 6000;

function redact(text: string): string {
  return text
    .replace(/\b\d{13}\b/g, "[ID_REDACTED]")
    .replace(/\b\d{10,12}\b/g, "[ACCT_REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]")
    .replace(/\b(?:\+27|0)\d{9}\b/g, "[PHONE_REDACTED]")
    .replace(/\[CONFIDENTIAL\].*?\[\/CONFIDENTIAL\]/gi, "[REDACTED_BLOCK]");
}

// ── Knowledge Retrieval ──────────────────────────────────────
interface RetrievalMeta {
  project_id: string;
  docs_used: { id: string; title: string }[];
  retrieval_type: "exact_document" | "filtered_project" | "general_project";
  missing_docs: string[];
  unindexed_docs: string[];
  data_sources: string[];
}

function detectDocReferences(prompt: string): string[] {
  const refs: string[] = [];
  const atDocMatches = prompt.matchAll(/@doc:([^\s,]+(?:\s+[^\s,@]+)*)/gi);
  for (const m of atDocMatches) refs.push(m[1].trim());
  const naturalPatterns = [
    /refer\s+to\s+["`']?([^"'`\n,]+?)["`']?(?:\s+and|\s*$|\s*,)/gi,
    /use\s+(?:the\s+)?["`']?([^"'`\n,]+?)["`']?\s+document/gi,
    /check\s+(?:the\s+)?["`']?([^"'`\n,]+?)["`']?\s+(?:in|from|document)/gi,
  ];
  for (const pat of naturalPatterns) {
    for (const m of prompt.matchAll(pat)) refs.push(m[1].trim());
  }
  return [...new Set(refs)].filter(r => r.length > 3);
}

async function retrieveProjectKnowledge(
  supabase: any, userId: string, projectId: string, prompt: string, selectedDocIds: string[] | null,
): Promise<{ text: string; meta: RetrievalMeta }> {
  const meta: RetrievalMeta = {
    project_id: projectId,
    docs_used: [],
    retrieval_type: "general_project",
    missing_docs: [],
    unindexed_docs: [],
    data_sources: [],
  };

  const { data: allDocs } = await supabase
    .from("knowledge_docs")
    .select("id, title, status, raw_text, project_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .order("created_at", { ascending: false });

  if (!allDocs?.length) return { text: "", meta };

  let targetDocIds: string[] = [];
  const docReferences = detectDocReferences(prompt);

  if (selectedDocIds?.length) {
    targetDocIds = selectedDocIds;
    meta.retrieval_type = "exact_document";
  } else if (docReferences.length) {
    meta.retrieval_type = "exact_document";
    for (const ref of docReferences) {
      const refLower = ref.toLowerCase();
      let match = allDocs.find((d: any) => d.title.toLowerCase() === refLower);
      if (!match) match = allDocs.find((d: any) => d.title.toLowerCase().includes(refLower) || refLower.includes(d.title.toLowerCase()));
      if (match) targetDocIds.push(match.id);
      else meta.missing_docs.push(ref);
    }
  }

  if (!targetDocIds.length && !meta.missing_docs.length) {
    const projectDocs = allDocs.filter((d: any) => d.project_id === projectId);
    targetDocIds = projectDocs.slice(0, 20).map((d: any) => d.id);
    meta.retrieval_type = "filtered_project";
  } else if (!targetDocIds.length && meta.missing_docs.length) {
    const projectDocs = allDocs.filter((d: any) => d.project_id === projectId);
    targetDocIds = projectDocs.slice(0, 10).map((d: any) => d.id);
    meta.retrieval_type = "general_project";
  }

  if (!targetDocIds.length) return { text: "", meta };

  for (const docId of targetDocIds) {
    const doc = allDocs.find((d: any) => d.id === docId);
    if (doc) meta.docs_used.push({ id: doc.id, title: doc.title });
  }

  const { data: chunks } = await supabase
    .from("knowledge_chunks")
    .select("content, chunk_index, doc_id")
    .in("doc_id", targetDocIds)
    .order("chunk_index", { ascending: true })
    .limit(50);

  const docsWithChunks = new Set((chunks ?? []).map((c: any) => c.doc_id));
  for (const docId of targetDocIds) {
    if (!docsWithChunks.has(docId)) {
      const doc = allDocs.find((d: any) => d.id === docId);
      if (doc) meta.unindexed_docs.push(doc.title);
    }
  }

  let kbText = "";
  if (chunks?.length) {
    const byDoc: Record<string, string[]> = {};
    for (const c of chunks) {
      if (!byDoc[c.doc_id]) byDoc[c.doc_id] = [];
      byDoc[c.doc_id].push(c.content);
    }
    for (const [docId, contents] of Object.entries(byDoc)) {
      const doc = allDocs.find((d: any) => d.id === docId);
      kbText += `\n--- DOCUMENT: ${doc?.title ?? "Unknown"} ---\n`;
      kbText += contents.join("\n");
      kbText += "\n";
    }
  }

  for (const docId of targetDocIds) {
    if (!docsWithChunks.has(docId)) {
      const doc = allDocs.find((d: any) => d.id === docId);
      if (doc?.raw_text?.trim()) {
        const rawSlice = meta.retrieval_type === "exact_document" ? 4000 : 2000;
        kbText += `\n--- DOCUMENT (raw text): ${doc.title} ---\n`;
        kbText += doc.raw_text.slice(0, rawSlice);
        kbText += "\n";
        meta.unindexed_docs = meta.unindexed_docs.filter(t => t !== doc.title);
      }
    }
  }

  if (kbText.length > KB_CHUNK_CAP) kbText = kbText.slice(0, KB_CHUNK_CAP) + "\n[KB_TRUNCATED]";
  kbText = redact(kbText);

  if (kbText) meta.data_sources.push("knowledge_base");
  return { text: kbText, meta };
}

// ── Cross-Module Live Data Retrieval ──────────────────────────────
async function retrieveEmails(supabase: any, userId: string, projectId: string): Promise<string> {
  // Get emails linked to this project via email_inbox_items, plus recent emails for context
  const { data: linkedItems } = await supabase
    .from("email_inbox_items")
    .select("source_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("last_touched_at", { ascending: false })
    .limit(10);

  const linkedIds = (linkedItems ?? []).map((i: any) => i.source_id);

  let emailText = "";

  if (linkedIds.length > 0) {
    const { data: linkedEmails } = await supabase
      .from("email_messages")
      .select("subject, sender, date, snippet, category, urgency, intent, is_starred, waiting_on")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("message_id", linkedIds)
      .order("date", { ascending: false })
      .limit(10);

    if (linkedEmails?.length) {
      emailText += "PROJECT-LINKED EMAILS:\n";
      for (const e of linkedEmails) {
        emailText += `- [${e.date?.slice(0, 10)}] "${e.subject}" from ${e.sender}`;
        if (e.urgency) emailText += ` [${e.urgency}]`;
        if (e.intent) emailText += ` intent:${e.intent}`;
        if (e.is_starred) emailText += ` ⭐`;
        if (e.waiting_on) emailText += ` [waiting]`;
        if (e.snippet) emailText += `\n  ${e.snippet.slice(0, 120)}`;
        emailText += "\n";
      }
    }
  }

  // Also get recent emails that mention the project by searching snippets
  // Limited approach: get recent starred/urgent emails as context
  const { data: recentImportant } = await supabase
    .from("email_messages")
    .select("subject, sender, date, snippet, urgency, intent, is_starred, waiting_on")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or("is_starred.eq.true,urgency.eq.urgent,waiting_on.eq.true")
    .order("date", { ascending: false })
    .limit(5);

  if (recentImportant?.length) {
    emailText += "\nRECENT IMPORTANT EMAILS (starred/urgent/waiting):\n";
    for (const e of recentImportant) {
      emailText += `- [${e.date?.slice(0, 10)}] "${e.subject}" from ${e.sender}`;
      if (e.urgency) emailText += ` [${e.urgency}]`;
      if (e.is_starred) emailText += ` ⭐`;
      if (e.waiting_on) emailText += ` [waiting]`;
      emailText += "\n";
    }
  }

  // Email extracts (smart extracted data from emails)
  const { data: extracts } = await supabase
    .from("email_extracts")
    .select("detected_type, summary, confidence, entities_json, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("confidence", 0.6)
    .order("created_at", { ascending: false })
    .limit(5);

  if (extracts?.length) {
    emailText += "\nEMAIL SMART EXTRACTS (recent):\n";
    for (const ex of extracts) {
      emailText += `- [${ex.detected_type}] ${ex.summary.slice(0, 150)} (confidence: ${ex.confidence})\n`;
    }
  }

  return emailText;
}

async function retrieveFinance(supabase: any, userId: string): Promise<string> {
  let finText = "";

  // Recent finance entries (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: entries } = await supabase
    .from("finance_entries")
    .select("type, category, amount, entry_date, notes, source")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("entry_date", thirtyDaysAgo)
    .order("entry_date", { ascending: false })
    .limit(20);

  if (entries?.length) {
    const totalIncome = entries.filter((e: any) => e.type === "income").reduce((s: number, e: any) => s + Number(e.amount), 0);
    const totalExpense = entries.filter((e: any) => e.type === "expense").reduce((s: number, e: any) => s + Number(e.amount), 0);
    finText += `FINANCE (last 30 days): Income: R${totalIncome.toFixed(0)} | Expenses: R${totalExpense.toFixed(0)} | Net: R${(totalIncome - totalExpense).toFixed(0)}\n`;
    finText += "Recent entries:\n";
    for (const e of entries.slice(0, 10)) {
      finText += `- [${e.entry_date}] ${e.type}: R${Number(e.amount).toFixed(0)} (${e.category})${e.notes ? " — " + e.notes.slice(0, 60) : ""}\n`;
    }
  }

  // Active budget items
  const { data: budgetItems } = await supabase
    .from("finance_budget_items")
    .select("name, type, amount, cadence, category, vendor, status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("status", "active")
    .limit(15);

  if (budgetItems?.length) {
    finText += "\nACTIVE BUDGET ITEMS:\n";
    for (const b of budgetItems) {
      finText += `- ${b.name}: R${Number(b.amount).toFixed(0)}/${b.cadence} (${b.type})${b.vendor ? " [" + b.vendor + "]" : ""}\n`;
    }
  }

  // Debts
  const { data: debts } = await supabase
    .from("debts")
    .select("lender_name, principal, repayment_amount, status, interest_rate")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("status", "active")
    .limit(10);

  if (debts?.length) {
    finText += "\nACTIVE DEBTS:\n";
    for (const d of debts) {
      finText += `- ${d.lender_name}: Principal R${Number(d.principal).toFixed(0)}`;
      if (d.repayment_amount) finText += ` Repayment R${Number(d.repayment_amount).toFixed(0)}/m`;
      if (d.interest_rate) finText += ` @${d.interest_rate}%`;
      finText += "\n";
    }
  }

  // Income streams
  const { data: streams } = await supabase
    .from("income_streams")
    .select("label, stream_type, monthly_target, current_month_income")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .limit(10);

  if (streams?.length) {
    finText += "\nINCOME STREAMS:\n";
    for (const s of streams) {
      finText += `- ${s.label} (${s.stream_type}): Target R${Number(s.monthly_target).toFixed(0)} | Current R${Number(s.current_month_income).toFixed(0)}\n`;
    }
  }

  // Finance notes (current month)
  const currentMonth = new Date().toISOString().slice(0, 7);
  const { data: finNotes } = await supabase
    .from("finance_notes")
    .select("content, note_month")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("note_month", currentMonth)
    .limit(1);

  if (finNotes?.length && finNotes[0].content?.trim()) {
    finText += `\nFINANCE NOTE (${currentMonth}):\n${finNotes[0].content.slice(0, 300)}\n`;
  }

  return finText;
}

async function retrievePlanHub(supabase: any, userId: string): Promise<string> {
  let planText = "";

  // Reminders
  const { data: reminders } = await supabase
    .from("reminders")
    .select("title, reminder_time, is_done, description")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("is_done", false)
    .order("reminder_time", { ascending: true })
    .limit(10);

  if (reminders?.length) {
    planText += "ACTIVE REMINDERS:\n";
    for (const r of reminders) {
      planText += `- ${r.title} (due: ${r.reminder_time?.slice(0, 16)})${r.description ? " — " + r.description.slice(0, 60) : ""}\n`;
    }
  }

  // Daily planning notes (last 3)
  const { data: dailyNotes } = await supabase
    .from("notes_daily")
    .select("note_date, content")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("note_date", { ascending: false })
    .limit(3);

  if (dailyNotes?.length) {
    planText += "\nPLANNING NOTES (recent):\n";
    for (const n of dailyNotes) {
      planText += `- [${n.note_date}] ${(n.content || "").slice(0, 200)}\n`;
    }
  }

  return planText;
}

// ── Snapshot Builder (enhanced with cross-module data) ──────────
async function buildSnapshot(supabase: any, userId: string, projectId: string): Promise<{ text: string; json: any; dataSources: string[] }> {
  const dataSources: string[] = ["project", "tasks", "meetings", "notes"];

  const [memoryRes, projectRes, tasksRes, meetingsRes, notesRes, linksRes] = await Promise.all([
    supabase.from("project_partner_memory").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("projects").select("name, status, progress_manual, progress_mode, is_blocked, description, tags, updated_at").eq("id", projectId).single(),
    supabase.from("tasks").select("id, title, status, priority, due_date, estimated_minutes").eq("project_id", projectId).is("deleted_at", null).in("status", ["pending", "in_progress"]).order("due_date", { ascending: true, nullsFirst: false }).limit(15),
    supabase.from("meetings").select("id, title, start_time, end_time, location, agenda").eq("project_id", projectId).is("deleted_at", null).gte("start_time", new Date().toISOString()).order("start_time", { ascending: true }).limit(5),
    supabase.from("project_notes").select("note_date, content").eq("project_id", projectId).is("deleted_at", null).order("note_date", { ascending: false }).limit(7),
    supabase.from("project_links").select("label, url").eq("project_id", projectId).is("deleted_at", null).limit(5),
  ]);

  const memory = memoryRes.data;
  const project = projectRes.data;
  const tasks = tasksRes.data ?? [];
  const meetings = meetingsRes.data ?? [];
  const notes = notesRes.data ?? [];
  const links = linksRes.data ?? [];

  // Done tasks count
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

  let text = "";
  if (memory) {
    dataSources.push("partner_memory");
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

  text += `PROJECT: ${project?.name ?? "Unknown"}\nStatus: ${project?.status} | Progress: ${progress}% (${doneTasks}/${totalTasks} tasks done) | Health: ${health}\n`;
  if (project?.description) text += `Description: ${project.description.slice(0, 300)}\n`;
  if (project?.tags?.length) text += `Tags: ${project.tags.join(", ")}\n`;

  text += `\nOPEN TASKS (${tasks.length}):\n`;
  for (const t of tasks) {
    text += `- [${t.priority}] ${t.title}${t.due_date ? ` (due: ${t.due_date.slice(0, 10)})` : ""}`;
    if (t.due_date && new Date(t.due_date) < new Date()) text += " ⚠️OVERDUE";
    text += "\n";
  }

  text += `\nUPCOMING MEETINGS (${meetings.length}):\n`;
  for (const m of meetings) {
    text += `- ${m.title} at ${m.start_time?.slice(0, 16)}`;
    if (m.agenda) text += ` | Agenda: ${m.agenda.slice(0, 100)}`;
    text += "\n";
  }

  text += `\nRECENT NOTES (last 7):\n`;
  for (const n of notes) {
    text += `[${n.note_date}] ${n.content?.slice(0, 200)}…\n`;
  }

  if (links.length) {
    text += `\nLINKS:\n`;
    for (const l of links) text += `- ${l.label}: ${l.url}\n`;
  }

  // ── Cross-module live data ──
  const [emailText, financeText, planText] = await Promise.all([
    retrieveEmails(supabase, userId, projectId),
    retrieveFinance(supabase, userId),
    retrievePlanHub(supabase, userId),
  ]);

  if (emailText) { text += `\n${emailText}`; dataSources.push("emails"); }
  if (financeText) { text += `\n${financeText}`; dataSources.push("finance"); }
  if (planText) { text += `\n${planText}`; dataSources.push("plan_hub"); }

  if (text.length > SNAPSHOT_CAP) text = text.slice(0, SNAPSHOT_CAP) + "\n[TRUNCATED]";
  text = redact(text);

  return { text, json, dataSources };
}

// ── System Prompts ──────────────────────────────────────
function getSystemPrompt(mode: string, hasKB: boolean, dataSources: string[]): string {
  const base = `You are an AI Senior Partner — a PhD-level strategist with streetwise African business execution experience. You advise a solo entrepreneur/executive on their personal projects. Be rigorous, practical, and concise. Ground all advice in the project data provided. Never invent facts about funding programs or external entities. If something needs verification, explicitly say "needs verification".`;

  const dataAwareness = `\n\nYou have DIRECT ACCESS to the following live operational data (already retrieved and included in this request): ${dataSources.join(", ")}. You can and should reason from ALL this data. Do NOT tell the user you lack access to their data when it has been provided to you. When advising, cross-reference tasks, meetings, finances, emails, and knowledge documents together for comprehensive guidance.`;

  const kbInstruction = hasKB
    ? `\n\nYou have been given PROJECT KNOWLEDGE BASE documents. When the user asks about document contents, answer DIRECTLY from those documents. Quote relevant sections. If a document was requested but not found, say so explicitly.`
    : "";

  const crossModuleInstruction = `\n\nCROSS-MODULE REASONING: When the user asks about a project, combine evidence from ALL available sources — tasks, meetings, notes, emails, finances, knowledge docs. For example: if asked "what's blocking this project?", check overdue tasks, waiting emails, financial constraints, and knowledge documents together. If asked about affordability, combine finance data with project resource needs. Always cite which data source your conclusions come from.`;

  const modeInstructions: Record<string, string> = {
    executive_brief: `\n\nProduce an Executive Brief with:\n1. Project status summary (2-3 sentences, grounded in real task/meeting/finance data)\n2. Top 3 priorities (actionable, specific, citing evidence)\n3. Biggest risk and mitigation (cite the data source)\n4. Next meeting prep notes (if meetings upcoming)\n\nReturn JSON with tool call.`,
    sprint_plan: `\n\nProduce a 7-day Sprint Plan with:\n1. This week's focus areas (based on real open tasks and deadlines)\n2. Daily action items (Mon-Sun, 2-3 items each)\n3. Items to postpone and why\n4. Quick wins available this week\n\nReturn JSON with tool call.`,
    sell_readiness: `\n\nConduct a Sell-Readiness Audit. Score each dimension 0-100:\n1. problem_clarity\n2. solution_maturity\n3. mvp_stability\n4. onboarding_ux\n5. pricing_packaging\n6. compliance\n7. support_docs\n\nProvide an overall score, missing items, and exact next steps.\n\nReturn JSON with tool call.`,
    update_memory: `\n\nBased on the project data, propose updates to the Partner Memory fields. Only suggest changes where you have clear evidence from the project data. Return ONLY fields that should change.`,
    funding_pathways: `\n\nAnalyze this project's funding readiness. Provide:\n1. Recommended funding TYPES\n2. A funding readiness checklist\n3. If cached funding opportunities provided, include them. Do NOT invent funding programs.\n\nReturn JSON with tool call.`,
    chat: `\n\nYou are in conversational mode. Answer the user's question using ALL provided project context, cross-module data, and knowledge base documents. Be specific and cite data sources. If the user asks about finances, use the finance data. If they ask about emails, use the email data. If they ask about tasks or deadlines, use the task data. Cross-reference modules when the question spans multiple areas.`,
  };

  return `${base}${dataAwareness}${kbInstruction}${crossModuleInstruction}${modeInstructions[mode] || ""}`;
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

// ── Main Handler ──────────────────────────────────────
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
    const { project_id, mode, prompt, selected_doc_ids } = body;
    if (!project_id || !mode) {
      return new Response(JSON.stringify({ error: "project_id and mode required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build project snapshot with cross-module data
    const { text: snapshotText, json: snapshotJson, dataSources } = await buildSnapshot(supabase, user.id, project_id);

    // Retrieve project knowledge base
    const userPrompt = prompt || `Produce the ${mode.replace(/_/g, " ")} analysis.`;
    const { text: kbText, meta: retrievalMeta } = await retrieveProjectKnowledge(
      supabase, user.id, project_id, userPrompt, selected_doc_ids ?? null,
    );

    // Merge data_sources
    retrievalMeta.data_sources = [...new Set([...dataSources, ...retrievalMeta.data_sources])];

    // For funding_pathways, append cached funding data
    let extraContext = "";
    if (mode === "funding_pathways") {
      const { data: cached } = await supabase.from("funding_cache").select("org_name, program_name, funding_type, summary, source_url, source_name, fetched_at, ticket_size_range")
        .eq("project_id", project_id).order("fetched_at", { ascending: false }).limit(10);
      if (cached?.length) {
        extraContext = "\n\nCACHED VERIFIED FUNDING OPPORTUNITIES:\n";
        for (const c of cached) {
          extraContext += `- ${c.org_name}: ${c.program_name} (${c.funding_type}) — ${c.summary?.slice(0, 100)} [Source: ${c.source_url}]\n`;
        }
      }
    }

    const hasKB = kbText.length > 0;
    const systemPrompt = getSystemPrompt(mode, hasKB, retrievalMeta.data_sources);
    const tools = getTools(mode);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userContent = `Here is the project snapshot:\n\n${snapshotText}${extraContext}`;
    if (kbText) {
      userContent += `\n\nPROJECT KNOWLEDGE BASE:\n${kbText}`;
    }
    if (retrievalMeta.missing_docs.length) {
      userContent += `\n\n⚠️ The user referenced these documents but they were NOT found in this project's Knowledge Base: ${retrievalMeta.missing_docs.join(", ")}. Please inform the user.`;
    }
    if (retrievalMeta.unindexed_docs.length) {
      userContent += `\n\n⚠️ These documents exist but have NOT been indexed into chunks yet: ${retrievalMeta.unindexed_docs.join(", ")}. Inform the user they may need to re-upload or wait for processing.`;
    }

    if (mode === "chat" && prompt) {
      userContent += `\n\nUser question: ${redact(prompt)}`;
    } else if (mode !== "chat") {
      userContent += `\n\nPlease produce the ${mode.replace(/_/g, " ")} analysis.`;
    }

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

    // Auto-update memory
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
      kb_len: kbText.length,
      was_truncated: snapshotText.includes("[TRUNCATED]"),
      kb_truncated: kbText.includes("[KB_TRUNCATED]"),
      retrieval_meta: retrievalMeta,
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
