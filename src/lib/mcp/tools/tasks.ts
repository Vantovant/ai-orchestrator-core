import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runTool } from "../run";

// Ported from mcp-server/src/index.js (same names, descriptions, schemas).
export default [
  defineTool({
    name: "create_task",
    title: "Create Task",
    description: "Create a new VantoOS task, optionally attached to a project via project_id (get one from " +
      "list_projects first). Duplicate titles within the same project scope are merged rather " +
      "than creating a second task.",
    inputSchema: {
      title: z.string().describe("Task title — required"),
      project_id: z.string().optional().describe("Attach this task to a project"),
      priority: z.enum(["critical", "high", "medium", "low"]).optional(),
      description: z.string().optional(),
      due_date: z.string().optional().describe("ISO 8601 date/time"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("create_task", args, ctx),
  }),
  defineTool({
    name: "list_tasks",
    title: "List Tasks",
    description: "List your VantoOS tasks — powers 'what's on my plate today' style questions (Dashboard / " +
      "Plan Hub 'Tasks' tab). Filter by project_id, status, and/or a single calendar day via " +
      "date (YYYY-MM-DD, matches due_date). Set include_undated to also surface tasks with no " +
      "due date alongside that day's results. Read-only.",
    inputSchema: {
      project_id: z.string().optional(),
      status: z.string().optional().describe("e.g. 'pending', 'done'"),
      date: z.string().optional().describe("YYYY-MM-DD — filters to tasks due on this day"),
      include_undated: z.boolean().optional().describe("Also include tasks with no due_date"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_tasks", args, ctx),
  }),
  defineTool({
    name: "complete_task",
    title: "Complete Task",
    description: "Mark a VantoOS task as done (sets status to 'done'). Use list_tasks first to find the task id.",
    inputSchema: {
      id: z.string().describe("tasks.id — required"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("complete_task", args, ctx),
  }),
  defineTool({
    name: "delete_task",
    title: "Delete Task",
    description: "Delete a VantoOS task. This is a soft delete (the task is hidden from list_tasks and future " +
      "dedupe checks but not physically removed). Use list_tasks first to find the task id.",
    inputSchema: {
      id: z.string().describe("tasks.id — required"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (args, ctx) => runTool("delete_task", args, ctx),
  }),
];
