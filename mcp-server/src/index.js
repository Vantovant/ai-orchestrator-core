// VantoOS MCP Server
// Exposes hub_contacts tools, Projects/Tasks/Reminders/Meetings/Project
// Notes/Voice Diary tools to Claude via streamable-HTTP MCP transport.
// Every tool call is forwarded to the mcp-bridge Supabase Edge Function,
// which holds the actual database logic and the service-role key.
//
// THIS UPDATE adds six tools so tasks/reminders/meetings can be ticked off
// and cleaned up, not just created and listed:
//   complete_task, delete_task, complete_reminder, delete_reminder,
//   complete_meeting, delete_meeting
// Same forwarding pattern as every other tool below — no new env vars.
//
// BUDGET MCP UPGRADE (2026-09, v1.4.0): adds 41 tools — full CRUD across
// Finance (entries/debts/income streams/opportunities/budget items &
// events), Shopping, and Travel (trips + trip expenses), plus a new
// shared Trusted Sources list. Same forwarding pattern as every tool
// below — every one of these just calls callBridge(action, args) and
// wraps the result; all the actual logic (including the finance_entries
// mirroring on shopping/trip spend) lives in mcp-bridge. No new env vars.
//
// WELLNESS MCP UPGRADE (2026-09, v1.5.0): adds 20 tools — full CRUD
// across Vitals, Exercise, Doctor's Reports, Health Profile, Journal,
// and Goals (the Wellness & Health module). Same forwarding pattern as
// every tool below. add_wellness_document is metadata-only — attaching
// the actual file still requires the web UI's storage upload flow, not
// this bridge. No new env vars.
//
// Required env vars (set these on Railway — unchanged by this update):
//   MCP_BRIDGE_URL   - e.g. https://<project-ref>.supabase.co/functions/v1/mcp-bridge
//   MCP_BRIDGE_TOKEN - same value as MCP_BRIDGE_TOKEN set on the Supabase function's secrets
//   MCP_SERVER_TOKEN - the API key Claude's connector must present (Authorization: Bearer <token>)
//   PORT             - Railway sets this automatically

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const MCP_BRIDGE_URL = process.env.MCP_BRIDGE_URL;
const MCP_BRIDGE_TOKEN = process.env.MCP_BRIDGE_TOKEN;
const MCP_SERVER_TOKEN = process.env.MCP_SERVER_TOKEN;
const PORT = process.env.PORT || 8080;

if (!MCP_BRIDGE_URL || !MCP_BRIDGE_TOKEN || !MCP_SERVER_TOKEN) {
  console.error(
    "Missing required env vars. Need MCP_BRIDGE_URL, MCP_BRIDGE_TOKEN, MCP_SERVER_TOKEN.",
  );
  process.exit(1);
}

async function callBridge(action, body) {
  const resp = await fetch(MCP_BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mcp-token": MCP_BRIDGE_TOKEN,
    },
    body: JSON.stringify({ action, body }),
  });
  const data = await resp.json().catch(() => ({ ok: false, error: "invalid_bridge_response" }));
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || `bridge_error_${resp.status}`);
  }
  return data;
}

function toolResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function buildServer() {
  const server = new McpServer({ name: "vantoos-mcp", version: "1.5.0" });

  // ---------------------------------------------------------------
  // Contacts (unchanged)
  // ---------------------------------------------------------------
  server.tool(
    "list_contacts",
    "Filter VantoOS hub contacts by contact_type, lead_type, temperature, tag, or free-text search " +
      "(matches name/email/phone). Returns up to 100 results. Read-only.",
    {
      search: z.string().optional().describe("Free-text search across name, email, phone"),
      contact_type: z.enum(["mlm", "email_marketing", "personal", "mixed"]).optional(),
      lead_type: z.string().optional(),
      temperature: z.string().optional(),
      tag: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => toolResult(await callBridge("list_contacts", args)),
  );

  server.tool(
    "get_contact",
    "Full detail for one VantoOS hub contact, by id, phone, or email. Read-only.",
    {
      id: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("get_contact", args)),
  );

  server.tool(
    "update_contact",
    "Edit a VantoOS hub contact's name, email, lead_type, temperature, tags, or consent flags. " +
      "Only the fields you provide are changed — everything else is left untouched.",
    {
      id: z.string().describe("hub_contacts.id — required"),
      full_name: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().optional(),
      lead_type: z.string().optional(),
      temperature: z.string().optional(),
      tags: z.array(z.string()).optional(),
      consent_whatsapp: z.boolean().optional(),
      consent_email: z.boolean().optional(),
      consent_sms: z.boolean().optional(),
      unsubscribed_channels: z.array(z.string()).optional(),
    },
    async (args) => toolResult(await callBridge("update_contact", args)),
  );

  server.tool(
    "add_contact_note",
    "Append a timestamped note to a VantoOS hub contact. Strictly additive — never overwrites " +
      "existing notes.",
    {
      id: z.string().describe("hub_contacts.id — required"),
      note: z.string().describe("Note text to append"),
    },
    async (args) => toolResult(await callBridge("add_contact_note", args)),
  );

  // ---------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------
  server.tool(
    "list_projects",
    "List your VantoOS projects (pinned first, then most recently updated). Use this to resolve " +
      "a project name to its id before attaching a task, reminder, meeting, or note to it. Read-only.",
    {
      status: z.string().optional().describe("Filter by project status, e.g. 'active'"),
      search: z.string().optional().describe("Free-text match on project name"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => toolResult(await callBridge("list_projects", args)),
  );

  // ---------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------
  server.tool(
    "create_task",
    "Create a new VantoOS task, optionally attached to a project via project_id (get one from " +
      "list_projects first). Duplicate titles within the same project scope are merged rather " +
      "than creating a second task.",
    {
      title: z.string().describe("Task title — required"),
      project_id: z.string().optional().describe("Attach this task to a project"),
      priority: z.enum(["critical", "high", "medium", "low"]).optional(),
      description: z.string().optional(),
      due_date: z.string().optional().describe("ISO 8601 date/time"),
    },
    async (args) => toolResult(await callBridge("create_task", args)),
  );

  server.tool(
    "list_tasks",
    "List your VantoOS tasks — powers 'what's on my plate today' style questions (Dashboard / " +
      "Plan Hub 'Tasks' tab). Filter by project_id, status, and/or a single calendar day via " +
      "date (YYYY-MM-DD, matches due_date). Set include_undated to also surface tasks with no " +
      "due date alongside that day's results. Read-only.",
    {
      project_id: z.string().optional(),
      status: z.string().optional().describe("e.g. 'pending', 'done'"),
      date: z.string().optional().describe("YYYY-MM-DD — filters to tasks due on this day"),
      include_undated: z.boolean().optional().describe("Also include tasks with no due_date"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => toolResult(await callBridge("list_tasks", args)),
  );

  server.tool(
    "complete_task",
    "Mark a VantoOS task as done (sets status to 'done'). Use list_tasks first to find the task id.",
    {
      id: z.string().describe("tasks.id — required"),
    },
    async (args) => toolResult(await callBridge("complete_task", args)),
  );

  server.tool(
    "delete_task",
    "Delete a VantoOS task. This is a soft delete (the task is hidden from list_tasks and future " +
      "dedupe checks but not physically removed). Use list_tasks first to find the task id.",
    {
      id: z.string().describe("tasks.id — required"),
    },
    async (args) => toolResult(await callBridge("delete_task", args)),
  );

  // ---------------------------------------------------------------
  // Reminders
  // ---------------------------------------------------------------
  server.tool(
    "create_reminder",
    "Create a new VantoOS reminder, optionally attached to a project via project_id.",
    {
      title: z.string().describe("Reminder title — required"),
      reminder_time: z.string().describe("ISO 8601 date/time — required"),
      project_id: z.string().optional(),
      description: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("create_reminder", args)),
  );

  server.tool(
    "list_reminders",
    "List your VantoOS reminders — powers 'what's on my plate today' style questions (Dashboard / " +
      "Plan Hub 'Reminders' tab). Filter by project_id, is_done, and/or a single calendar day via " +
      "date (YYYY-MM-DD, matches reminder_time). Read-only.",
    {
      project_id: z.string().optional(),
      is_done: z.boolean().optional(),
      date: z.string().optional().describe("YYYY-MM-DD — filters to reminders on this day"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => toolResult(await callBridge("list_reminders", args)),
  );

  server.tool(
    "complete_reminder",
    "Mark a VantoOS reminder as done (sets is_done to true). Use list_reminders first to find the " +
      "reminder id.",
    {
      id: z.string().describe("reminders.id — required"),
    },
    async (args) => toolResult(await callBridge("complete_reminder", args)),
  );

  server.tool(
    "delete_reminder",
    "Permanently delete a VantoOS reminder. This is a hard delete — there is no undo. Use " +
      "list_reminders first to find the reminder id.",
    {
      id: z.string().describe("reminders.id — required"),
    },
    async (args) => toolResult(await callBridge("delete_reminder", args)),
  );

  // ---------------------------------------------------------------
  // Meetings
  // ---------------------------------------------------------------
  server.tool(
    "create_meeting",
    "Create a new VantoOS meeting, optionally attached to a project via project_id.",
    {
      title: z.string().describe("Meeting title — required"),
      start_time: z.string().describe("ISO 8601 date/time — required"),
      end_time: z.string().describe("ISO 8601 date/time — required"),
      project_id: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
      attendees: z.array(z.string()).optional(),
    },
    async (args) => toolResult(await callBridge("create_meeting", args)),
  );

  server.tool(
    "list_meetings",
    "List your VantoOS meetings — powers 'what's on my plate today' style questions (Dashboard / " +
      "Plan Hub 'Meetings' tab). Filter by project_id, is_done, and/or a single calendar day via " +
      "date (YYYY-MM-DD, matches start_time). Read-only.",
    {
      project_id: z.string().optional(),
      is_done: z.boolean().optional(),
      date: z.string().optional().describe("YYYY-MM-DD — filters to meetings on this day"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => toolResult(await callBridge("list_meetings", args)),
  );

  server.tool(
    "complete_meeting",
    "Mark a VantoOS meeting as done (sets is_done to true). Use list_meetings first to find the " +
      "meeting id.",
    {
      id: z.string().describe("meetings.id — required"),
    },
    async (args) => toolResult(await callBridge("complete_meeting", args)),
  );

  server.tool(
    "delete_meeting",
    "Permanently delete a VantoOS meeting. This is a hard delete — there is no undo. Use " +
      "list_meetings first to find the meeting id.",
    {
      id: z.string().describe("meetings.id — required"),
    },
    async (args) => toolResult(await callBridge("delete_meeting", args)),
  );

  // ---------------------------------------------------------------
  // Project Notes (date-keyed, per project)
  // ---------------------------------------------------------------
  server.tool(
    "add_project_note",
    "Add a note to a specific project's daily note (get project_id from list_projects first). " +
      "If a note already exists for that project on that day, this appends to it rather than " +
      "overwriting. Defaults to today if note_date is omitted.",
    {
      project_id: z.string().describe("projects.id — required"),
      content: z.string().describe("Note text — required"),
      note_date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    async (args) => toolResult(await callBridge("add_project_note", args)),
  );

  // ---------------------------------------------------------------
  // Voice Diary (personal log, optionally tagged to projects)
  // ---------------------------------------------------------------
  server.tool(
    "add_diary_entry",
    "Add an entry to your VantoOS Voice Diary. This is a personal log, distinct from project " +
      "notes — optionally tag it to one or more projects via linked_project_ids (get ids from " +
      "list_projects).",
    {
      content: z.string().describe("Entry text — required"),
      title: z.string().optional(),
      mood: z.string().optional(),
      linked_project_ids: z.array(z.string()).optional().describe("Project ids this entry relates to"),
    },
    async (args) => toolResult(await callBridge("add_diary_entry", args)),
  );

  // ---------------------------------------------------------------
  // Finance — full CRUD (previously had zero tools despite being the
  // most built-out page in the app).
  // ---------------------------------------------------------------
  server.tool(
    "get_finance_snapshot",
    "Curated Finance summary: last-30-days income/expense/net, top expense categories, debt " +
      "summary (count + total outstanding), income streams (target vs actual), and upcoming budget " +
      "events. The right first call for a budget review. Read-only.",
    {},
    async () => toolResult(await callBridge("get_finance_snapshot", {})),
  );

  server.tool(
    "list_finance_entries",
    "List Finance ledger entries (income or expense). Filter by type, category, and/or a date " +
      "range via from/to (YYYY-MM-DD, matches entry_date). Read-only.",
    {
      type: z.enum(["income", "expense"]).optional(),
      category: z.string().optional(),
      from: z.string().optional().describe("YYYY-MM-DD"),
      to: z.string().optional().describe("YYYY-MM-DD"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => toolResult(await callBridge("list_finance_entries", args)),
  );

  server.tool(
    "create_finance_entry",
    "Log a new Finance ledger entry (income or expense).",
    {
      type: z.enum(["income", "expense"]).optional().describe("Defaults to 'expense'"),
      category: z.string().optional().describe("Defaults to 'general'"),
      amount: z.number().describe("Required"),
      entry_date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      notes: z.string().optional(),
      source: z.string().optional().describe("Defaults to 'claude-mcp'"),
    },
    async (args) => toolResult(await callBridge("create_finance_entry", args)),
  );

  server.tool(
    "update_finance_entry",
    "Edit a Finance ledger entry. Use list_finance_entries first to find the entry id. Only the " +
      "fields you provide are changed.",
    {
      id: z.string().describe("finance_entries.id — required"),
      type: z.enum(["income", "expense"]).optional(),
      category: z.string().optional(),
      amount: z.number().optional(),
      entry_date: z.string().optional().describe("YYYY-MM-DD"),
      notes: z.string().optional(),
      source: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("update_finance_entry", args)),
  );

  server.tool(
    "delete_finance_entry",
    "Delete a Finance ledger entry. Soft delete — same as the app's own delete button, fully " +
      "recoverable in the database if needed. Use list_finance_entries first to find the entry id.",
    {
      id: z.string().describe("finance_entries.id — required"),
    },
    async (args) => toolResult(await callBridge("delete_finance_entry", args)),
  );

  server.tool(
    "list_debts",
    "List debts. Filter by status (e.g. 'active', 'settled'). Read-only.",
    { status: z.string().optional() },
    async (args) => toolResult(await callBridge("list_debts", args)),
  );

  server.tool(
    "create_debt",
    "Add a new debt.",
    {
      lender_name: z.string().describe("Required"),
      principal: z.number().describe("Outstanding balance — required"),
      interest_rate: z.number().optional().describe("Annual %"),
      repayment_amount: z.number().optional().describe("Monthly"),
      due_day: z.number().int().min(1).max(31).optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("create_debt", args)),
  );

  server.tool(
    "update_debt",
    "Edit a debt — balance, rate, repayment, due day, status, or notes. Use list_debts first to " +
      "find the debt id. Only the fields you provide are changed.",
    {
      id: z.string().describe("debts.id — required"),
      lender_name: z.string().optional(),
      principal: z.number().optional(),
      interest_rate: z.number().optional(),
      repayment_amount: z.number().optional(),
      due_day: z.number().int().min(1).max(31).optional(),
      status: z.string().optional().describe("e.g. 'active', 'settled'"),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("update_debt", args)),
  );

  server.tool(
    "delete_debt",
    "Delete a debt. Soft delete. Use list_debts first to find the debt id.",
    { id: z.string().describe("debts.id — required") },
    async (args) => toolResult(await callBridge("delete_debt", args)),
  );

  server.tool(
    "list_income_streams",
    "List income streams with monthly target vs actual. Read-only.",
    {},
    async () => toolResult(await callBridge("list_income_streams", {})),
  );

  server.tool(
    "create_income_stream",
    "Add a new income stream.",
    {
      label: z.string().describe("User-friendly name — required"),
      stream_type: z.string().optional().describe("e.g. salary, business, network_marketing, side_hustle"),
      monthly_target: z.number().describe("Required"),
      current_month_income: z.number().optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("create_income_stream", args)),
  );

  server.tool(
    "update_income_stream",
    "Edit an income stream. Use list_income_streams first to find the id. Only the fields you " +
      "provide are changed.",
    {
      id: z.string().describe("income_streams.id — required"),
      stream_type: z.string().optional(),
      label: z.string().optional(),
      monthly_target: z.number().optional(),
      current_month_income: z.number().optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("update_income_stream", args)),
  );

  server.tool(
    "delete_income_stream",
    "Delete an income stream. Soft delete. Use list_income_streams first to find the id.",
    { id: z.string().describe("income_streams.id — required") },
    async (args) => toolResult(await callBridge("delete_income_stream", args)),
  );

  server.tool(
    "list_opportunities",
    "List savings/income/funding/compliance opportunities. Filter by status. Read-only.",
    { status: z.string().optional().describe("e.g. 'open', 'in_progress', 'done', 'dismissed'") },
    async (args) => toolResult(await callBridge("list_opportunities", args)),
  );

  server.tool(
    "create_opportunity",
    "Add a new opportunity (a savings idea, income idea, funding lead, or compliance item).",
    {
      title: z.string().describe("Required"),
      type: z.enum(["savings", "income", "funding", "compliance"]).optional(),
      estimated_value: z.number().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("create_opportunity", args)),
  );

  server.tool(
    "update_opportunity",
    "Edit an opportunity. Use list_opportunities first to find the id. Only the fields you " +
      "provide are changed.",
    {
      id: z.string().describe("opportunities.id — required"),
      title: z.string().optional(),
      type: z.enum(["savings", "income", "funding", "compliance"]).optional(),
      estimated_value: z.number().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      status: z.enum(["open", "in_progress", "done", "dismissed"]).optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("update_opportunity", args)),
  );

  server.tool(
    "delete_opportunity",
    "Delete an opportunity. Soft delete. Use list_opportunities first to find the id.",
    { id: z.string().describe("opportunities.id — required") },
    async (args) => toolResult(await callBridge("delete_opportunity", args)),
  );

  server.tool(
    "list_budget_items",
    "List recurring bills/subscriptions. Filter by status. Read-only.",
    { status: z.string().optional().describe("e.g. 'active', 'paused', 'cancelled'") },
    async (args) => toolResult(await callBridge("list_budget_items", args)),
  );

  server.tool(
    "create_budget_item",
    "Add a new recurring bill/subscription.",
    {
      name: z.string().describe("Required"),
      amount: z.number().describe("Required"),
      type: z.string().optional().describe("Defaults to 'subscription'"),
      description: z.string().optional(),
      cadence: z.string().optional().describe("Defaults to 'monthly'"),
      due_day_of_month: z.number().int().min(1).max(31).optional(),
      due_month_of_year: z.number().int().min(1).max(12).optional(),
      due_date_custom: z.string().optional().describe("YYYY-MM-DD"),
      category: z.string().optional(),
      vendor: z.string().optional(),
      autopay: z.boolean().optional(),
    },
    async (args) => toolResult(await callBridge("create_budget_item", args)),
  );

  server.tool(
    "update_budget_item",
    "Edit a recurring bill/subscription. Use list_budget_items first to find the id. Only the " +
      "fields you provide are changed.",
    {
      id: z.string().describe("finance_budget_items.id — required"),
      name: z.string().optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      amount: z.number().optional(),
      cadence: z.string().optional(),
      due_day_of_month: z.number().int().min(1).max(31).optional(),
      due_month_of_year: z.number().int().min(1).max(12).optional(),
      due_date_custom: z.string().optional().describe("YYYY-MM-DD"),
      category: z.string().optional(),
      vendor: z.string().optional(),
      status: z.string().optional(),
      autopay: z.boolean().optional(),
    },
    async (args) => toolResult(await callBridge("update_budget_item", args)),
  );

  server.tool(
    "delete_budget_item",
    "Delete a recurring bill/subscription. Soft delete. Use list_budget_items first to find the id.",
    { id: z.string().describe("finance_budget_items.id — required") },
    async (args) => toolResult(await callBridge("delete_budget_item", args)),
  );

  server.tool(
    "list_upcoming_budget_events",
    "List individual bill instances (due dates) in a date range. Defaults to today onward if " +
      "from is omitted. Read-only.",
    {
      from: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      to: z.string().optional().describe("YYYY-MM-DD"),
    },
    async (args) => toolResult(await callBridge("list_upcoming_budget_events", args)),
  );

  server.tool(
    "mark_budget_event_paid",
    "Mark a bill instance as paid. Use list_upcoming_budget_events first to find the event id.",
    { id: z.string().describe("finance_budget_events.id — required") },
    async (args) => toolResult(await callBridge("mark_budget_event_paid", args)),
  );

  server.tool(
    "update_budget_event_status",
    "Change a bill instance's status directly (e.g. back to 'upcoming', or to 'skipped'). Use " +
      "list_upcoming_budget_events first to find the event id.",
    {
      id: z.string().describe("finance_budget_events.id — required"),
      status: z.string().describe("Required"),
    },
    async (args) => toolResult(await callBridge("update_budget_event_status", args)),
  );

  // ---------------------------------------------------------------
  // Shopping — full CRUD. Every item carries the buy-decision framework
  // (need_vs_want + justification) and a spend_type (personal/business/
  // mixed) up front.
  // ---------------------------------------------------------------
  server.tool(
    "list_shopping_items",
    "List shopping list items. Filter by category, spend_type, and/or done status. Read-only.",
    {
      category: z.string().optional(),
      spend_type: z.enum(["personal", "business", "mixed"]).optional(),
      is_done: z.boolean().optional(),
    },
    async (args) => toolResult(await callBridge("list_shopping_items", args)),
  );

  server.tool(
    "add_shopping_item",
    "Add a shopping list item. Capture need_vs_want and a short justification up front — that's " +
      "the buy-decision framework applied at entry, not left for later.",
    {
      name: z.string().describe("Required"),
      quantity: z.number().int().min(1).optional().describe("Defaults to 1"),
      category: z.enum(["groceries", "household", "personal", "other"]).optional(),
      spend_type: z.enum(["personal", "business", "mixed"]).optional().describe("Defaults to 'personal'"),
      need_vs_want: z.enum(["need", "want"]).optional(),
      justification: z.string().optional().describe("Why it's needed, or how it profits you"),
      unit_cost_estimate: z.number().optional(),
      is_recurring: z.boolean().optional(),
      trusted_source_id: z.string().optional().describe("From list_trusted_sources"),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("add_shopping_item", args)),
  );

  server.tool(
    "update_shopping_item",
    "Edit a shopping list item. Use list_shopping_items first to find the item id. Only the " +
      "fields you provide are changed.",
    {
      id: z.string().describe("shopping_items.id — required"),
      name: z.string().optional(),
      quantity: z.number().int().min(1).optional(),
      category: z.string().optional(),
      spend_type: z.enum(["personal", "business", "mixed"]).optional(),
      need_vs_want: z.enum(["need", "want"]).optional(),
      justification: z.string().optional(),
      unit_cost_estimate: z.number().optional(),
      actual_cost: z.number().optional(),
      is_recurring: z.boolean().optional(),
      trusted_source_id: z.string().optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("update_shopping_item", args)),
  );

  server.tool(
    "complete_shopping_item",
    "Mark a shopping item bought. Pass actual_cost if it differs from the original estimate. Set " +
      "log_to_finance:true to also create the matching Finance expense (category = the item's " +
      "category, business/personal split from the item's spend_type) — needs either actual_cost " +
      "here or an existing unit_cost_estimate on the item to have an amount to log.",
    {
      id: z.string().describe("shopping_items.id — required"),
      actual_cost: z.number().optional(),
      log_to_finance: z.boolean().optional(),
    },
    async (args) => toolResult(await callBridge("complete_shopping_item", args)),
  );

  server.tool(
    "delete_shopping_item",
    "Delete a shopping list item. Soft delete. Use list_shopping_items first to find the item id.",
    { id: z.string().describe("shopping_items.id — required") },
    async (args) => toolResult(await callBridge("delete_shopping_item", args)),
  );

  // ---------------------------------------------------------------
  // Travel — full CRUD. Trips carry the buy-decision framework too;
  // trip expenses always mirror into Finance.
  // ---------------------------------------------------------------
  server.tool(
    "list_trips",
    "List trips. Filter by status and/or spend_type. Read-only.",
    {
      status: z.enum(["upcoming", "in-progress", "completed", "cancelled"]).optional(),
      spend_type: z.enum(["personal", "business", "mixed"]).optional(),
    },
    async (args) => toolResult(await callBridge("list_trips", args)),
  );

  server.tool(
    "create_trip",
    "Add a trip. Capture need_vs_want and a short justification up front (the buy-decision " +
      "framework applied at entry) — especially worth using here since trips tend to be bigger, " +
      "less frequent spends than shopping items.",
    {
      destination: z.string().describe("Required"),
      start_date: z.string().describe("YYYY-MM-DD — required"),
      end_date: z.string().describe("YYYY-MM-DD — required"),
      spend_type: z.enum(["personal", "business", "mixed"]).optional().describe("Defaults to 'personal'"),
      need_vs_want: z.enum(["need", "want"]).optional(),
      justification: z.string().optional().describe("Purpose / expected return on this trip"),
      budgeted_amount: z.number().optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("create_trip", args)),
  );

  server.tool(
    "update_trip",
    "Edit a trip, including its status (upcoming/in-progress/completed/cancelled). Use list_trips " +
      "first to find the trip id. Only the fields you provide are changed.",
    {
      id: z.string().describe("trips.id — required"),
      destination: z.string().optional(),
      start_date: z.string().optional().describe("YYYY-MM-DD"),
      end_date: z.string().optional().describe("YYYY-MM-DD"),
      status: z.enum(["upcoming", "in-progress", "completed", "cancelled"]).optional(),
      spend_type: z.enum(["personal", "business", "mixed"]).optional(),
      need_vs_want: z.enum(["need", "want"]).optional(),
      justification: z.string().optional(),
      budgeted_amount: z.number().optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("update_trip", args)),
  );

  server.tool(
    "delete_trip",
    "Delete a trip. Soft delete. Use list_trips first to find the trip id.",
    { id: z.string().describe("trips.id — required") },
    async (args) => toolResult(await callBridge("delete_trip", args)),
  );

  server.tool(
    "add_trip_expense",
    "Add an expense to a trip (flights, hotel, fuel...). Always also creates the matching Finance " +
      "expense (category 'travel', business/personal split from the trip's spend_type) so trip " +
      "cost never drifts out of sync with Finance. Use list_trips first to get the trip_id.",
    {
      trip_id: z.string().describe("trips.id — required"),
      label: z.string().describe("e.g. 'flights', 'hotel' — required"),
      amount: z.number().describe("Required"),
      expense_date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      trusted_source_id: z.string().optional().describe("From list_trusted_sources"),
    },
    async (args) => toolResult(await callBridge("add_trip_expense", args)),
  );

  server.tool(
    "update_trip_expense",
    "Edit a trip expense. Amount/date/label edits also update the mirrored Finance entry. Use " +
      "get_trip_budget_status first to find the expense id.",
    {
      id: z.string().describe("trip_expenses.id — required"),
      label: z.string().optional(),
      amount: z.number().optional(),
      expense_date: z.string().optional().describe("YYYY-MM-DD"),
      trusted_source_id: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("update_trip_expense", args)),
  );

  server.tool(
    "delete_trip_expense",
    "Delete a trip expense. Soft delete — also soft-deletes the mirrored Finance entry, so the " +
      "two never drift apart. Use get_trip_budget_status first to find the expense id.",
    { id: z.string().describe("trip_expenses.id — required") },
    async (args) => toolResult(await callBridge("delete_trip_expense", args)),
  );

  server.tool(
    "get_trip_budget_status",
    "Get one trip plus all its expenses, total spent, and (if budgeted_amount was set) how much " +
      "budget remains. Read-only.",
    { trip_id: z.string().describe("trips.id — required") },
    async (args) => toolResult(await callBridge("get_trip_budget_status", args)),
  );

  // ---------------------------------------------------------------
  // Trusted Sources — shared vendor/source list referenced by Shopping
  // and Travel.
  // ---------------------------------------------------------------
  server.tool(
    "list_trusted_sources",
    "List trusted vendors/sources (places you trust for good value). Filter by category. Read-only.",
    { category: z.string().optional() },
    async (args) => toolResult(await callBridge("list_trusted_sources", args)),
  );

  server.tool(
    "add_trusted_source",
    "Add a trusted vendor/source.",
    {
      name: z.string().describe("Required"),
      category: z.string().optional().describe("e.g. groceries, electronics, household, business_supplies, travel, general"),
      notes: z.string().optional().describe("Why it's trusted — price, quality, reliability"),
      url: z.string().optional(),
      is_preferred: z.boolean().optional(),
    },
    async (args) => toolResult(await callBridge("add_trusted_source", args)),
  );

  server.tool(
    "update_trusted_source",
    "Edit a trusted vendor/source. Use list_trusted_sources first to find the id. Only the fields " +
      "you provide are changed.",
    {
      id: z.string().describe("trusted_sources.id — required"),
      name: z.string().optional(),
      category: z.string().optional(),
      notes: z.string().optional(),
      url: z.string().optional(),
      is_preferred: z.boolean().optional(),
    },
    async (args) => toolResult(await callBridge("update_trusted_source", args)),
  );

  server.tool(
    "delete_trusted_source",
    "Delete a trusted vendor/source. Soft delete. Use list_trusted_sources first to find the id.",
    { id: z.string().describe("trusted_sources.id — required") },
    async (args) => toolResult(await callBridge("delete_trusted_source", args)),
  );

  // ---------------------------------------------------------------
  // Wellness — Vitals (weight, body composition, blood pressure, HR,
  // steps, sleep, water — one row per day).
  // ---------------------------------------------------------------
  server.tool(
    "list_wellness_metrics",
    "List Wellness vitals entries (weight, body fat %, waist, blood pressure, resting HR, steps, " +
      "sleep hours, water intake). Read-only.",
    { limit: z.number().int().min(1).max(200).optional().describe("Defaults to 90") },
    async (args) => toolResult(await callBridge("list_wellness_metrics", args)),
  );

  server.tool(
    "add_wellness_metric",
    "Log a Wellness vitals entry for a given day. Every field is optional except the date (which " +
      "defaults to today) — log just the ones you have.",
    {
      recorded_on: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      weight_kg: z.number().optional(),
      waist_cm: z.number().optional(),
      body_fat_pct: z.number().optional(),
      systolic_bp: z.number().int().optional(),
      diastolic_bp: z.number().int().optional(),
      resting_hr: z.number().int().optional(),
      steps: z.number().int().optional(),
      sleep_hours: z.number().optional(),
      water_ml: z.number().int().optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("add_wellness_metric", args)),
  );

  server.tool(
    "delete_wellness_metric",
    "Delete a Wellness vitals entry. Soft delete. Use list_wellness_metrics first to find the id.",
    { id: z.string().describe("wellness_metrics.id — required") },
    async (args) => toolResult(await callBridge("delete_wellness_metric", args)),
  );

  // ---------------------------------------------------------------
  // Wellness — Exercise (workout log)
  // ---------------------------------------------------------------
  server.tool(
    "list_wellness_workouts",
    "List logged workouts. Filter by category. Read-only.",
    {
      category: z.enum(["cardio", "strength", "flexibility", "sports", "mind_body", "other"]).optional(),
      limit: z.number().int().min(1).max(200).optional().describe("Defaults to 100"),
    },
    async (args) => toolResult(await callBridge("list_wellness_workouts", args)),
  );

  server.tool(
    "add_wellness_workout",
    "Log a workout — a run, a lift, a yoga class, anything.",
    {
      activity: z.string().describe("e.g. 'Morning run', 'Leg day' — required"),
      workout_date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      category: z.enum(["cardio", "strength", "flexibility", "sports", "mind_body", "other"]).optional(),
      duration_minutes: z.number().int().optional(),
      intensity: z.enum(["low", "moderate", "high"]).optional(),
      distance_km: z.number().optional(),
      calories_burned: z.number().int().optional(),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("add_wellness_workout", args)),
  );

  server.tool(
    "delete_wellness_workout",
    "Delete a logged workout. Soft delete. Use list_wellness_workouts first to find the id.",
    { id: z.string().describe("wellness_workouts.id — required") },
    async (args) => toolResult(await callBridge("delete_wellness_workout", args)),
  );

  // ---------------------------------------------------------------
  // Wellness — Doctor's Reports (metadata only; file attachment stays
  // a web-UI-only action, not available through this bridge)
  // ---------------------------------------------------------------
  server.tool(
    "list_wellness_documents",
    "List doctor's reports (lab results, consultations, imaging, prescriptions). Metadata only — " +
      "does not include any attached file content. Filter by category. Read-only.",
    {
      category: z.enum(["lab_results", "consultation", "imaging", "prescription", "other"]).optional(),
    },
    async (args) => toolResult(await callBridge("list_wellness_documents", args)),
  );

  server.tool(
    "add_wellness_document",
    "Add a doctor's report — metadata only (title, category, doctor, dates, notes). This tool " +
      "cannot attach a file; use the Wellness page in the app to upload the actual PDF/image.",
    {
      title: z.string().describe("e.g. 'Annual bloodwork' — required"),
      category: z.enum(["lab_results", "consultation", "imaging", "prescription", "other"]).optional(),
      doctor_name: z.string().optional(),
      facility: z.string().optional(),
      report_date: z.string().optional().describe("YYYY-MM-DD"),
      follow_up_date: z.string().optional().describe("YYYY-MM-DD"),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("add_wellness_document", args)),
  );

  server.tool(
    "delete_wellness_document",
    "Delete a doctor's report. Soft delete. Use list_wellness_documents first to find the id.",
    { id: z.string().describe("wellness_documents.id — required") },
    async (args) => toolResult(await callBridge("delete_wellness_document", args)),
  );

  // ---------------------------------------------------------------
  // Wellness — Health Profile (standing record: conditions, allergies,
  // medications, immunizations)
  // ---------------------------------------------------------------
  server.tool(
    "list_wellness_conditions",
    "List Health Profile entries — ongoing conditions, allergies, medications, and " +
      "immunizations. Filter by item_type. Read-only.",
    {
      item_type: z.enum(["condition", "allergy", "medication", "immunization"]).optional(),
    },
    async (args) => toolResult(await callBridge("list_wellness_conditions", args)),
  );

  server.tool(
    "add_wellness_condition",
    "Add an entry to the Health Profile — a condition, allergy, medication, or immunization.",
    {
      item_type: z.enum(["condition", "allergy", "medication", "immunization"]).describe("Required"),
      name: z.string().describe("e.g. 'Penicillin', 'Hypertension', 'Metformin 500mg' — required"),
      detail: z.string().optional().describe("Dosage, frequency, or severity"),
      status: z.enum(["active", "ongoing", "resolved"]).optional().describe("Defaults to 'active'"),
      started_on: z.string().optional().describe("YYYY-MM-DD"),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("add_wellness_condition", args)),
  );

  server.tool(
    "update_wellness_condition_status",
    "Change a Health Profile entry's status (e.g. mark a condition resolved). Use " +
      "list_wellness_conditions first to find the id.",
    {
      id: z.string().describe("wellness_conditions.id — required"),
      status: z.enum(["active", "ongoing", "resolved"]).describe("Required"),
    },
    async (args) => toolResult(await callBridge("update_wellness_condition_status", args)),
  );

  server.tool(
    "delete_wellness_condition",
    "Delete a Health Profile entry. Soft delete. Use list_wellness_conditions first to find the id.",
    { id: z.string().describe("wellness_conditions.id — required") },
    async (args) => toolResult(await callBridge("delete_wellness_condition", args)),
  );

  // ---------------------------------------------------------------
  // Wellness — Journal (mood, energy, stress, sleep quality, meditation,
  // gratitude, and a free-text entry)
  // ---------------------------------------------------------------
  server.tool(
    "list_wellness_journal",
    "List Wellness journal entries. Read-only.",
    { limit: z.number().int().min(1).max(200).optional().describe("Defaults to 100") },
    async (args) => toolResult(await callBridge("list_wellness_journal", args)),
  );

  server.tool(
    "add_wellness_journal_entry",
    "Add a Wellness journal entry — how you're feeling, energy, sleep, progress toward goals.",
    {
      notes: z.string().describe("Entry text — required"),
      entry_date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      mood: z.string().optional(),
      energy_level: z.number().int().min(1).max(5).optional(),
      stress_level: z.number().int().min(1).max(5).optional(),
      sleep_quality: z.number().int().min(1).max(5).optional(),
      meditation_minutes: z.number().int().optional(),
      gratitude: z.string().optional(),
      goal_focus: z.enum(["weight_loss", "strength", "mental_health", "general_wellness", "recovery"]).optional(),
    },
    async (args) => toolResult(await callBridge("add_wellness_journal_entry", args)),
  );

  server.tool(
    "delete_wellness_journal_entry",
    "Delete a Wellness journal entry. Soft delete. Use list_wellness_journal first to find the id.",
    { id: z.string().describe("wellness_journal.id — required") },
    async (args) => toolResult(await callBridge("delete_wellness_journal_entry", args)),
  );

  // ---------------------------------------------------------------
  // Wellness — Goals (body / mind / health targets)
  // ---------------------------------------------------------------
  server.tool(
    "list_wellness_goals",
    "List Wellness goals across Body, Mind, and Health domains. Filter by status. Read-only.",
    { status: z.enum(["active", "achieved", "abandoned"]).optional() },
    async (args) => toolResult(await callBridge("list_wellness_goals", args)),
  );

  server.tool(
    "add_wellness_goal",
    "Set a new Wellness goal. If target_metric is 'weight_kg' with both starting_value and " +
      "target_value set, the app computes a live progress bar from logged vitals.",
    {
      title: z.string().describe("e.g. 'Get to 80kg', 'Meditate daily' — required"),
      domain: z.enum(["body", "mind", "health"]).optional().describe("Defaults to 'body'"),
      target_metric: z.string().optional().describe("e.g. 'weight_kg' — only 'weight_kg' drives a progress bar today"),
      target_value: z.number().optional(),
      starting_value: z.number().optional(),
      target_date: z.string().optional().describe("YYYY-MM-DD"),
      notes: z.string().optional(),
    },
    async (args) => toolResult(await callBridge("add_wellness_goal", args)),
  );

  server.tool(
    "update_wellness_goal_status",
    "Mark a Wellness goal achieved or abandoned. Use list_wellness_goals first to find the id.",
    {
      id: z.string().describe("wellness_goals.id — required"),
      status: z.enum(["active", "achieved", "abandoned"]).describe("Required"),
    },
    async (args) => toolResult(await callBridge("update_wellness_goal_status", args)),
  );

  server.tool(
    "delete_wellness_goal",
    "Delete a Wellness goal. Soft delete. Use list_wellness_goals first to find the id.",
    { id: z.string().describe("wellness_goals.id — required") },
    async (args) => toolResult(await callBridge("delete_wellness_goal", args)),
  );

  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  // Claude's custom connector UI currently defaults to an OAuth flow and, as
  // of this writing, doesn't reliably expose a plain Bearer-token/header field
  // for every account (the "Request headers" option is beta-gated). As a
  // fallback, also accept the token as a ?token= query param on the /mcp URL
  // itself, so the connector can authenticate using only the URL field.
  const auth = req.headers["authorization"] || "";
  const queryToken = typeof req.query.token === "string" ? req.query.token : "";
  const authorized =
    auth === `Bearer ${MCP_SERVER_TOKEN}` || queryToken === MCP_SERVER_TOKEN;
  if (!authorized) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP request error:", e);
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "vantoos-mcp" }));

app.listen(PORT, () => {
  console.log(`VantoOS MCP server listening on port ${PORT}`);
});
