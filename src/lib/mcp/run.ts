import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";
import { runAction } from "./core";

const ADMIN_ONLY = new Set(["list_contacts", "get_contact", "update_contact", "add_contact_note"]);

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// Shared runner: identity always comes from the verified token. Any
// user_id / p_user_id in input is dropped (schemas don't declare them).
export async function runTool(action: string, args: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAuthenticated()) return fail("Not authenticated");
  const userId = ctx.getUserId();
  if (!userId) return fail("Not authenticated");
  const supabase = supabaseForUser(ctx);
  const body: Record<string, unknown> = { ...(args ?? {}) };
  delete body.user_id;
  delete body.p_user_id;

  if (ADMIN_ONLY.has(action)) {
    const { data: isAdmin, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (error) return fail(error.message);
    if (!isAdmin) return fail("forbidden: contacts are admin-only");
  }

  const res = await runAction(supabase, userId, action, body);
  if (res.status >= 400 || res.body?.ok === false) {
    return fail(String(res.body?.error ?? `error_${res.status}`));
  }
  return { content: [{ type: "text" as const, text: JSON.stringify(res.body, null, 2) }] };
}
