import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runTool } from "../run";

// Ported from mcp-server/src/index.js (same names, descriptions, schemas).
export default [
  defineTool({
    name: "list_shopping_items",
    title: "List Shopping Items",
    description: "List shopping list items. Filter by category, spend_type, and/or done status. Read-only.",
    inputSchema: {
      category: z.string().optional(),
      spend_type: z.enum(["personal", "business", "mixed"]).optional(),
      is_done: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_shopping_items", args, ctx),
  }),
  defineTool({
    name: "add_shopping_item",
    title: "Add Shopping Item",
    description: "Add a shopping list item. Capture need_vs_want and a short justification up front — that's " +
      "the buy-decision framework applied at entry, not left for later.",
    inputSchema: {
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
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("add_shopping_item", args, ctx),
  }),
  defineTool({
    name: "update_shopping_item",
    title: "Update Shopping Item",
    description: "Edit a shopping list item. Use list_shopping_items first to find the item id. Only the " +
      "fields you provide are changed.",
    inputSchema: {
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
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("update_shopping_item", args, ctx),
  }),
  defineTool({
    name: "complete_shopping_item",
    title: "Complete Shopping Item",
    description: "Mark a shopping item bought. Pass actual_cost if it differs from the original estimate. Set " +
      "log_to_finance:true to also create the matching Finance expense (category = the item's " +
      "category, business/personal split from the item's spend_type) — needs either actual_cost " +
      "here or an existing unit_cost_estimate on the item to have an amount to log.",
    inputSchema: {
      id: z.string().describe("shopping_items.id — required"),
      actual_cost: z.number().optional(),
      log_to_finance: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("complete_shopping_item", args, ctx),
  }),
  defineTool({
    name: "delete_shopping_item",
    title: "Delete Shopping Item",
    description: "Delete a shopping list item. Soft delete. Use list_shopping_items first to find the item id.",
    inputSchema: { id: z.string().describe("shopping_items.id — required") },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (args, ctx) => runTool("delete_shopping_item", args, ctx),
  }),
];
