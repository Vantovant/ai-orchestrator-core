import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runTool } from "../run";

// Ported from mcp-server/src/index.js (same names, descriptions, schemas).
export default [
  defineTool({
    name: "list_budget_items",
    title: "List Budget Items",
    description: "List recurring bills/subscriptions. Filter by status. Read-only.",
    inputSchema: { status: z.string().optional().describe("e.g. 'active', 'paused', 'cancelled'") },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_budget_items", args, ctx),
  }),
  defineTool({
    name: "create_budget_item",
    title: "Create Budget Item",
    description: "Add a new recurring bill/subscription.",
    inputSchema: {
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
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("create_budget_item", args, ctx),
  }),
  defineTool({
    name: "update_budget_item",
    title: "Update Budget Item",
    description: "Edit a recurring bill/subscription. Use list_budget_items first to find the id. Only the " +
      "fields you provide are changed.",
    inputSchema: {
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
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("update_budget_item", args, ctx),
  }),
  defineTool({
    name: "delete_budget_item",
    title: "Delete Budget Item",
    description: "Delete a recurring bill/subscription. Soft delete. Use list_budget_items first to find the id.",
    inputSchema: { id: z.string().describe("finance_budget_items.id — required") },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (args, ctx) => runTool("delete_budget_item", args, ctx),
  }),
  defineTool({
    name: "list_upcoming_budget_events",
    title: "List Upcoming Budget Events",
    description: "List individual bill instances (due dates) in a date range. Defaults to today onward if " +
      "from is omitted. Read-only.",
    inputSchema: {
      from: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      to: z.string().optional().describe("YYYY-MM-DD"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_upcoming_budget_events", args, ctx),
  }),
  defineTool({
    name: "mark_budget_event_paid",
    title: "Mark Budget Event Paid",
    description: "Mark a bill instance as paid. Use list_upcoming_budget_events first to find the event id.",
    inputSchema: { id: z.string().describe("finance_budget_events.id — required") },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("mark_budget_event_paid", args, ctx),
  }),
  defineTool({
    name: "update_budget_event_status",
    title: "Update Budget Event Status",
    description: "Change a bill instance's status directly (e.g. back to 'upcoming', or to 'skipped'). Use " +
      "list_upcoming_budget_events first to find the event id.",
    inputSchema: {
      id: z.string().describe("finance_budget_events.id — required"),
      status: z.string().describe("Required"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("update_budget_event_status", args, ctx),
  }),
  defineTool({
    name: "get_trip_budget_status",
    title: "Get Trip Budget Status",
    description: "Get one trip plus all its expenses, total spent, and (if budgeted_amount was set) how much " +
      "budget remains. Read-only.",
    inputSchema: { trip_id: z.string().describe("trips.id — required") },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("get_trip_budget_status", args, ctx),
  }),
];
