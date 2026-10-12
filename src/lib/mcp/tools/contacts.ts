import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runTool } from "../run";

// Ported from mcp-server/src/index.js (same names, descriptions, schemas).
export default [
  defineTool({
    name: "list_contacts",
    title: "List Contacts",
    description: "Filter VantoOS hub contacts by contact_type, lead_type, temperature, tag, or free-text search " +
      "(matches name/email/phone). Returns up to 100 results. Read-only.",
    inputSchema: {
      search: z.string().optional().describe("Free-text search across name, email, phone"),
      contact_type: z.enum(["mlm", "email_marketing", "personal", "mixed"]).optional(),
      lead_type: z.string().optional(),
      temperature: z.string().optional(),
      tag: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_contacts", args, ctx),
  }),
  defineTool({
    name: "get_contact",
    title: "Get Contact",
    description: "Full detail for one VantoOS hub contact, by id, phone, or email. Read-only.",
    inputSchema: {
      id: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("get_contact", args, ctx),
  }),
  defineTool({
    name: "update_contact",
    title: "Update Contact",
    description: "Edit a VantoOS hub contact's name, email, lead_type, temperature, tags, or consent flags. " +
      "Only the fields you provide are changed — everything else is left untouched.",
    inputSchema: {
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
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("update_contact", args, ctx),
  }),
  defineTool({
    name: "add_contact_note",
    title: "Add Contact Note",
    description: "Append a timestamped note to a VantoOS hub contact. Strictly additive — never overwrites " +
      "existing notes.",
    inputSchema: {
      id: z.string().describe("hub_contacts.id — required"),
      note: z.string().describe("Note text to append"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("add_contact_note", args, ctx),
  }),
];
