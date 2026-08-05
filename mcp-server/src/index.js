// VantoOS MCP Server
// Exposes hub_contacts tools to Claude via streamable-HTTP MCP transport.
// Every tool call is forwarded to the mcp-bridge Supabase Edge Function,
// which holds the actual database logic and the service-role key.
//
// Required env vars (set these on Railway):
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
  const server = new McpServer({ name: "vantoos-mcp", version: "1.0.0" });

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

  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const auth = req.headers["authorization"] || "";
  if (auth !== `Bearer ${MCP_SERVER_TOKEN}`) {
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
