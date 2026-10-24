import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { runLocationAction } from "../location-core";

// GPS Trip Logger tools. Owner-scoped via the caller's token + RLS.
// Device registration and tokens are app-only; never exposed through chat.
async function run(action: string, args: Record<string, unknown>, ctx: ToolContext) {
  const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });
  if (!ctx.isAuthenticated()) return fail("Not authenticated");
  const userId = ctx.getUserId();
  if (!userId) return fail("Not authenticated");
  const res = await runLocationAction(supabaseForUser(ctx), userId, action, { ...(args ?? {}) });
  if (!res.ok) return fail(String(res.error ?? "error"));
  return { content: [{ type: "text" as const, text: JSON.stringify(res, null, 2) }] };
}

const ro = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const tz = z.string().optional().describe("IANA timezone for *_local fields, default Africa/Johannesburg (+02:00)");

export default [
  defineTool({
    name: "list_location_devices", title: "List Location Devices",
    description: "List GPS devices registered for trip tracking (no tokens). Read-only.",
    inputSchema: {}, annotations: ro,
    handler: (args, ctx) => run("list_location_devices", args, ctx),
  }),
  defineTool({
    name: "get_location_capture_status", title: "Get Location Capture Status",
    description: "Devices, open tracking sessions, last GPS fix and unassigned point count. Read-only.",
    inputSchema: { timezone: tz }, annotations: ro,
    handler: (args, ctx) => run("get_location_capture_status", args, ctx),
  }),
  defineTool({
    name: "get_trip_timeline", title: "Get Trip Timeline",
    description: "Stops and legs for a trip with UTC and local timestamps, dwell, delays, confidence and observed/inferred/unknown markers. Says 'No GPS recorded' when empty. Read-only.",
    inputSchema: { trip_id: z.string().describe("trips.id — required"), timezone: tz }, annotations: ro,
    handler: (args, ctx) => run("get_trip_timeline", args, ctx),
  }),
  defineTool({
    name: "list_trip_stops", title: "List Trip Stops",
    description: "Paginated detected stops for a trip. Read-only.",
    inputSchema: {
      trip_id: z.string().describe("trips.id — required"),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional().describe("next_cursor from a previous call"),
      timezone: tz,
    },
    annotations: ro,
    handler: (args, ctx) => run("list_trip_stops", args, ctx),
  }),
  defineTool({
    name: "get_trip_route", title: "Get Trip Route",
    description: "Observed route as segments split at missing intervals (gaps are never drawn as roads). Read-only.",
    inputSchema: { trip_id: z.string().describe("trips.id — required"), simplify: z.boolean().optional().describe("Default true (~25 m)") },
    annotations: ro,
    handler: (args, ctx) => run("get_trip_route", args, ctx),
  }),
  defineTool({
    name: "compare_leg_to_expected", title: "Compare Leg To Expected",
    description: "Compare one leg's actual time with its expected time, stating the comparison basis honestly. Read-only.",
    inputSchema: { trip_id: z.string(), leg_id: z.string(), timezone: tz }, annotations: ro,
    handler: (args, ctx) => run("compare_leg_to_expected", args, ctx),
  }),
  defineTool({
    name: "link_trip_expense_to_stop", title: "Link Trip Expense To Stop",
    description: "Record that a trip expense happened at a stop. Reference only — never creates or changes finance entries.",
    inputSchema: { trip_expense_id: z.string(), trip_stop_id: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (args, ctx) => run("link_trip_expense_to_stop", args, ctx),
  }),
  defineTool({
    name: "set_trip_stop_label", title: "Set Trip Stop Label",
    description: "Set your own name for a stop. Survives recomputation. Empty label clears it.",
    inputSchema: { stop_id: z.string(), label: z.string().max(200) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: (args, ctx) => run("set_trip_stop_label", args, ctx),
  }),
  defineTool({
    name: "export_trip_location_data", title: "Export Trip Location Data",
    description: "Export a trip's points (up to 5000), stops and legs as JSON. Read-only.",
    inputSchema: { trip_id: z.string() }, annotations: ro,
    handler: (args, ctx) => run("export_trip_location_data", args, ctx),
  }),
  defineTool({
    name: "delete_trip_location_data", title: "Delete Trip Location Data",
    description: "Permanently delete a trip's GPS data. scope: points | derived (stops+legs) | all. Requires confirm=true after the user explicitly agrees. Never touches the trip, expenses or finance.",
    inputSchema: {
      trip_id: z.string(),
      scope: z.enum(["points", "derived", "all"]),
      confirm: z.boolean().describe("Must be true"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    handler: (args, ctx) => run("delete_trip_location_data", args, ctx),
  }),
];
