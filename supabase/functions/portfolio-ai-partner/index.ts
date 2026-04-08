import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RETRIEVAL_CAP = 10000;

// ─── Daily review intent detection ─────────────────────
const DAILY_REVIEW_PATTERNS = [
  /\bhow\s+was\s+(?:the\s+)?(?:my\s+)?day\b/i,
  /\bhow\s+(?:did|was)\s+today\b/i,
  /\bwhat\s+(?:was|got)\s+done\s+today\b/i,
  /\bwhat\s+(?:did\s+I|have\s+I)\s+(?:do|achieve|accomplish|complete)\s+today\b/i,
  /\bwhat\s+happened\s+today\b/i,
  /\bdaily\s*review\b/i,
  /\bend\s*[\-\s]*of\s*[\-\s]*day\b/i,
  /\btoday['']?s?\s+(?:summary|review|recap|briefing|report|wrap[\-\s]*up)\b/i,
  /\bwhat\s+could\s+(?:be|have\s+been)\s+done\s+better\s+today\b/i,
  /\bwhat\s+was\s+done\s+well\s+today\b/i,
  /\bwhat\s+(?:are|were)\s+(?:my\s+)?(?:wins|achievements)\s+today\b/i,
  /\breview\s+(?:my\s+)?(?:today|this\s+day)\b/i,
  /\bhow\s+productive\s+was\s+(?:I|my\s+day)\s+today\b/i,
];

function detectDailyReviewIntent(prompt: string): boolean {
  return DAILY_REVIEW_PATTERNS.some(p => p.test(prompt));
}

function getTodayRange(): { todayStart: string; todayEnd: string; todayDate: string } {
  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10);
  const todayStart = todayDate + "T00:00:00.000Z";
  const todayEnd = todayDate + "T23:59:59.999Z";
  return { todayStart, todayEnd, todayDate };
}

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
  data_sources: string[];
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function detectDocReferences(prompt: string): string[] {
  const refs: string[] = [];
  const patterns = [
    /refer\s+to\s+["`']?([^"'`\n,]+?)["`']?(?:\s+and|\s*$|\s*,)/gi,
    /(?:share|read|use|check|summari(?:s|z)e)\s+(?:the\s+)?(?:contents?\s+of\s+)?(?:this\s+)?document\s+["`']?([^"'`\n,]+?)["`']?(?:\s+and|\s*$|\s*,)/gi,
    /(?:use|check)\s+(?:the\s+)?([^"'`\n,]+?)\s+document/gi,
  ];
  for (const pattern of patterns) {
    for (const match of prompt.matchAll(pattern)) refs.push(match[1].trim());
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
    .sort((a, b) => normalizeForMatch(b.name || "").length - normalizeForMatch(a.name || "").length);
}

// ─── Retrieval helpers ─────────────────────────────────

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
    query = query.neq("status", "completed");
  }
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
    .select("title, start_time, project_id, agenda")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true }).limit(5);
  if (!data?.length) return "";
  return "UPCOMING MEETINGS:\n" + data.map((m: any) => `- ${m.title} at ${m.start_time?.slice(0,16)} proj:${m.project_id?.slice(0,8)||"none"}${m.agenda ? " agenda:" + m.agenda.slice(0,80) : ""}`).join("\n");
}

async function retrievePlanningNotes(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("notes_daily")
    .select("note_date, content, updated_at")
    .eq("user_id", userId).is("deleted_at", null)
    .order("note_date", { ascending: false }).limit(3);
  if (!data?.length) return "";
  return "RECENT PLANNING NOTES:\n" + data.map((n: any) => `- [${n.note_date}] ${(n.content||"").slice(0,200)}`).join("\n");
}

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

async function retrieveScoreHistory(supabase: any, projectIds: string[]): Promise<string> {
  if (!projectIds.length) return "";
  const { data } = await supabase.from("project_partner_score_history")
    .select("project_id, momentum_score, risk_level, sell_readiness_score, captured_at")
    .in("project_id", projectIds)
    .order("captured_at", { ascending: false }).limit(20);
  if (!data?.length) return "";
  return "SCORE HISTORY:\n" + data.map((s: any) => `[${s.project_id?.slice(0,8)} ${s.captured_at?.slice(0,10)}] M:${s.momentum_score} R:${s.risk_level} S:${s.sell_readiness_score}`).join("\n");
}

