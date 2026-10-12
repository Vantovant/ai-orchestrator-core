import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runTool } from "../run";

// Ported from mcp-server/src/index.js (same names, descriptions, schemas).
export default [
  defineTool({
    name: "list_trips",
    title: "List Trips",
    description: "List trips. Filter by status and/or spend_type. Read-only.",
    inputSchema: {
      status: z.enum(["upcoming", "in-progress", "completed", "cancelled"]).optional(),
      spend_type: z.enum(["personal", "business", "mixed"]).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_trips", args, ctx),
  }),
  defineTool({
    name: "create_trip",
    title: "Create Trip",
    description: "Add a trip. Capture need_vs_want and a short justification up front (the buy-decision " +
      "framework applied at entry) — especially worth using here since trips tend to be bigger, " +
      "less frequent spends than shopping items.",
    inputSchema: {
      destination: z.string().describe("Required"),
      start_date: z.string().describe("YYYY-MM-DD — required"),
      end_date: z.string().describe("YYYY-MM-DD — required"),
      spend_type: z.enum(["personal", "business", "mixed"]).optional().describe("Defaults to 'personal'"),
      need_vs_want: z.enum(["need", "want"]).optional(),
      justification: z.string().optional().describe("Purpose / expected return on this trip"),
      budgeted_amount: z.number().optional(),
      notes: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("create_trip", args, ctx),
  }),
  defineTool({
    name: "update_trip",
    title: "Update Trip",
    description: "Edit a trip, including its status (upcoming/in-progress/completed/cancelled). Use list_trips " +
      "first to find the trip id. Only the fields you provide are changed.",
    inputSchema: {
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
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("update_trip", args, ctx),
  }),
  defineTool({
    name: "delete_trip",
    title: "Delete Trip",
    description: "Delete a trip. Soft delete. Use list_trips first to find the trip id.",
    inputSchema: { id: z.string().describe("trips.id — required") },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (args, ctx) => runTool("delete_trip", args, ctx),
  }),
  defineTool({
    name: "add_trip_expense",
    title: "Add Trip Expense",
    description: "Add an expense to a trip (flights, hotel, fuel...). Always also creates the matching Finance " +
      "expense (category 'travel', business/personal split from the trip's spend_type) so trip " +
      "cost never drifts out of sync with Finance. Use list_trips first to get the trip_id.",
    inputSchema: {
      trip_id: z.string().describe("trips.id — required"),
      label: z.string().describe("e.g. 'flights', 'hotel' — required"),
      amount: z.number().describe("Required"),
      expense_date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      trusted_source_id: z.string().optional().describe("From list_trusted_sources"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("add_trip_expense", args, ctx),
  }),
  defineTool({
    name: "update_trip_expense",
    title: "Update Trip Expense",
    description: "Edit a trip expense. Amount/date/label edits also update the mirrored Finance entry. Use " +
      "get_trip_budget_status first to find the expense id.",
    inputSchema: {
      id: z.string().describe("trip_expenses.id — required"),
      label: z.string().optional(),
      amount: z.number().optional(),
      expense_date: z.string().optional().describe("YYYY-MM-DD"),
      trusted_source_id: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("update_trip_expense", args, ctx),
  }),
  defineTool({
    name: "delete_trip_expense",
    title: "Delete Trip Expense",
    description: "Delete a trip expense. Soft delete — also soft-deletes the mirrored Finance entry, so the " +
      "two never drift apart. Use get_trip_budget_status first to find the expense id.",
    inputSchema: { id: z.string().describe("trip_expenses.id — required") },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (args, ctx) => runTool("delete_trip_expense", args, ctx),
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
