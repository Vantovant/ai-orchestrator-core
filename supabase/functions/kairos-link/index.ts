// VantoOS — Kairos Link
//
// A narrow, private link so Kairos Executive (Vanto's Christian life-coach
// diary app, a separate Lovable project) can:
//   - read the owner's day: tasks due today, overdue open tasks, top undated
//     open tasks, today's reminders and meetings  (action "day")
//   - send a Kairos action item into VantoOS as a task, filed under the
//     "KAIROS EXECUTIVE" project                     (action "create_task")
//   - check the status of tasks it created          (action "task_status")
//
// Auth: x-kairos-token header, verified exactly like the browser extension
// (extension-tasks / extension-task-create): SHA-256 of the token must match a
// non-revoked, unexpired row in extension_tokens, which also gives the owner's
// user_id. Revoke the link by setting revoked_at on that row.
// Uses the service-role key, scoped to that one user_id on every query —
// the same "resolve a single owner, bypass RLS deliberately and narrowly"
// pattern as extension-task-create and mcp-bridge.
//
// Queries and the create_task dedupe deliberately mirror mcp-bridge
// (status 'pending', same field lists, same title+project merge), so Claude's
// VantoOS connector and Kairos never disagree about what is on the plate.
// Kairos tasks are additionally keyed by external_id = "kairos:<action id>"
// so re-sending the same Kairos action never creates a second task.
//
// "Today" is the South African day (UTC+2, no DST), matching both apps.
//
// supabase/config.toml: [functions.kairos-link] verify_jwt = false

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-kairos-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TASK_FIELDS =
  "id, title, description, status, priority, due_date, start_date, project_id, " +
  "source, last_touched_at, created_at";
const REMINDER_FIELDS =
  "id, title, description, reminder_time, is_done, task_id, project_id, created_at";
const MEETING_FIELDS =
  "id, title, description, start_time, end_time, location, project_id, is_done, created_at";

const OPEN_STATUSES = ["pending", "todo", "in_progress"];
const KAIROS_PROJECT_NAME = "KAIROS EXECUTIVE";
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/** YYYY-MM-DD in South Africa (UTC+2). */
function saToday(): string {
  return new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
}

