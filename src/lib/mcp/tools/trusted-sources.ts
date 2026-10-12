import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runTool } from "../run";

// Ported from mcp-server/src/index.js (same names, descriptions, schemas).
export default [
  defineTool({
    name: "list_trusted_sources",
    title: "List Trusted Sources",
    description: "List trusted vendors/sources (places you trust for good value). Filter by category. Read-only.",
    inputSchema: { category: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("list_trusted_sources", args, ctx),
  }),
  defineTool({
    name: "add_trusted_source",
    title: "Add Trusted Source",
    description: "Add a trusted vendor/source.",
    inputSchema: {
      name: z.string().describe("Required"),
      category: z.string().optional().describe("e.g. groceries, electronics, household, business_supplies, travel, general"),
      notes: z.string().optional().describe("Why it's trusted — price, quality, reliability"),
      url: z.string().optional(),
      is_preferred: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("add_trusted_source", args, ctx),
  }),
  defineTool({
    name: "update_trusted_source",
    title: "Update Trusted Source",
    description: "Edit a trusted vendor/source. Use list_trusted_sources first to find the id. Only the fields " +
      "you provide are changed.",
    inputSchema: {
      id: z.string().describe("trusted_sources.id — required"),
      name: z.string().optional(),
      category: z.string().optional(),
      notes: z.string().optional(),
      url: z.string().optional(),
      is_preferred: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: (args, ctx) => runTool("update_trusted_source", args, ctx),
  }),
  defineTool({
    name: "delete_trusted_source",
    title: "Delete Trusted Source",
    description: "Delete a trusted vendor/source. Soft delete. Use list_trusted_sources first to find the id.",
    inputSchema: { id: z.string().describe("trusted_sources.id — required") },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (args, ctx) => runTool("delete_trusted_source", args, ctx),
  }),
];
