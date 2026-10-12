import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runTool } from "../run";

// Ported from mcp-server/src/index.js (same names, descriptions, schemas).
export default [
  defineTool({
    name: "create_reminder",
    title: "Create Reminder",
    description: "Create a new VantoOS reminder, optionally attached to a project via project_id.",
    inputSchema: {
      title: z.string().describe("Reminder title — required"),
      reminder_time: z.string().describe("ISO 8601 date/time — required"),
      project_id: z.string().optional(),
      description: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("create_reminder", args, ctx),
  }),
  defineTool({
    name: "list_reminders",
    title: "List Reminders",
    description: "List your VantoOS reminders — powers 'what's on my plate today' style questions (Dashboard / " +
      "Plan Hub 'Reminders' tab). Filter by project_id, is_done, and/or a single calendar day via " +
      "date (YYYY-MM-DD, matches reminder_time). Read-only.",
    inputSchema: {
      project_id: z.string().optional(),
      is_done: z.boolean().optional(),
      date: z.string().optional().describe("YYYY-MM-DD — filters to reminders on this day"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_reminders", args, ctx),
  }),
  defineTool({
    name: "complete_reminder",
    title: "Complete Reminder",
    description: "Mark a VantoOS reminder as done (sets is_done to true). Use list_reminders first to find the " +
      "reminder id.",
    inputSchema: {
      id: z.string().describe("reminders.id — required"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("complete_reminder", args, ctx),
  }),
  defineTool({
    name: "delete_reminder",
    title: "Delete Reminder",
    description: "Permanently delete a VantoOS reminder. This is a hard delete — there is no undo. Use " +
      "list_reminders first to find the reminder id.",
    inputSchema: {
      id: z.string().describe("reminders.id — required"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (args, ctx) => runTool("delete_reminder", args, ctx),
  }),
];