/** [start, end] of a South African calendar day, as UTC ISO strings. */
function saDayBounds(date: string): [string, string] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+02:00`);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 3600_000 - 1);
  return [start.toISOString(), end.toISOString()];
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function byPriority<T extends { priority?: string | null }>(a: T, b: T) {
  return (PRIORITY_RANK[a.priority ?? "medium"] ?? 2) - (PRIORITY_RANK[b.priority ?? "medium"] ?? 2);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- Auth: same token check as the browser extension, fail-closed ----
  const token = req.headers.get("x-kairos-token") ?? "";
  if (token.length < 32) return json({ ok: false, error: "unauthorized" }, 401);
  const { data: tokenRow } = await supabase
    .from("extension_tokens")
    .select("user_id")
    .eq("token_hash", await sha256Hex(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!tokenRow?.user_id) return json({ ok: false, error: "unauthorized" }, 401);
  const ownerId: string = tokenRow.user_id;

  let parsed: any;
  try {
    parsed = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  const action = parsed?.action as string | undefined;
  const body = parsed?.body ?? {};

  try {
    switch (action) {
      // ---------------------------------------------------------------
      // day — everything the coach needs to train you on today
      // ---------------------------------------------------------------
      case "day": {
        const date = body?.date ? String(body.date) : saToday();
        const bounds = saDayBounds(date);
        if (!bounds) return json({ ok: false, error: "invalid_date_expected_yyyy_mm_dd" }, 400);
        const [start, end] = bounds;

        const [dueToday, overdue, undated, reminders, meetings, projects] = await Promise.all([
          supabase.from("tasks").select(TASK_FIELDS)
            .eq("user_id", ownerId).is("deleted_at", null).in("status", OPEN_STATUSES)
            .gte("due_date", start).lte("due_date", end)
            .order("due_date", { ascending: true }).limit(50),
          supabase.from("tasks").select(TASK_FIELDS)
            .eq("user_id", ownerId).is("deleted_at", null).in("status", OPEN_STATUSES)
            .lt("due_date", start)
            .order("due_date", { ascending: false }).limit(25),
          supabase.from("tasks").select(TASK_FIELDS)
            .eq("user_id", ownerId).is("deleted_at", null).in("status", OPEN_STATUSES)
            .is("due_date", null)
            .order("last_touched_at", { ascending: false, nullsFirst: false }).limit(25),
          supabase.from("reminders").select(REMINDER_FIELDS)
            .eq("user_id", ownerId).gte("reminder_time", start).lte("reminder_time", end)
            .order("reminder_time", { ascending: true }).limit(50),
          supabase.from("meetings").select(MEETING_FIELDS)
            .eq("user_id", ownerId).gte("start_time", start).lte("start_time", end)
            .order("start_time", { ascending: true }).limit(50),
          supabase.from("projects").select("id, name").eq("user_id", ownerId),
        ]);
        const firstError = [dueToday, overdue, undated, reminders, meetings, projects].find((r) => r.error)?.error;
        if (firstError) return json({ ok: false, error: firstError.message }, 500);

        const projectName = Object.fromEntries((projects.data ?? []).map((p: any) => [p.id, p.name]));
        const withProject = (rows: any[] | null) =>
          (rows ?? []).map((t) => ({ ...t, project_name: t.project_id ? projectName[t.project_id] ?? null : null }));

        return json({
          ok: true,
          date,
          timezone: "Africa/Johannesburg",
          tasks_due_today: withProject(dueToday.data).sort(byPriority),
          tasks_overdue: withProject(overdue.data),
          tasks_undated: withProject(undated.data).sort(byPriority).slice(0, 10),
          reminders_today: withProject(reminders.data),
          meetings_today: withProject(meetings.data),
        });
      }

      // ---------------------------------------------------------------
      // create_task — a Kairos action item becomes a VantoOS task
      // ---------------------------------------------------------------
      case "create_task": {
        const title = body?.title ? String(body.title).trim().slice(0, 300) : "";
        if (!title) return json({ ok: false, error: "title_required" }, 400);
        const kairosId = body?.kairos_action_id ? String(body.kairos_action_id) : "";
        if (!/^[0-9a-f-]{36}$/i.test(kairosId)) return json({ ok: false, error: "kairos_action_id_required" }, 400);
        const externalId = `kairos:${kairosId}`;
        const priority = ["critical", "high", "medium", "low"].includes(body?.priority) ? body.priority : "medium";
        const description = typeof body?.description === "string" ? body.description.slice(0, 4000) : null;
        const due_date = typeof body?.due_date === "string" && body.due_date ? body.due_date : null;

        // Already sent? Return the same task.
        const { data: already } = await supabase.from("tasks").select(TASK_FIELDS)
          .eq("user_id", ownerId).eq("external_id", externalId).is("deleted_at", null).maybeSingle();
        if (already) return json({ ok: true, action: "already_sent", task: already });

        const { data: project } = await supabase.from("projects").select("id")
          .eq("user_id", ownerId).ilike("name", KAIROS_PROJECT_NAME).limit(1).maybeSingle();
        const project_id = project?.id ?? null;

        // Same title + project merge as mcp-bridge create_task.
        let dupeQ = supabase.from("tasks").select("id, priority, external_id")
          .eq("user_id", ownerId).is("deleted_at", null).ilike("title", normalizeTitle(title));
        dupeQ = project_id ? dupeQ.eq("project_id", project_id) : dupeQ.is("project_id", null);
        const { data: existing } = await dupeQ.limit(1).maybeSingle();
        if (existing) {
          const { data: merged, error } = await supabase.from("tasks")
            .update({
              last_touched_at: new Date().toISOString(),
              external_id: existing.external_id ?? externalId,
            })
            .eq("id", existing.id).select(TASK_FIELDS).maybeSingle();
          if (error) return json({ ok: false, error: error.message }, 500);
          return json({ ok: true, action: "merged", task: merged });
        }

        const now = new Date().toISOString();
        const { data: inserted, error } = await supabase.from("tasks").insert({
          user_id: ownerId,
          title,
          description,
          priority,
          project_id,
          due_date,
          status: "pending",
          source: "kairos",
          external_id: externalId,
          last_touched_at: now,
        }).select(TASK_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, action: "created", task: inserted });
      }

      // ---------------------------------------------------------------
      // task_status — status of tasks Kairos sent (by VantoOS task id)
      // ---------------------------------------------------------------
      case "task_status": {
        const ids = Array.isArray(body?.ids)
          ? body.ids.map(String).filter((s: string) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 100)
          : [];
        if (!ids.length) return json({ ok: true, tasks: [] });
        const { data, error } = await supabase.from("tasks")
          .select("id, title, status, due_date, completed_at, deleted_at")
          .eq("user_id", ownerId).in("id", ids);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, tasks: data ?? [] });
      }

      default:
        return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
