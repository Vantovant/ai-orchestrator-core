import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runTool } from "../run";

// Ported from mcp-server/src/index.js (same names, descriptions, schemas).
export default [
  defineTool({
    name: "list_projects",
    title: "List Projects",
    description: "List your VantoOS projects (pinned first, then most recently updated). Use this to resolve " +
      "a project name to its id before attaching a task, reminder, meeting, or note to it. Read-only.",
    inputSchema: {
      status: z.string().optional().describe("Filter by project status, e.g. 'active'"),
      search: z.string().optional().describe("Free-text match on project name"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_projects", args, ctx),
  }),
  defineTool({
    name: "add_project_note",
    title: "Add Project Note",
    description: "Add a note to a specific project's daily note (get project_id from list_projects first). " +
      "If a note already exists for that project on that day, this appends to it rather than " +
      "overwriting. Defaults to today if note_date is omitted.",
    inputSchema: {
      project_id: z.string().describe("projects.id — required"),
      content: z.string().describe("Note text — required"),
      note_date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("add_project_note", args, ctx),
  }),
  defineTool({
    name: "add_diary_entry",
    title: "Add Diary Entry",
    description: "Add an entry to your VantoOS Voice Diary. This is a personal log, distinct from project " +
      "notes — optionally tag it to one or more projects via linked_project_ids (get ids from " +
      "list_projects).",
    inputSchema: {
      content: z.string().describe("Entry text — required"),
      title: z.string().optional(),
      mood: z.string().optional(),
      linked_project_ids: z.array(z.string()).optional().describe("Project ids this entry relates to"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("add_diary_entry", args, ctx),
  }),
];
