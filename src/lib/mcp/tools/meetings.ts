import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runTool } from "../run";

// Ported from mcp-server/src/index.js (same names, descriptions, schemas).
export default [
  defineTool({
    name: "create_meeting",
    title: "Create Meeting",
    description: "Create a new VantoOS meeting, optionally attached to a project via project_id.",
    inputSchema: {
      title: z.string().describe("Meeting title — required"),
      start_time: z.string().describe("ISO 8601 date/time — required"),
      end_time: z.string().describe("ISO 8601 date/time — required"),
      project_id: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
      attendees: z.array(z.string()).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("create_meeting", args, ctx),
  }),
  defineTool({
    name: "list_meetings",
    title: "List Meetings",
    description: "List your VantoOS meetings — powers 'what's on my plate today' style questions (Dashboard / " +
      "Plan Hub 'Meetings' tab). Filter by project_id, is_done, and/or a single calendar day via " +
      "date (YYYY-MM-DD, matches start_time). Read-only.",
    inputSchema: {
      project_id: z.string().optional(),
      is_done: z.boolean().optional(),
      date: z.string().optional().describe("YYYY-MM-DD — filters to meetings on this day"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_meetings", args, ctx),
  }),
  defineTool({
    name: "complete_meeting",
    title: "Complete Meeting",
    description: "Mark a VantoOS meeting as done (sets is_done to true). Use list_meetings first to find the " +
      "meeting id.",
    inputSchema: {
      id: z.string().describe("meetings.id — required"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("complete_meeting", args, ctx),
  }),
  defineTool({
    name: "delete_meeting",
    title: "Delete Meeting",
    description: "Permanently delete a VantoOS meeting. This is a hard delete — there is no undo. Use " +
      "list_meetings first to find the meeting id.",
    inputSchema: {
      id: z.string().describe("meetings.id — required"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (args, ctx) => runTool("delete_meeting", args, ctx),
  }),
];