// ─── NEW: Cross-module live data retrieval ─────────────────────

async function retrieveEmails(supabase: any, userId: string): Promise<string> {
  let emailText = "";

  // Recent important emails (starred, urgent, waiting)
  const { data: important } = await supabase
    .from("email_messages")
    .select("subject, sender, date, snippet, urgency, intent, is_starred, waiting_on, category")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or("is_starred.eq.true,urgency.eq.urgent,waiting_on.eq.true")
    .order("date", { ascending: false })
    .limit(10);

  if (important?.length) {
    emailText += "IMPORTANT EMAILS (starred/urgent/waiting):\n";
    for (const e of important) {
      emailText += `- [${e.date?.slice(0, 10)}] "${e.subject}" from ${e.sender}`;
      if (e.urgency) emailText += ` [${e.urgency}]`;
      if (e.intent) emailText += ` intent:${e.intent}`;
      if (e.is_starred) emailText += ` ⭐`;
      if (e.waiting_on) emailText += ` [waiting]`;
      if (e.snippet) emailText += `\n  ${e.snippet.slice(0, 100)}`;
      emailText += "\n";
    }
  }

  // Smart extracts
  const { data: extracts } = await supabase
    .from("email_extracts")
    .select("detected_type, summary, confidence, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("confidence", 0.6)
    .order("created_at", { ascending: false })
    .limit(5);

  if (extracts?.length) {
    emailText += "\nEMAIL SMART EXTRACTS:\n";
    for (const ex of extracts) {
      emailText += `- [${ex.detected_type}] ${ex.summary.slice(0, 150)}\n`;
    }
  }

  return emailText;
}

async function retrieveFinance(supabase: any, userId: string): Promise<string> {
  let finText = "";

  // Finance entries (last 30 days summary)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: entries } = await supabase
    .from("finance_entries")
    .select("type, category, amount, entry_date, notes")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("entry_date", thirtyDaysAgo)
    .order("entry_date", { ascending: false })
    .limit(20);

  if (entries?.length) {
    const income = entries.filter((e: any) => e.type === "income").reduce((s: number, e: any) => s + Number(e.amount), 0);
    const expense = entries.filter((e: any) => e.type === "expense").reduce((s: number, e: any) => s + Number(e.amount), 0);
    finText += `FINANCE (30-day): Income R${income.toFixed(0)} | Expenses R${expense.toFixed(0)} | Net R${(income - expense).toFixed(0)}\n`;
    finText += "Recent entries:\n";
    for (const e of entries.slice(0, 8)) {
      finText += `- [${e.entry_date}] ${e.type}: R${Number(e.amount).toFixed(0)} (${e.category})${e.notes ? " — " + e.notes.slice(0, 50) : ""}\n`;
    }
  }

  // Budget items
  const { data: budget } = await supabase
    .from("finance_budget_items")
    .select("name, type, amount, cadence, status")
    .eq("user_id", userId).is("deleted_at", null).eq("status", "active")
    .limit(10);

  if (budget?.length) {
    finText += "\nACTIVE BUDGET:\n";
    for (const b of budget) {
      finText += `- ${b.name}: R${Number(b.amount).toFixed(0)}/${b.cadence} (${b.type})\n`;
    }
  }

  // Debts
  const { data: debts } = await supabase
    .from("debts")
    .select("lender_name, principal, repayment_amount, status")
    .eq("user_id", userId).is("deleted_at", null).eq("status", "active")
    .limit(8);

  if (debts?.length) {
    finText += "\nACTIVE DEBTS:\n";
    for (const d of debts) {
      finText += `- ${d.lender_name}: Principal R${Number(d.principal).toFixed(0)}`;
      if (d.repayment_amount) finText += ` Repayment R${Number(d.repayment_amount).toFixed(0)}/m`;
      finText += "\n";
    }
  }

  // Income streams
  const { data: streams } = await supabase
    .from("income_streams")
    .select("label, stream_type, monthly_target, current_month_income")
    .eq("user_id", userId).is("deleted_at", null)
    .limit(8);

  if (streams?.length) {
    finText += "\nINCOME STREAMS:\n";
    for (const s of streams) {
      finText += `- ${s.label} (${s.stream_type}): Target R${Number(s.monthly_target).toFixed(0)} | Current R${Number(s.current_month_income).toFixed(0)}\n`;
    }
  }

  return finText;
}

async function retrieveReminders(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("reminders")
    .select("title, reminder_time, is_done, description")
    .eq("user_id", userId).is("deleted_at", null).eq("is_done", false)
    .order("reminder_time", { ascending: true })
    .limit(10);
  if (!data?.length) return "";
  return "ACTIVE REMINDERS:\n" + data.map((r: any) => `- ${r.title} (due: ${r.reminder_time?.slice(0, 16)})${r.description ? " — " + r.description.slice(0, 60) : ""}`).join("\n");
}

// Knowledge retrieval
async function retrieveKnowledge(
  supabase: any, userId: string, projects: any[], tags: string[], prompt: string,
): Promise<{ text: string; meta: RetrievalMeta }> {
  const meta: RetrievalMeta = {
    retrieval_type: projects.length > 0 ? "project_scoped" : "portfolio_general",
    project_ids: projects.map((p) => p.id),
    project_names: projects.map((p) => p.name),
    docs_used: [],
    missing_docs: [],
    unindexed_docs: [],
    unreadable_docs: [],
    data_sources: [],
  };

  if (tags.includes("@global-only")) return { text: "", meta };

  const explicitDocRefs = [
    ...new Set([
      ...tags.filter((t) => t.startsWith("@doc:")).map((t) => t.slice(5).trim()),
      ...detectDocReferences(prompt),
    ].filter(Boolean)),
  ];

  let docsQuery = supabase.from("knowledge_docs")
    .select("id, title, raw_text, status, project_id, created_at")
    .eq("user_id", userId).is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(projects.length > 0 ? 60 : 120);

  if (projects.length > 0) {
    docsQuery = docsQuery.in("project_id", projects.map((p) => p.id));
  }

  const { data: docs } = await docsQuery;
  if (!docs?.length) {
    if (explicitDocRefs.length > 0) meta.missing_docs = explicitDocRefs;
    return { text: "", meta };
  }

  const docMap = new Map(docs.map((d: any) => [d.id, d]));
  const projectNameMap = new Map(projects.map((p) => [p.id, p.name]));
  const promptKeywords = normalizeForMatch(prompt).split(" ").filter((w) => w.length > 3);
  const targetDocs = new Map<string, any>();

  if (explicitDocRefs.length > 0) {
    meta.retrieval_type = "exact_document";
    for (const ref of explicitDocRefs) {
      const normalizedRef = normalizeForMatch(ref);
      const exactMatches = docs.filter((d: any) => normalizeForMatch(d.title || "") === normalizedRef);
      const partialMatches = docs.filter((d: any) => {
        const nt = normalizeForMatch(d.title || "");
        return nt.includes(normalizedRef) || normalizedRef.includes(nt);
      });
      const ranked = (exactMatches.length > 0 ? exactMatches : partialMatches).sort((a: any, b: any) => {
        const aR = Number(Boolean(a.raw_text?.trim()));
        const bR = Number(Boolean(b.raw_text?.trim()));
        if (aR !== bR) return bR - aR;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      if (ranked.length === 0) { meta.missing_docs.push(ref); continue; }
      targetDocs.set(ranked[0].id, ranked[0]);
    }
  } else {
    const scored = docs.map((doc: any) => {
      const nt = normalizeForMatch(doc.title || "");
      const nr = normalizeForMatch((doc.raw_text || "").slice(0, 1200));
      let score = 0;
      for (const kw of promptKeywords) {
        if (nt.includes(kw)) score += 6;
        if (nr.includes(kw)) score += 2;
      }
      return { doc, score };
    }).sort((a, b) => b.score - a.score || new Date(b.doc.created_at).getTime() - new Date(a.doc.created_at).getTime());
    const fallback = scored.filter((e) => e.score > 0).slice(0, 6).map((e) => e.doc);
    const toUse = fallback.length > 0 ? fallback : docs.slice(0, 4);
    for (const d of toUse) targetDocs.set(d.id, d);
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
    if (doc.status === "extraction_failed") meta.unreadable_docs.push(doc.title);
    else meta.unindexed_docs.push(doc.title);
  }

  if (!kbText) return { text: "", meta };
  if (kbText.length > 8000) kbText = kbText.slice(0, 8000) + "\n[KB_TRUNCATED]";
  if (kbText) meta.data_sources.push("knowledge_base");
  return { text: "KNOWLEDGE BASE:\n" + redact(kbText), meta };
}

// ─── Daily review: today-filtered retrieval ─────────────────────

async function retrieveTodayData(supabase: any, userId: string): Promise<{ text: string; counts: Record<string, number> }> {
  const { todayStart, todayEnd, todayDate } = getTodayRange();
  const counts: Record<string, number> = {};
  let text = "";

  // 1. Tasks completed today
  const { data: completedTasks } = await supabase.from("tasks")
    .select("title, priority, project_id, updated_at")
    .eq("user_id", userId).is("deleted_at", null)
    .eq("status", "done")
    .gte("updated_at", todayStart).lte("updated_at", todayEnd)
    .order("updated_at", { ascending: false }).limit(30);
  if (completedTasks?.length) {
    counts.tasks_completed = completedTasks.length;
    text += "TASKS COMPLETED TODAY:\n" + completedTasks.map((t: any) => `- [${t.priority}] ${t.title} (proj:${t.project_id?.slice(0,8)||"none"})`).join("\n") + "\n\n";
  }

  // 2. Tasks created today
  const { data: createdTasks } = await supabase.from("tasks")
    .select("title, priority, status, project_id, created_at")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("created_at", todayStart).lte("created_at", todayEnd)
    .order("created_at", { ascending: false }).limit(30);
  if (createdTasks?.length) {
    counts.tasks_created = createdTasks.length;
    text += "TASKS CREATED TODAY:\n" + createdTasks.map((t: any) => `- [${t.priority}/${t.status}] ${t.title}`).join("\n") + "\n\n";
  }

  // 3. Overdue tasks still open
  const { data: overdueTasks } = await supabase.from("tasks")
    .select("title, priority, due_date, project_id")
    .eq("user_id", userId).is("deleted_at", null)
    .in("status", ["pending", "in_progress"])
    .lt("due_date", todayDate)
    .order("due_date", { ascending: true }).limit(20);
  if (overdueTasks?.length) {
    counts.tasks_overdue = overdueTasks.length;
    text += "OVERDUE TASKS (still open):\n" + overdueTasks.map((t: any) => `- [${t.priority}] ${t.title} (due:${t.due_date}) proj:${t.project_id?.slice(0,8)||"none"}`).join("\n") + "\n\n";
  }

  // 4. Priority tasks touched today
  const { data: touchedTasks } = await supabase.from("tasks")
    .select("title, priority, status, project_id, updated_at")
    .eq("user_id", userId).is("deleted_at", null)
    .in("priority", ["critical", "high"])
    .gte("updated_at", todayStart).lte("updated_at", todayEnd)
    .order("updated_at", { ascending: false }).limit(20);
  if (touchedTasks?.length) {
    counts.priority_tasks_touched = touchedTasks.length;
    text += "HIGH/CRITICAL TASKS TOUCHED TODAY:\n" + touchedTasks.map((t: any) => `- [${t.priority}/${t.status}] ${t.title}`).join("\n") + "\n\n";
  }

  // 5. Meetings today
  const { data: todayMeetings } = await supabase.from("meetings")
    .select("title, start_time, project_id, agenda, is_completed")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("start_time", todayStart).lte("start_time", todayEnd)
    .order("start_time", { ascending: true }).limit(15);
  if (todayMeetings?.length) {
    counts.meetings = todayMeetings.length;
    const completed = todayMeetings.filter((m: any) => m.is_completed).length;
    text += `MEETINGS TODAY (${completed}/${todayMeetings.length} completed):\n` + todayMeetings.map((m: any) => `- ${m.is_completed ? "✅" : "⬜"} ${m.title} at ${m.start_time?.slice(11,16)} proj:${m.project_id?.slice(0,8)||"none"}${m.agenda ? " agenda:" + m.agenda.slice(0,60) : ""}`).join("\n") + "\n\n";
  }

  // 6. Reminders due today
  const { data: todayReminders } = await supabase.from("reminders")
    .select("title, reminder_time, is_done, description")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("reminder_time", todayStart).lte("reminder_time", todayEnd)
    .order("reminder_time", { ascending: true }).limit(15);
  if (todayReminders?.length) {
    const done = todayReminders.filter((r: any) => r.is_done).length;
    const missed = todayReminders.filter((r: any) => !r.is_done && new Date(r.reminder_time) < new Date()).length;
    counts.reminders_due = todayReminders.length;
    counts.reminders_done = done;
    counts.reminders_missed = missed;
    text += `REMINDERS TODAY (${done} done, ${missed} missed):\n` + todayReminders.map((r: any) => `- ${r.is_done ? "✅" : "⬜"} ${r.title} (${r.reminder_time?.slice(11,16)})`).join("\n") + "\n\n";
  }

  // 7. Daily notes for today
  const { data: todayNotes } = await supabase.from("notes_daily")
    .select("content, updated_at")
    .eq("user_id", userId).is("deleted_at", null)
    .eq("note_date", todayDate).limit(3);
  if (todayNotes?.length) {
    counts.daily_notes = todayNotes.length;
    text += "DAILY NOTES (today):\n" + todayNotes.map((n: any) => (n.content||"").slice(0,300)).join("\n---\n") + "\n\n";
  }

  // 8. Emails from today (important)
  const { data: todayEmails } = await supabase.from("email_messages")
    .select("subject, sender, date, urgency, intent, is_starred, waiting_on, snippet")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("date", todayStart).lte("date", todayEnd)
    .order("date", { ascending: false }).limit(15);
  if (todayEmails?.length) {
    counts.emails = todayEmails.length;
    const urgent = todayEmails.filter((e: any) => e.urgency === "urgent").length;
    const waiting = todayEmails.filter((e: any) => e.waiting_on).length;
    text += `EMAILS TODAY (${todayEmails.length} total, ${urgent} urgent, ${waiting} waiting):\n`;
    for (const e of todayEmails.slice(0, 10)) {
      text += `- "${e.subject}" from ${e.sender}`;
      if (e.urgency) text += ` [${e.urgency}]`;
      if (e.is_starred) text += ` ⭐`;
      if (e.waiting_on) text += ` [waiting]`;
      text += "\n";
    }
    text += "\n";
  }

  // 9. Smart extracts from today
  const { data: todayExtracts } = await supabase.from("email_extracts")
    .select("detected_type, summary, confidence")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("created_at", todayStart).lte("created_at", todayEnd)
    .gte("confidence", 0.5)
    .order("created_at", { ascending: false }).limit(5);
  if (todayExtracts?.length) {
    counts.email_extracts = todayExtracts.length;
    text += "EMAIL EXTRACTS TODAY:\n" + todayExtracts.map((ex: any) => `- [${ex.detected_type}] ${ex.summary.slice(0,120)}`).join("\n") + "\n\n";
  }

  // 10. Finance entries today
  const { data: todayFinance } = await supabase.from("finance_entries")
    .select("type, category, amount, notes")
    .eq("user_id", userId).is("deleted_at", null)
    .eq("entry_date", todayDate)
    .order("created_at", { ascending: false }).limit(15);
  if (todayFinance?.length) {
    counts.finance_entries = todayFinance.length;
    const income = todayFinance.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const expense = todayFinance.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    text += `FINANCE TODAY: Income R${income.toFixed(0)} | Expenses R${expense.toFixed(0)}\n`;
    for (const f of todayFinance) {
      text += `- ${f.type}: R${Number(f.amount).toFixed(0)} (${f.category})${f.notes ? " — " + f.notes.slice(0,50) : ""}\n`;
    }
    text += "\n";
  }

  // 11. Projects touched today (via task/meeting/note activity)
  const projectIdsToday = new Set<string>();
  for (const t of [...(completedTasks||[]), ...(createdTasks||[]), ...(touchedTasks||[])]) {
    if (t.project_id) projectIdsToday.add(t.project_id);
  }
  for (const m of (todayMeetings||[])) {
    if (m.project_id) projectIdsToday.add(m.project_id);
  }
  if (projectIdsToday.size > 0) {
    counts.projects_touched = projectIdsToday.size;
    const { data: touchedProjects } = await supabase.from("projects")
      .select("id, name, status, is_blocked")
      .in("id", [...projectIdsToday]).limit(20);
    if (touchedProjects?.length) {
      text += "PROJECTS TOUCHED TODAY:\n" + touchedProjects.map((p: any) => `- ${p.name} (${p.status}${p.is_blocked ? " BLOCKED" : ""})`).join("\n") + "\n\n";
    }
  }

  // 12. Project notes updated today
  const { data: todayProjectNotes } = await supabase.from("project_notes")
    .select("project_id, content, updated_at")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("updated_at", todayStart).lte("updated_at", todayEnd)
    .order("updated_at", { ascending: false }).limit(5);
  if (todayProjectNotes?.length) {
    counts.project_notes_updated = todayProjectNotes.length;
    text += "PROJECT NOTES UPDATED TODAY:\n" + todayProjectNotes.map((n: any) => `- [proj:${n.project_id?.slice(0,8)}] ${(n.content||"").slice(0,150)}`).join("\n") + "\n\n";
  }

  return { text: text ? redact(text) : "", counts };
}

const DAILY_REVIEW_SYSTEM_SUPPLEMENT = `
DAILY REVIEW MODE ACTIVE:
The user is asking about today specifically. You MUST produce a structured daily review using ONLY the TODAY-FILTERED data provided below.

Structure your response as:
## 📊 Day Summary
A short 2-3 sentence overview of how the day actually went based on evidence.

## ✅ What Was Done Well
Real wins from today — tasks completed, meetings handled, decisions made, progress by project. Be specific.

## 📋 Progress Made
- Tasks completed (list them)
- Meetings handled
- Decisions made / communication handled
- Progress by project

## ⚠️ What Could Be Done Better
- Missed or overdue tasks
- Weak follow-through
- Neglected projects
- Unresolved emails/reminders
- Financial pressure points

## 🔴 Key Risks Carrying Into Tomorrow
- Blockers, overdue items, urgent follow-ups, dependencies

## 🎯 Tomorrow's Focus
- Top 3-5 actions for the next day based on today's evidence

IMPORTANT: Base every point on actual data from today. Do NOT give generic portfolio summaries. If there is little data for today, say so honestly rather than inventing activity.`;



async function buildRetrievalContext(
  supabase: any, userId: string, tags: string[], prompt: string,
): Promise<{ context: string; retrievalMeta: RetrievalMeta; dataSources: string[]; isDailyReview: boolean; dailyReviewCounts: Record<string, number> }> {
  const isDailyReview = detectDailyReviewIntent(prompt);
  const projects = await retrieveProjects(supabase, userId, tags, prompt);
  const projectIds = projects.map((p: any) => p.id);
  const dataSources: string[] = ["projects"];

  const projectSummary = projects.map((p: any) =>
    `[${p.name}] id:${p.id.slice(0,8)} status:${p.status} blocked:${p.is_blocked} desc:${(p.description||"").slice(0,100)}`
  ).join("\n");

  // Run standard retrieval + daily review retrieval in parallel
  const [knowledgeResult, todayResult, ...parts] = await Promise.all([
    retrieveKnowledge(supabase, userId, projects, tags, prompt),
    isDailyReview ? retrieveTodayData(supabase, userId) : Promise.resolve({ text: "", counts: {} }),
    retrieveMemories(supabase, projectIds),
    retrieveScores(supabase, projectIds),
    retrieveTasks(supabase, userId, projectIds, tags),
    retrieveMeetings(supabase, userId),
    retrievePlanningNotes(supabase, userId),
    retrieveProjectNotes(supabase, userId, projectIds),
    retrieveProjectLinks(supabase, userId, projectIds),
    retrieveScoreHistory(supabase, projectIds),
    retrieveEmails(supabase, userId),
    retrieveFinance(supabase, userId),
    retrieveReminders(supabase, userId),
  ]);

  // Track which data sources had content
  const partLabels = ["memories", "scores", "tasks", "meetings", "planning_notes", "project_notes", "project_links", "score_history", "emails", "finance", "reminders"];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) dataSources.push(partLabels[i]);
  }
  if (isDailyReview && todayResult.text) dataSources.push("daily_review");

  const scopedProjects = projectSummary || "No explicitly matched active projects in scope.";
  const contextParts = [knowledgeResult.text, ...parts].filter(Boolean);

  // For daily review, prepend today data prominently
  let context = "";
  if (isDailyReview && todayResult.text) {
    context = "═══ TODAY'S ACTIVITY DATA ═══\n\n" + todayResult.text + "\n═══ END TODAY'S DATA ═══\n\n";
  }
  context += "ACTIVE PROJECTS:\n" + scopedProjects + "\n\n" + contextParts.join("\n\n");
  if (context.length > RETRIEVAL_CAP) context = context.slice(0, RETRIEVAL_CAP) + "\n[CONTEXT_TRIMMED]";

  // Merge data sources
  knowledgeResult.meta.data_sources = [...new Set([...dataSources, ...knowledgeResult.meta.data_sources])];

  return { context: redact(context), retrievalMeta: knowledgeResult.meta, dataSources, isDailyReview, dailyReviewCounts: todayResult.counts };
}

// ─── Legacy snapshot (for structured modes) ──────────────────

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

// ─── Tool definitions for structured modes ──────────────────

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

// ─── System prompt ──────────────────────────────────────

const SYSTEM_PROMPT = `You are the Chief Portfolio Strategist for VantoOS — a persistent AI co-founder and senior partner.

OPERATING RULES:
1. Cross-reference ALL available data sources: projects, tasks, meetings, notes, emails, finances, knowledge docs, reminders, debts, income streams.
2. Spot conflicts, duplicated effort, hidden opportunities, resource strain, and financial pressure across the portfolio.
3. Treat knowledge documents as frameworks and reference material, not absolute truth.
4. Prioritize live project reality (tasks, meetings, scores, finances) over theory when they conflict.
5. Stay portfolio-aware unless the user explicitly narrows scope with tags.
6. Never hallucinate facts. If you lack data, say so.
7. Never expose secrets, unredacted PII, or cross-user data.
8. Format responses in clear markdown. Use headings, bullets, and bold for readability.
9. When relevant, suggest actionable next steps the user can apply as tasks.
10. Be rigorous but concise — executive-grade communication.
11. You DO have direct access to the retrieved VantoOS context included in this request. Never tell the user that you cannot access the knowledge base, project notes, files, emails, finances, or portfolio data when that context is present. If something is missing, unreadable, or not indexed yet, explain that exact limitation instead.
12. CROSS-MODULE REASONING: When asked about a project, combine evidence from tasks, meetings, finances, emails, knowledge docs, and notes. When asked about finances, relate them to active projects. When asked about emails, connect them to relevant projects and tasks. Always cite which data source your conclusions come from.`;

// ─── Main handler ───────────────────────────────────────

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

    // ─── Chat mode with retrieval + SSE ─────────────────────
    if (mode === "chat") {
      const tags: string[] = context_tags || [];
      const userPrompt = prompt || "Hello";
      const { context, retrievalMeta, dataSources } = await buildRetrievalContext(supabase, user.id, tags, userPrompt);
      const retrievalNotes = [
        retrievalMeta.docs_used.length > 0
          ? `Knowledge sources used: ${retrievalMeta.docs_used.map((d) => d.title).join(", ")}`
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
        dataSources.length > 0
          ? `Live data modules accessed: ${dataSources.join(", ")}`
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
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, stream: true }),
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
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
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

    // ─── Legacy structured modes ────────────────────────────
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
