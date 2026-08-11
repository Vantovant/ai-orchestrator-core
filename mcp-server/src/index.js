// VantoOS MCP Server
// Exposes hub_contacts tools, Projects/Tasks/Reminders/Meetings/Project
// Notes/Voice Diary write tools, PLUS (as of this update) list_tasks,
// list_reminders, and list_meetings read tools, to Claude via
// streamable-HTTP MCP transport. Every tool call is forwarded to the
// mcp-bridge Supabase Edge Function, which holds the actual database logic
// and the service-role key.
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
  const server = new McpServer({ name: "vantoos-mcp", version: "1.2.0" });

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
