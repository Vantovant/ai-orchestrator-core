// VantoOS — MCP Bridge
// Lets Claude (via the standalone mcp-server) read and update hub_contacts,
// projects, tasks, reminders, meetings, project_notes, and
// voice_diary_entries.
//
// Auth: static x-mcp-token header, timing-safe compared against
// MCP_BRIDGE_TOKEN. Uses the service-role key to bypass RLS.
//
// hub_contacts is a suite-wide table with no per-row owner column, so those
// actions need no user resolution. Everything else
// (projects/tasks/reminders/meetings/project_notes/voice_diary_entries) IS
// owned per-row via user_id + RLS in the real app, so every write below is
// stamped with MCP_OWNER_USER_ID — the same "resolve a single owner, bypass
// RLS deliberately and narrowly" pattern already proven in
// extension-task-create/index.ts for the browser extension. This bridge acts
// as you and only you; it does not multiplex across users.
//
// Fail-closed by design:
//   - missing/invalid token -> 401
//   - unknown action -> 400
//   - missing MCP_OWNER_USER_ID for an owner-scoped action -> 500
//   - every write is scoped to explicit, allow-listed fields only
//
// supabase/config.toml must set: [functions.mcp-bridge] verify_jwt = false
// (this function authenticates via x-mcp-token, not a Supabase user JWT).
//
// Required secret (already set from the prior capability build — unchanged
// by this update):
//   MCP_OWNER_USER_ID — your Supabase auth.users.id (a UUID).
//   Find it in Supabase Dashboard -> Authentication -> Users -> copy the UID
//   next to your account. This never needs to change unless you re-platform
//   auth.
//
// THIS UPDATE adds six actions so items can be ticked off and cleaned up,
// not just created and listed:
//   - complete_task / delete_task       (tasks.status has no deleted_at-free
//     schema quirk — tasks DOES have a deleted_at column, reused by the
//     existing create_task dedupe check, so delete_task is a SOFT delete)
//   - complete_reminder / delete_reminder (reminders has no deleted_at
//     column, so delete_reminder is a HARD delete)
//   - complete_meeting / delete_meeting   (meetings has no deleted_at
//     column either, so delete_meeting is a HARD delete)
// All six are owner-scoped (fail closed on missing MCP_OWNER_USER_ID) and
// verify the row belongs to the configured owner before acting, matching
// the existing fail-closed-per-action design used throughout this file.
//
// BUDGET MCP UPGRADE (2026-09): adds full CRUD across Finance, Shopping,
// and Travel, plus a new shared Trusted Sources list. New tables
// (shopping_items, trips, trip_expenses, trusted_sources) were created
// directly against the live Lovable Cloud Postgres with the same RLS
// (auth.uid() = user_id) and updated_at-trigger conventions already used
// by every table below — see trusted_sources/shopping_items/trips/
// trip_expenses in the live schema for the exact DDL. Every one of these
// tables has a deleted_at column, so every new delete_* action is a SOFT
// delete — no riskier than the app's own delete button. shopping_items
// and trips both carry need_vs_want + justification (the buy-decision
// framework itself, captured at entry) and a spend_type (personal/
// business/mixed). complete_shopping_item and add_trip_expense both
// optionally/always mirror into finance_entries via insertFinanceEntry()
// so Shopping/Travel spend never drifts out of sync with Finance.
//
// WELLNESS MCP UPGRADE (2026-09): adds full CRUD across the Wellness &
// Health module — Vitals (wellness_metrics), Exercise (wellness_workouts),
// Doctor's Reports (wellness_documents), Health Profile
// (wellness_conditions), Journal (wellness_journal), and Goals
// (wellness_goals). All six tables already existed (created directly
// against the live Postgres for the Wellness page build) with the same
// RLS (auth.uid() = user_id), deleted_at, and updated_at-trigger
// conventions as everything above, so every delete_* below is a SOFT
// delete. Deliberately excluded: file upload on wellness_documents —
// add_wellness_document only writes metadata (title, category, doctor,
// dates, notes); attaching the actual PDF/image still requires the web
// UI's storage upload flow, which doesn't fit this JSON action/body
// bridge. Same "narrow the first version on purpose" caution as the
// original contacts build.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-mcp-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

// Validates a YYYY-MM-DD string and returns [startOfDayISO, endOfDayISO] in
// UTC. Used by the list_* actions for "today" style date filtering.
function dayBounds(date: string): [string, string] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return [`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`];
}

const CONTACT_FIELDS =
  "id, full_name, first_name, last_name, whatsapp_display_name, phone_e164, email, " +
  "contact_type, lead_type, temperature, tags, consent_whatsapp, consent_email, consent_sms, " +
  "unsubscribed_channels, notes, version, is_deleted, updated_at, source_app";

const PROJECT_FIELDS =
  "id, name, description, status, solution_type, progress_manual, progress_mode, " +
  "tags, is_blocked, is_pinned, health, blocked_reason, updated_at";

const TASK_FIELDS =
  "id, title, description, status, priority, due_date, start_date, project_id, " +
  "source, last_touched_at, created_at";

const REMINDER_FIELDS =
  "id, title, description, reminder_time, is_done, task_id, project_id, created_at";

const MEETING_FIELDS =
  "id, title, description, start_time, end_time, location, attendees, notes, " +
  "project_id, is_done, created_at";

const PROJECT_NOTE_FIELDS = "id, project_id, note_date, content, structured_json, updated_at";

const DIARY_FIELDS =
  "id, content, title, source_type, mood, linked_project_ids, is_pinned, created_at";

// =====================================================================
// Budget MCP upgrade — Finance, Shopping, Travel, Trusted Sources.
// Same owner-scoped, fail-closed, allow-listed-fields pattern as
// everything above. Every table here has a deleted_at column (confirmed
// live against the actual schema before writing this), so every delete
// below is a SOFT delete, matching finance's own UI behavior exactly —
// none of this is riskier than clicking delete in the app itself.
// =====================================================================

const FINANCE_ENTRY_FIELDS =
  "id, type, category, amount, entry_date, notes, source, created_at, updated_at";

const DEBT_FIELDS =
  "id, lender_name, principal, interest_rate, repayment_amount, due_day, status, notes, created_at, updated_at";

const INCOME_STREAM_FIELDS =
  "id, stream_type, label, monthly_target, current_month_income, notes, created_at, updated_at";

const OPPORTUNITY_FIELDS =
  "id, title, type, estimated_value, difficulty, notes, status, ai_generated, created_at, updated_at";

const BUDGET_ITEM_FIELDS =
  "id, type, name, description, amount, currency, cadence, due_day_of_month, due_month_of_year, " +
  "due_date_custom, start_date, end_date, autopay, notify_days_before, status, category, vendor, " +
  "created_at, updated_at";

const BUDGET_EVENT_FIELDS =
  "id, budget_item_id, due_at, amount, status, paid_at, notes, created_at, updated_at";

const SHOPPING_ITEM_FIELDS =
  "id, name, quantity, category, spend_type, need_vs_want, justification, unit_cost_estimate, " +
  "actual_cost, is_recurring, is_done, purchased_at, trusted_source_id, finance_entry_id, notes, " +
  "created_at, updated_at";

const TRIP_FIELDS =
  "id, destination, start_date, end_date, status, spend_type, need_vs_want, justification, " +
  "budgeted_amount, notes, created_at, updated_at";

const TRIP_EXPENSE_FIELDS =
  "id, trip_id, label, amount, expense_date, trusted_source_id, finance_entry_id, created_at, updated_at";

const TRUSTED_SOURCE_FIELDS =
  "id, name, category, notes, url, is_preferred, created_at, updated_at";

// =====================================================================
// Wellness MCP upgrade — Vitals, Exercise, Doctor's Reports, Health
// Profile, Journal, Goals. Same owner-scoped, fail-closed, allow-listed-
// fields pattern as everything above. Every table here has a deleted_at
// column, so every delete_* below is a SOFT delete.
// =====================================================================

const WELLNESS_METRIC_FIELDS =
  "id, recorded_on, weight_kg, waist_cm, body_fat_pct, systolic_bp, diastolic_bp, resting_hr, " +
  "steps, sleep_hours, water_ml, notes, created_at, updated_at";

const WELLNESS_WORKOUT_FIELDS =
  "id, workout_date, activity, category, duration_minutes, intensity, distance_km, " +
  "calories_burned, notes, created_at, updated_at";

const WELLNESS_DOCUMENT_FIELDS =
  "id, title, category, doctor_name, facility, report_date, follow_up_date, notes, " +
  "file_path, file_name, mime_type, size_bytes, created_at, updated_at";

const WELLNESS_CONDITION_FIELDS =
  "id, item_type, name, detail, status, started_on, notes, created_at, updated_at";

const WELLNESS_JOURNAL_FIELDS =
  "id, entry_date, mood, energy_level, stress_level, sleep_quality, meditation_minutes, " +
  "gratitude, goal_focus, notes, created_at, updated_at";

const WELLNESS_GOAL_FIELDS =
  "id, title, domain, target_metric, target_value, starting_value, target_date, status, " +
  "notes, created_at, updated_at";

// Shared helper: create a finance_entries row on behalf of the owner and
// return its id. Used by complete_shopping_item and add_trip_expense so
// shopping/trip spend never drifts out of sync with the Finance ledger.
async function insertFinanceEntry(
  supabase: any,
  ownerId: string,
  fields: { category: string; amount: number; entry_date: string; notes?: string | null; source: string },
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("finance_entries")
    .insert({
      user_id: ownerId,
      type: "expense",
      category: fields.category,
      amount: Math.abs(fields.amount),
      entry_date: fields.entry_date,
      notes: fields.notes ?? null,
      source: fields.source,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // ---- Auth: static token, timing-safe compare, fail-closed ----
  const expectedToken = Deno.env.get("MCP_BRIDGE_TOKEN") ?? "";
  const providedToken = req.headers.get("x-mcp-token") ?? "";
  if (!expectedToken) return json({ ok: false, error: "server_misconfigured" }, 500);
  if (!providedToken || !timingSafeEqual(providedToken, expectedToken)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let parsed: any;
  try {
    parsed = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  const action = parsed?.action as string | undefined;
  const body = parsed?.body ?? {};
  if (!action) return json({ ok: false, error: "missing_action" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolved lazily — only the owner-scoped actions below need it, and we
  // want hub_contacts actions to keep working even if this secret is ever
  // unset, matching the original fail-closed-per-action design.
  function requireOwner(): string | null {
    const ownerId = Deno.env.get("MCP_OWNER_USER_ID") ?? "";
    return ownerId || null;
  }

  try {
    switch (action) {
      // =================================================================
      // hub_contacts
      // =================================================================
      case "list_contacts": {
        const search = String(body?.search ?? "").trim();
        const contact_type = body?.contact_type ? String(body.contact_type) : null;
        const lead_type = body?.lead_type ? String(body.lead_type) : null;
        const temperature = body?.temperature ? String(body.temperature) : null;
        const tag = body?.tag ? String(body.tag) : null;
        const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);

        let q = supabase.from("hub_contacts").select(CONTACT_FIELDS)
          .eq("is_deleted", false)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (contact_type) q = q.eq("contact_type", contact_type);
        if (lead_type) q = q.eq("lead_type", lead_type);
        if (temperature) q = q.eq("temperature", temperature);
        if (tag) q = q.contains("tags", [tag]);
        if (search) {
          q = q.or(
            `full_name.ilike.%${search}%,email.ilike.%${search}%,phone_e164.ilike.%${search}%`,
          );
        }

        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, contacts: data ?? [], count: data?.length ?? 0 });
      }

      case "get_contact": {
        const id = body?.id ? String(body.id) : null;
        const phone = body?.phone ? String(body.phone) : null;
        const email = body?.email ? String(body.email).toLowerCase() : null;
        if (!id && !phone && !email) {
          return json({ ok: false, error: "id_phone_or_email_required" }, 400);
        }

        let q = supabase.from("hub_contacts").select(CONTACT_FIELDS).eq("is_deleted", false);
        if (id) q = q.eq("id", id);
        else if (phone) q = q.eq("phone_e164", phone);
        else q = q.eq("email", email);

        const { data: contact, error } = await q.maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!contact) return json({ ok: false, error: "not_found" }, 404);

        return json({ ok: true, contact });
      }

      case "update_contact": {
        const id = body?.id ? String(body.id) : null;
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const patch: Record<string, unknown> = {};
        if (typeof body?.full_name === "string") patch.full_name = body.full_name.trim();
        if (typeof body?.first_name === "string") patch.first_name = body.first_name.trim();
        if (typeof body?.last_name === "string") patch.last_name = body.last_name.trim();
        if (typeof body?.email === "string") patch.email = body.email.trim().toLowerCase();
        if (typeof body?.lead_type === "string") patch.lead_type = body.lead_type;
        if (typeof body?.temperature === "string") patch.temperature = body.temperature;
        if (Array.isArray(body?.tags)) patch.tags = body.tags;
        if (typeof body?.consent_whatsapp === "boolean") patch.consent_whatsapp = body.consent_whatsapp;
        if (typeof body?.consent_email === "boolean") patch.consent_email = body.consent_email;
        if (typeof body?.consent_sms === "boolean") patch.consent_sms = body.consent_sms;
        if (Array.isArray(body?.unsubscribed_channels)) patch.unsubscribed_channels = body.unsubscribed_channels;

        if (Object.keys(patch).length === 0) {
          return json({ ok: false, error: "no_updatable_fields_provided" }, 400);
        }
        patch.updated_at = new Date().toISOString();

        const { data: existing, error: fetchErr } = await supabase
          .from("hub_contacts").select("version").eq("id", id).eq("is_deleted", false).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        patch.version = (existing.version ?? 1) + 1;

        const { data: updated, error } = await supabase
          .from("hub_contacts").update(patch).eq("id", id).select(CONTACT_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, contact: updated });
      }

      case "add_contact_note": {
        const id = body?.id ? String(body.id) : null;
        const note = body?.note ? String(body.note).trim() : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        if (!note) return json({ ok: false, error: "note_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("hub_contacts").select("notes, version").eq("id", id).eq("is_deleted", false).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const stamp = new Date().toISOString();
        const appended = [existing.notes, `[${stamp}] ${note}`].filter(Boolean).join("\n");

        const { data: updated, error } = await supabase
          .from("hub_contacts")
          .update({ notes: appended, version: (existing.version ?? 1) + 1, updated_at: stamp })
          .eq("id", id)
          .select(CONTACT_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, contact: updated });
      }

      // =================================================================
      // Projects (read-only — lets Claude resolve a project_id before
      // attaching a task/note to it)
      // =================================================================
      case "list_projects": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const status = body?.status ? String(body.status) : null;
        const search = String(body?.search ?? "").trim();
        const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);

        let q = supabase.from("projects").select(PROJECT_FIELDS)
          .eq("user_id", ownerId)
          .is("deleted_at", null)
          .order("is_pinned", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (status) q = q.eq("status", status);
        if (search) q = q.ilike("name", `%${search}%`);

        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, projects: data ?? [], count: data?.length ?? 0 });
      }

      // =================================================================
      // Tasks
      // =================================================================
      case "create_task": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const title = body?.title ? String(body.title).trim() : "";
        if (!title) return json({ ok: false, error: "title_required" }, 400);

        const project_id = body?.project_id ? String(body.project_id) : null;
        const priority = ["critical", "high", "medium", "low"].includes(body?.priority)
          ? body.priority
          : "medium";
        const description = typeof body?.description === "string" ? body.description : null;
        const due_date = typeof body?.due_date === "string" ? body.due_date : null;

        // Same dedupe convention as extension-task-create: same title + same
        // project scope merges instead of duplicating.
        const norm = normalizeTitle(title);
        let dupeQ = supabase.from("tasks").select("id, priority")
          .eq("user_id", ownerId)
          .is("deleted_at", null)
          .ilike("title", norm);
        dupeQ = project_id ? dupeQ.eq("project_id", project_id) : dupeQ.is("project_id", null);
        const { data: existing } = await dupeQ.maybeSingle();

        if (existing) {
          const { data: updated, error } = await supabase
            .from("tasks")
            .update({ last_touched_at: new Date().toISOString(), priority: priority ?? existing.priority })
            .eq("id", existing.id)
            .select(TASK_FIELDS)
            .maybeSingle();
          if (error) return json({ ok: false, error: error.message }, 500);
          return json({ ok: true, action: "merged", task: updated });
        }

        const now = new Date().toISOString();
        const { data: inserted, error } = await supabase
          .from("tasks")
          .insert({
            user_id: ownerId,
            title,
            description,
            priority,
            project_id,
            due_date,
            status: "pending",
            source: "claude-mcp",
            last_touched_at: now,
          })
          .select(TASK_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, action: "created", task: inserted });
      }

      // list_tasks — read-only. Powers "what's on my plate" queries
      // (Dashboard / Plan Hub "Tasks" tab). Supports filtering by project,
      // status, and a single calendar day (matches on due_date).
      case "list_tasks": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const project_id = body?.project_id ? String(body.project_id) : null;
        const status = body?.status ? String(body.status) : null;
        const dateStr = body?.date ? String(body.date) : null;
        const include_undated = body?.include_undated === true;
        const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);

        let q = supabase.from("tasks").select(TASK_FIELDS)
          .eq("user_id", ownerId)
          .is("deleted_at", null)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("priority", { ascending: true })
          .limit(limit);

        if (project_id) q = q.eq("project_id", project_id);
        if (status) q = q.eq("status", status);

        if (dateStr) {
          const bounds = dayBounds(dateStr);
          if (!bounds) return json({ ok: false, error: "invalid_date_expected_yyyy_mm_dd" }, 400);
          const [start, end] = bounds;
          q = include_undated
            ? q.or(`and(due_date.gte.${start},due_date.lte.${end}),due_date.is.null`)
            : q.gte("due_date", start).lte("due_date", end);
        }

        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, tasks: data ?? [], count: data?.length ?? 0 });
      }

      // NEW: complete_task — sets status to 'done' and refreshes
      // last_touched_at. Verifies the task belongs to the configured owner
      // before writing.
      case "complete_task": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("tasks").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const { data: updated, error } = await supabase
          .from("tasks")
          .update({ status: "done", last_touched_at: new Date().toISOString() })
          .eq("id", id)
          .select(TASK_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, task: updated });
      }

      // NEW: delete_task — SOFT delete (tasks has a deleted_at column,
      // already relied on by create_task's dedupe/list_tasks filters), so
      // this matches the existing convention rather than a hard DELETE.
      case "delete_task": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("tasks").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const { error } = await supabase
          .from("tasks")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Reminders
      // =================================================================
      case "create_reminder": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const title = body?.title ? String(body.title).trim() : "";
        const reminder_time = body?.reminder_time ? String(body.reminder_time) : "";
        if (!title) return json({ ok: false, error: "title_required" }, 400);
        if (!reminder_time) return json({ ok: false, error: "reminder_time_required" }, 400);

        const project_id = body?.project_id ? String(body.project_id) : null;
        const description = typeof body?.description === "string" ? body.description : null;

        const { data: inserted, error } = await supabase
          .from("reminders")
          .insert({ user_id: ownerId, title, description, reminder_time, project_id })
          .select(REMINDER_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, reminder: inserted });
      }

      // list_reminders — read-only. Supports filtering by project,
      // done/not-done, and a single calendar day (matches on reminder_time).
      case "list_reminders": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const project_id = body?.project_id ? String(body.project_id) : null;
        const dateStr = body?.date ? String(body.date) : null;
        const is_done = typeof body?.is_done === "boolean" ? body.is_done : null;
        const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);

        let q = supabase.from("reminders").select(REMINDER_FIELDS)
          .eq("user_id", ownerId)
          .order("reminder_time", { ascending: true })
          .limit(limit);

        if (project_id) q = q.eq("project_id", project_id);
        if (is_done !== null) q = q.eq("is_done", is_done);
        if (dateStr) {
          const bounds = dayBounds(dateStr);
          if (!bounds) return json({ ok: false, error: "invalid_date_expected_yyyy_mm_dd" }, 400);
          const [start, end] = bounds;
          q = q.gte("reminder_time", start).lte("reminder_time", end);
        }

        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, reminders: data ?? [], count: data?.length ?? 0 });
      }

      // NEW: complete_reminder — sets is_done = true.
      case "complete_reminder": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("reminders").select("id").eq("id", id).eq("user_id", ownerId).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const { data: updated, error } = await supabase
          .from("reminders")
          .update({ is_done: true })
          .eq("id", id)
          .select(REMINDER_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, reminder: updated });
      }

      // NEW: delete_reminder — HARD delete. The reminders table has no
      // deleted_at column (unlike tasks/projects), so there is no soft-
      // delete convention to follow here.
      case "delete_reminder": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("reminders").select("id").eq("id", id).eq("user_id", ownerId).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const { error } = await supabase.from("reminders").delete().eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Meetings
      // =================================================================
      case "create_meeting": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const title = body?.title ? String(body.title).trim() : "";
        const start_time = body?.start_time ? String(body.start_time) : "";
        const end_time = body?.end_time ? String(body.end_time) : "";
        if (!title) return json({ ok: false, error: "title_required" }, 400);
        if (!start_time || !end_time) {
          return json({ ok: false, error: "start_time_and_end_time_required" }, 400);
        }

        const project_id = body?.project_id ? String(body.project_id) : null;
        const description = typeof body?.description === "string" ? body.description : null;
        const location = typeof body?.location === "string" ? body.location : null;
        const notes = typeof body?.notes === "string" ? body.notes : null;
        const attendees = Array.isArray(body?.attendees) ? body.attendees : null;

        const { data: inserted, error } = await supabase
          .from("meetings")
          .insert({
            user_id: ownerId,
            title,
            description,
            start_time,
            end_time,
            location,
            notes,
            attendees,
            project_id,
          })
          .select(MEETING_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, meeting: inserted });
      }

      // list_meetings — read-only. Supports filtering by project,
      // done/not-done, and a single calendar day (matches on start_time).
      case "list_meetings": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const project_id = body?.project_id ? String(body.project_id) : null;
        const dateStr = body?.date ? String(body.date) : null;
        const is_done = typeof body?.is_done === "boolean" ? body.is_done : null;
        const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);

        let q = supabase.from("meetings").select(MEETING_FIELDS)
          .eq("user_id", ownerId)
          .order("start_time", { ascending: true })
          .limit(limit);

        if (project_id) q = q.eq("project_id", project_id);
        if (is_done !== null) q = q.eq("is_done", is_done);
        if (dateStr) {
          const bounds = dayBounds(dateStr);
          if (!bounds) return json({ ok: false, error: "invalid_date_expected_yyyy_mm_dd" }, 400);
          const [start, end] = bounds;
          q = q.gte("start_time", start).lte("start_time", end);
        }

        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, meetings: data ?? [], count: data?.length ?? 0 });
      }

      // NEW: complete_meeting — sets is_done = true.
      case "complete_meeting": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("meetings").select("id").eq("id", id).eq("user_id", ownerId).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const { data: updated, error } = await supabase
          .from("meetings")
          .update({ is_done: true })
          .eq("id", id)
          .select(MEETING_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, meeting: updated });
      }

      // NEW: delete_meeting — HARD delete. The meetings table has no
      // deleted_at column either, so there is no soft-delete convention to
      // follow here.
      case "delete_meeting": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("meetings").select("id").eq("id", id).eq("user_id", ownerId).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const { error } = await supabase.from("meetings").delete().eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Project Notes (date-keyed, one per project per day — upserts
      // same-day rather than creating duplicates, matching
      // projectNotesService.upsert in the app itself)
      // =================================================================
      case "add_project_note": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const project_id = body?.project_id ? String(body.project_id) : "";
        const content = body?.content ? String(body.content) : "";
        if (!project_id) return json({ ok: false, error: "project_id_required" }, 400);
        if (!content.trim()) return json({ ok: false, error: "content_required" }, 400);

        const note_date = body?.note_date ? String(body.note_date) : new Date().toISOString().slice(0, 10);

        const { data: existing, error: fetchErr } = await supabase
          .from("project_notes")
          .select("id, content")
          .eq("project_id", project_id)
          .eq("note_date", note_date)
          .is("deleted_at", null)
          .maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);

        if (existing) {
          // Append rather than clobber same-day content written elsewhere.
          const merged = [existing.content, content].filter(Boolean).join("\n\n");
          const { data: updated, error } = await supabase
            .from("project_notes")
            .update({ content: merged })
            .eq("id", existing.id)
            .select(PROJECT_NOTE_FIELDS)
            .maybeSingle();
          if (error) return json({ ok: false, error: error.message }, 500);
          return json({ ok: true, action: "appended", note: updated });
        }

        const { data: inserted, error } = await supabase
          .from("project_notes")
          .insert({ project_id, user_id: ownerId, note_date, content })
          .select(PROJECT_NOTE_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, action: "created", note: inserted });
      }

      // =================================================================
      // Voice Diary (append-only personal log, optionally tagged to one or
      // more projects via linked_project_ids — distinct from project_notes
      // above)
      // =================================================================
      case "add_diary_entry": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const content = body?.content ? String(body.content) : "";
        if (!content.trim()) return json({ ok: false, error: "content_required" }, 400);

        const title = typeof body?.title === "string" ? body.title : null;
        const mood = typeof body?.mood === "string" ? body.mood : null;
        const linked_project_ids = Array.isArray(body?.linked_project_ids)
          ? body.linked_project_ids.map(String)
          : [];

        const { data: inserted, error } = await supabase
          .from("voice_diary_entries")
          .insert({
            user_id: ownerId,
            content,
            title,
            mood,
            source_type: "claude-mcp",
            linked_project_ids,
          })
          .select(DIARY_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, entry: inserted });
      }

      // =================================================================
      // Finance — full CRUD. finance_entries/debts/income_streams/
      // opportunities/finance_budget_items/finance_budget_events all
      // already have a deleted_at column and a soft-delete convention in
      // the app's own services, so delete_* below mirrors that exactly.
      // =================================================================
      case "get_finance_snapshot": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceStr = since.toISOString().slice(0, 10);

        const { data: entries, error: entriesErr } = await supabase
          .from("finance_entries")
          .select("type, category, amount, entry_date")
          .eq("user_id", ownerId)
          .is("deleted_at", null)
          .gte("entry_date", sinceStr);
        if (entriesErr) return json({ ok: false, error: entriesErr.message }, 500);

        const rows = entries ?? [];
        const income = rows.filter((r: any) => r.type === "income")
          .reduce((s: number, r: any) => s + Math.abs(Number(r.amount)), 0);
        const expense = rows.filter((r: any) => r.type === "expense")
          .reduce((s: number, r: any) => s + Math.abs(Number(r.amount)), 0);
        const categoryTotals: Record<string, number> = {};
        rows.filter((r: any) => r.type === "expense").forEach((r: any) => {
          categoryTotals[r.category] = (categoryTotals[r.category] ?? 0) + Math.abs(Number(r.amount));
        });
        const topExpenseCategories = Object.entries(categoryTotals)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 5)
          .map(([category, total]) => ({ category, total }));

        const { data: debts, error: debtsErr } = await supabase
          .from("debts").select("principal, status")
          .eq("user_id", ownerId).is("deleted_at", null);
        if (debtsErr) return json({ ok: false, error: debtsErr.message }, 500);
        const activeDebts = (debts ?? []).filter((d: any) => d.status === "active");
        const debtSummary = {
          count: activeDebts.length,
          totalOutstanding: activeDebts.reduce((s: number, d: any) => s + Number(d.principal), 0),
        };

        const { data: streams, error: streamsErr } = await supabase
          .from("income_streams").select("stream_type, label, monthly_target, current_month_income")
          .eq("user_id", ownerId).is("deleted_at", null);
        if (streamsErr) return json({ ok: false, error: streamsErr.message }, 500);

        const today = new Date().toISOString().slice(0, 10);
        const { data: upcoming, error: upcomingErr } = await supabase
          .from("finance_budget_events")
          .select("due_at, amount, status, finance_budget_items(name)")
          .eq("user_id", ownerId).is("deleted_at", null)
          .eq("status", "upcoming")
          .gte("due_at", today)
          .order("due_at")
          .limit(10);
        if (upcomingErr) return json({ ok: false, error: upcomingErr.message }, 500);

        return json({
          ok: true,
          generatedAt: new Date().toISOString(),
          last30Days: { income, expense, net: income - expense },
          topExpenseCategories,
          debtSummary,
          incomeStreams: (streams ?? []).map((s: any) => ({
            type: s.stream_type, label: s.label, target: Number(s.monthly_target), actual: Number(s.current_month_income),
          })),
          upcomingBudgetEvents: (upcoming ?? []).map((e: any) => ({
            due_at: e.due_at, amount: Number(e.amount), status: e.status,
            name: (e.finance_budget_items as any)?.name ?? null,
          })),
        });
      }

      case "list_finance_entries": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const type = body?.type ? String(body.type) : null;
        const category = body?.category ? String(body.category) : null;
        const from = body?.from ? String(body.from) : null;
        const to = body?.to ? String(body.to) : null;
        const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);

        let q = supabase.from("finance_entries").select(FINANCE_ENTRY_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null)
          .order("entry_date", { ascending: false }).limit(limit);
        if (type) q = q.eq("type", type);
        if (category) q = q.eq("category", category);
        if (from) q = q.gte("entry_date", from);
        if (to) q = q.lte("entry_date", to);

        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, entries: data ?? [], count: data?.length ?? 0 });
      }

      case "create_finance_entry": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const type = ["income", "expense"].includes(body?.type) ? body.type : "expense";
        const category = body?.category ? String(body.category) : "general";
        const amount = Number(body?.amount ?? NaN);
        if (!Number.isFinite(amount)) return json({ ok: false, error: "amount_required" }, 400);
        const entry_date = body?.entry_date ? String(body.entry_date) : new Date().toISOString().slice(0, 10);
        const notes = typeof body?.notes === "string" ? body.notes : null;
        const source = typeof body?.source === "string" ? body.source : "claude-mcp";

        const { data: inserted, error } = await supabase
          .from("finance_entries")
          .insert({ user_id: ownerId, type, category, amount, entry_date, notes, source })
          .select(FINANCE_ENTRY_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, entry: inserted });
      }

      case "update_finance_entry": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const patch: Record<string, unknown> = {};
        if (["income", "expense"].includes(body?.type)) patch.type = body.type;
        if (typeof body?.category === "string") patch.category = body.category;
        if (body?.amount !== undefined && Number.isFinite(Number(body.amount))) patch.amount = Number(body.amount);
        if (typeof body?.entry_date === "string") patch.entry_date = body.entry_date;
        if (typeof body?.notes === "string") patch.notes = body.notes;
        if (typeof body?.source === "string") patch.source = body.source;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "no_updatable_fields_provided" }, 400);

        const { data: updated, error } = await supabase
          .from("finance_entries").update(patch)
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null)
          .select(FINANCE_ENTRY_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!updated) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, entry: updated });
      }

      case "delete_finance_entry": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);

        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("finance_entries").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const { error } = await supabase.from("finance_entries")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // ---- Debts ----
      case "list_debts": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const status = body?.status ? String(body.status) : null;
        let q = supabase.from("debts").select(DEBT_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null).order("status");
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, debts: data ?? [], count: data?.length ?? 0 });
      }

      case "create_debt": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const lender_name = body?.lender_name ? String(body.lender_name).trim() : "";
        if (!lender_name) return json({ ok: false, error: "lender_name_required" }, 400);
        const principal = Number(body?.principal ?? 0);

        const { data: inserted, error } = await supabase
          .from("debts")
          .insert({
            user_id: ownerId, lender_name, principal,
            interest_rate: body?.interest_rate ?? null,
            repayment_amount: body?.repayment_amount ?? null,
            due_day: body?.due_day ?? null,
            notes: typeof body?.notes === "string" ? body.notes : null,
          })
          .select(DEBT_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, debt: inserted });
      }

      case "update_debt": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const patch: Record<string, unknown> = {};
        if (typeof body?.lender_name === "string") patch.lender_name = body.lender_name;
        if (body?.principal !== undefined) patch.principal = Number(body.principal);
        if (body?.interest_rate !== undefined) patch.interest_rate = body.interest_rate;
        if (body?.repayment_amount !== undefined) patch.repayment_amount = body.repayment_amount;
        if (body?.due_day !== undefined) patch.due_day = body.due_day;
        if (typeof body?.status === "string") patch.status = body.status;
        if (typeof body?.notes === "string") patch.notes = body.notes;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "no_updatable_fields_provided" }, 400);

        const { data: updated, error } = await supabase.from("debts").update(patch)
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null)
          .select(DEBT_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!updated) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, debt: updated });
      }

      case "delete_debt": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("debts").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("debts")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // ---- Income Streams ----
      case "list_income_streams": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const { data, error } = await supabase.from("income_streams").select(INCOME_STREAM_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null).order("created_at", { ascending: false });
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, income_streams: data ?? [], count: data?.length ?? 0 });
      }

      case "create_income_stream": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const label = body?.label ? String(body.label).trim() : "";
        if (!label) return json({ ok: false, error: "label_required" }, 400);
        const stream_type = typeof body?.stream_type === "string" ? body.stream_type : "salary";
        const monthly_target = Number(body?.monthly_target ?? 0);

        const { data: inserted, error } = await supabase
          .from("income_streams")
          .insert({
            user_id: ownerId, stream_type, label, monthly_target,
            current_month_income: Number(body?.current_month_income ?? 0),
            notes: typeof body?.notes === "string" ? body.notes : null,
          })
          .select(INCOME_STREAM_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, income_stream: inserted });
      }

      case "update_income_stream": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const patch: Record<string, unknown> = {};
        if (typeof body?.stream_type === "string") patch.stream_type = body.stream_type;
        if (typeof body?.label === "string") patch.label = body.label;
        if (body?.monthly_target !== undefined) patch.monthly_target = Number(body.monthly_target);
        if (body?.current_month_income !== undefined) patch.current_month_income = Number(body.current_month_income);
        if (typeof body?.notes === "string") patch.notes = body.notes;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "no_updatable_fields_provided" }, 400);

        const { data: updated, error } = await supabase.from("income_streams").update(patch)
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null)
          .select(INCOME_STREAM_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!updated) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, income_stream: updated });
      }

      case "delete_income_stream": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("income_streams").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("income_streams")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // ---- Opportunities ----
      case "list_opportunities": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const status = body?.status ? String(body.status) : null;
        let q = supabase.from("opportunities").select(OPPORTUNITY_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null).order("created_at", { ascending: false });
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, opportunities: data ?? [], count: data?.length ?? 0 });
      }

      case "create_opportunity": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const title = body?.title ? String(body.title).trim() : "";
        if (!title) return json({ ok: false, error: "title_required" }, 400);
        const type = typeof body?.type === "string" ? body.type : "savings";

        const { data: inserted, error } = await supabase
          .from("opportunities")
          .insert({
            user_id: ownerId, title, type,
            estimated_value: body?.estimated_value ?? null,
            difficulty: typeof body?.difficulty === "string" ? body.difficulty : "medium",
            notes: typeof body?.notes === "string" ? body.notes : null,
            ai_generated: false,
          })
          .select(OPPORTUNITY_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, opportunity: inserted });
      }

      case "update_opportunity": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const patch: Record<string, unknown> = {};
        if (typeof body?.title === "string") patch.title = body.title;
        if (typeof body?.type === "string") patch.type = body.type;
        if (body?.estimated_value !== undefined) patch.estimated_value = body.estimated_value;
        if (typeof body?.difficulty === "string") patch.difficulty = body.difficulty;
        if (typeof body?.status === "string") patch.status = body.status;
        if (typeof body?.notes === "string") patch.notes = body.notes;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "no_updatable_fields_provided" }, 400);

        const { data: updated, error } = await supabase.from("opportunities").update(patch)
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null)
          .select(OPPORTUNITY_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!updated) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, opportunity: updated });
      }

      case "delete_opportunity": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("opportunities").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("opportunities")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // ---- Budget Items (recurring bills/subscriptions) ----
      case "list_budget_items": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const status = body?.status ? String(body.status) : null;
        let q = supabase.from("finance_budget_items").select(BUDGET_ITEM_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null).order("name");
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, budget_items: data ?? [], count: data?.length ?? 0 });
      }

      case "create_budget_item": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const name = body?.name ? String(body.name).trim() : "";
        if (!name) return json({ ok: false, error: "name_required" }, 400);
        const amount = Number(body?.amount ?? 0);

        const { data: inserted, error } = await supabase
          .from("finance_budget_items")
          .insert({
            user_id: ownerId, name, amount,
            type: typeof body?.type === "string" ? body.type : "subscription",
            description: typeof body?.description === "string" ? body.description : "",
            cadence: typeof body?.cadence === "string" ? body.cadence : "monthly",
            due_day_of_month: body?.due_day_of_month ?? null,
            due_month_of_year: body?.due_month_of_year ?? null,
            due_date_custom: body?.due_date_custom ?? null,
            category: typeof body?.category === "string" ? body.category : null,
            vendor: typeof body?.vendor === "string" ? body.vendor : null,
            autopay: body?.autopay === true,
          })
          .select(BUDGET_ITEM_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, budget_item: inserted });
      }

      case "update_budget_item": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const patch: Record<string, unknown> = {};
        for (const f of ["name", "description", "type", "cadence", "category", "vendor", "status"]) {
          if (typeof body?.[f] === "string") patch[f] = body[f];
        }
        for (const f of ["amount", "due_day_of_month", "due_month_of_year"]) {
          if (body?.[f] !== undefined) patch[f] = body[f];
        }
        if (typeof body?.due_date_custom === "string") patch.due_date_custom = body.due_date_custom;
        if (typeof body?.autopay === "boolean") patch.autopay = body.autopay;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "no_updatable_fields_provided" }, 400);

        const { data: updated, error } = await supabase.from("finance_budget_items").update(patch)
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null)
          .select(BUDGET_ITEM_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!updated) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, budget_item: updated });
      }

      case "delete_budget_item": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("finance_budget_items").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("finance_budget_items")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // ---- Budget Events (individual bill instances) ----
      case "list_upcoming_budget_events": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const from = body?.from ? String(body.from) : new Date().toISOString().slice(0, 10);
        const to = body?.to ? String(body.to) : null;
        let q = supabase.from("finance_budget_events")
          .select(`${BUDGET_EVENT_FIELDS}, finance_budget_items(name, vendor, category)`)
          .eq("user_id", ownerId).is("deleted_at", null).gte("due_at", from).order("due_at");
        if (to) q = q.lte("due_at", to);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, budget_events: data ?? [], count: data?.length ?? 0 });
      }

      case "mark_budget_event_paid": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("finance_budget_events").select("id").eq("id", id).eq("user_id", ownerId).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { data: updated, error } = await supabase.from("finance_budget_events")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", id).select(BUDGET_EVENT_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, budget_event: updated });
      }

      case "update_budget_event_status": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        const status = body?.status ? String(body.status) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        if (!status) return json({ ok: false, error: "status_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("finance_budget_events").select("id").eq("id", id).eq("user_id", ownerId).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { data: updated, error } = await supabase.from("finance_budget_events")
          .update({ status }).eq("id", id).select(BUDGET_EVENT_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, budget_event: updated });
      }

      // =================================================================
      // Shopping — full CRUD. shopping_items carries the buy-decision
      // framework itself (need_vs_want + justification) and an optional
      // trusted_source_id / finance_entry_id link.
      // =================================================================
      case "list_shopping_items": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const category = body?.category ? String(body.category) : null;
        const spend_type = body?.spend_type ? String(body.spend_type) : null;
        const is_done = typeof body?.is_done === "boolean" ? body.is_done : null;
        let q = supabase.from("shopping_items").select(SHOPPING_ITEM_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null).order("created_at", { ascending: false });
        if (category) q = q.eq("category", category);
        if (spend_type) q = q.eq("spend_type", spend_type);
        if (is_done !== null) q = q.eq("is_done", is_done);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, shopping_items: data ?? [], count: data?.length ?? 0 });
      }

      case "add_shopping_item": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const name = body?.name ? String(body.name).trim() : "";
        if (!name) return json({ ok: false, error: "name_required" }, 400);

        const { data: inserted, error } = await supabase
          .from("shopping_items")
          .insert({
            user_id: ownerId, name,
            quantity: Number(body?.quantity ?? 1),
            category: typeof body?.category === "string" ? body.category : "other",
            spend_type: typeof body?.spend_type === "string" ? body.spend_type : "personal",
            need_vs_want: typeof body?.need_vs_want === "string" ? body.need_vs_want : null,
            justification: typeof body?.justification === "string" ? body.justification : null,
            unit_cost_estimate: body?.unit_cost_estimate ?? null,
            is_recurring: body?.is_recurring === true,
            trusted_source_id: body?.trusted_source_id ?? null,
            notes: typeof body?.notes === "string" ? body.notes : null,
          })
          .select(SHOPPING_ITEM_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, shopping_item: inserted });
      }

      case "update_shopping_item": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const patch: Record<string, unknown> = {};
        for (const f of ["name", "category", "spend_type", "need_vs_want", "justification", "notes"]) {
          if (typeof body?.[f] === "string") patch[f] = body[f];
        }
        if (body?.quantity !== undefined) patch.quantity = Number(body.quantity);
        if (body?.unit_cost_estimate !== undefined) patch.unit_cost_estimate = body.unit_cost_estimate;
        if (body?.actual_cost !== undefined) patch.actual_cost = body.actual_cost;
        if (typeof body?.is_recurring === "boolean") patch.is_recurring = body.is_recurring;
        if (body?.trusted_source_id !== undefined) patch.trusted_source_id = body.trusted_source_id;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "no_updatable_fields_provided" }, 400);

        const { data: updated, error } = await supabase.from("shopping_items").update(patch)
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null)
          .select(SHOPPING_ITEM_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!updated) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, shopping_item: updated });
      }

      // complete_shopping_item — marks bought; when log_to_finance is true
      // (and actual_cost / an existing unit_cost_estimate is available)
      // also writes a finance_entries expense and links it back via
      // finance_entry_id, so shopping spend rolls into Finance totals.
      case "complete_shopping_item": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("shopping_items").select("*")
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const actualCost = body?.actual_cost !== undefined
          ? Number(body.actual_cost)
          : (existing.unit_cost_estimate !== null ? Number(existing.unit_cost_estimate) * Number(existing.quantity) : null);

        const patch: Record<string, unknown> = {
          is_done: true,
          purchased_at: new Date().toISOString(),
        };
        if (actualCost !== null) patch.actual_cost = actualCost;

        if (body?.log_to_finance === true && actualCost !== null) {
          const financeEntry = await insertFinanceEntry(supabase, ownerId, {
            category: existing.category,
            amount: actualCost,
            entry_date: new Date().toISOString().slice(0, 10),
            notes: `Shopping: ${existing.name}`,
            source: existing.spend_type === "business" ? "business" : "other",
          });
          if (financeEntry) patch.finance_entry_id = financeEntry.id;
        }

        const { data: updated, error } = await supabase.from("shopping_items").update(patch)
          .eq("id", id).select(SHOPPING_ITEM_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, shopping_item: updated });
      }

      case "delete_shopping_item": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("shopping_items").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("shopping_items")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Travel — full CRUD. Trips carry the buy-decision framework too;
      // trip_expenses always mirror into finance_entries so trip cost
      // never drifts out of sync with Finance.
      // =================================================================
      case "list_trips": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const status = body?.status ? String(body.status) : null;
        const spend_type = body?.spend_type ? String(body.spend_type) : null;
        let q = supabase.from("trips").select(TRIP_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null).order("start_date");
        if (status) q = q.eq("status", status);
        if (spend_type) q = q.eq("spend_type", spend_type);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, trips: data ?? [], count: data?.length ?? 0 });
      }

      case "create_trip": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const destination = body?.destination ? String(body.destination).trim() : "";
        const start_date = body?.start_date ? String(body.start_date) : "";
        const end_date = body?.end_date ? String(body.end_date) : "";
        if (!destination) return json({ ok: false, error: "destination_required" }, 400);
        if (!start_date || !end_date) return json({ ok: false, error: "start_date_and_end_date_required" }, 400);

        const { data: inserted, error } = await supabase
          .from("trips")
          .insert({
            user_id: ownerId, destination, start_date, end_date,
            spend_type: typeof body?.spend_type === "string" ? body.spend_type : "personal",
            need_vs_want: typeof body?.need_vs_want === "string" ? body.need_vs_want : null,
            justification: typeof body?.justification === "string" ? body.justification : null,
            budgeted_amount: body?.budgeted_amount ?? null,
            notes: typeof body?.notes === "string" ? body.notes : null,
          })
          .select(TRIP_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, trip: inserted });
      }

      case "update_trip": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const patch: Record<string, unknown> = {};
        for (const f of ["destination", "start_date", "end_date", "status", "spend_type", "need_vs_want", "justification", "notes"]) {
          if (typeof body?.[f] === "string") patch[f] = body[f];
        }
        if (body?.budgeted_amount !== undefined) patch.budgeted_amount = body.budgeted_amount;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "no_updatable_fields_provided" }, 400);

        const { data: updated, error } = await supabase.from("trips").update(patch)
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null)
          .select(TRIP_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!updated) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, trip: updated });
      }

      case "delete_trip": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("trips").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("trips")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      case "add_trip_expense": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const trip_id = body?.trip_id ? String(body.trip_id) : "";
        const label = body?.label ? String(body.label).trim() : "";
        const amount = Number(body?.amount ?? NaN);
        if (!trip_id) return json({ ok: false, error: "trip_id_required" }, 400);
        if (!label) return json({ ok: false, error: "label_required" }, 400);
        if (!Number.isFinite(amount)) return json({ ok: false, error: "amount_required" }, 400);

        const { data: trip, error: tripErr } = await supabase
          .from("trips").select("id, destination, spend_type")
          .eq("id", trip_id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (tripErr) return json({ ok: false, error: tripErr.message }, 500);
        if (!trip) return json({ ok: false, error: "trip_not_found" }, 404);

        const expense_date = body?.expense_date ? String(body.expense_date) : new Date().toISOString().slice(0, 10);

        // Always mirror into finance_entries — trip spend never tracked in isolation.
        const financeEntry = await insertFinanceEntry(supabase, ownerId, {
          category: "travel",
          amount,
          entry_date: expense_date,
          notes: `Travel (${trip.destination}): ${label}`,
          source: trip.spend_type === "business" ? "business" : "other",
        });

        const { data: inserted, error } = await supabase
          .from("trip_expenses")
          .insert({
            user_id: ownerId, trip_id, label, amount, expense_date,
            trusted_source_id: body?.trusted_source_id ?? null,
            finance_entry_id: financeEntry?.id ?? null,
          })
          .select(TRIP_EXPENSE_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, trip_expense: inserted });
      }

      case "update_trip_expense": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("trip_expenses").select("id, finance_entry_id")
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const patch: Record<string, unknown> = {};
        if (typeof body?.label === "string") patch.label = body.label;
        if (body?.amount !== undefined) patch.amount = Number(body.amount);
        if (typeof body?.expense_date === "string") patch.expense_date = body.expense_date;
        if (body?.trusted_source_id !== undefined) patch.trusted_source_id = body.trusted_source_id;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "no_updatable_fields_provided" }, 400);

        // Keep the mirrored finance_entries row in sync on amount/date/label edits.
        if (existing.finance_entry_id && (patch.amount !== undefined || patch.expense_date !== undefined || patch.label !== undefined)) {
          const financePatch: Record<string, unknown> = {};
          if (patch.amount !== undefined) financePatch.amount = Math.abs(Number(patch.amount));
          if (patch.expense_date !== undefined) financePatch.entry_date = patch.expense_date;
          await supabase.from("finance_entries").update(financePatch).eq("id", existing.finance_entry_id);
        }

        const { data: updated, error } = await supabase.from("trip_expenses").update(patch)
          .eq("id", id).select(TRIP_EXPENSE_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, trip_expense: updated });
      }

      case "delete_trip_expense": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("trip_expenses").select("id, finance_entry_id")
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        // Keep Finance in sync — removing the trip expense also removes its mirrored entry.
        if (existing.finance_entry_id) {
          await supabase.from("finance_entries")
            .update({ deleted_at: new Date().toISOString() }).eq("id", existing.finance_entry_id);
        }

        const { error } = await supabase.from("trip_expenses")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      case "get_trip_budget_status": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const trip_id = body?.trip_id ? String(body.trip_id) : "";
        if (!trip_id) return json({ ok: false, error: "trip_id_required" }, 400);

        const { data: trip, error: tripErr } = await supabase
          .from("trips").select(TRIP_FIELDS)
          .eq("id", trip_id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (tripErr) return json({ ok: false, error: tripErr.message }, 500);
        if (!trip) return json({ ok: false, error: "not_found" }, 404);

        const { data: expenses, error: expErr } = await supabase
          .from("trip_expenses").select(TRIP_EXPENSE_FIELDS)
          .eq("trip_id", trip_id).eq("user_id", ownerId).is("deleted_at", null).order("expense_date");
        if (expErr) return json({ ok: false, error: expErr.message }, 500);

        const spent = (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);
        return json({
          ok: true,
          trip,
          expenses: expenses ?? [],
          spent,
          budgeted: trip.budgeted_amount !== null ? Number(trip.budgeted_amount) : null,
          remaining: trip.budgeted_amount !== null ? Number(trip.budgeted_amount) - spent : null,
        });
      }

      // =================================================================
      // Trusted Sources — shared vendor/source list referenced by
      // Shopping and Travel.
      // =================================================================
      case "list_trusted_sources": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const category = body?.category ? String(body.category) : null;
        let q = supabase.from("trusted_sources").select(TRUSTED_SOURCE_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null)
          .order("is_preferred", { ascending: false }).order("name");
        if (category) q = q.eq("category", category);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, trusted_sources: data ?? [], count: data?.length ?? 0 });
      }

      case "add_trusted_source": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const name = body?.name ? String(body.name).trim() : "";
        if (!name) return json({ ok: false, error: "name_required" }, 400);

        const { data: inserted, error } = await supabase
          .from("trusted_sources")
          .insert({
            user_id: ownerId, name,
            category: typeof body?.category === "string" ? body.category : "general",
            notes: typeof body?.notes === "string" ? body.notes : null,
            url: typeof body?.url === "string" ? body.url : null,
            is_preferred: body?.is_preferred === true,
          })
          .select(TRUSTED_SOURCE_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, trusted_source: inserted });
      }

      case "update_trusted_source": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        const patch: Record<string, unknown> = {};
        for (const f of ["name", "category", "notes", "url"]) {
          if (typeof body?.[f] === "string") patch[f] = body[f];
        }
        if (typeof body?.is_preferred === "boolean") patch.is_preferred = body.is_preferred;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "no_updatable_fields_provided" }, 400);

        const { data: updated, error } = await supabase.from("trusted_sources").update(patch)
          .eq("id", id).eq("user_id", ownerId).is("deleted_at", null)
          .select(TRUSTED_SOURCE_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!updated) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, trusted_source: updated });
      }

      case "delete_trusted_source": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("trusted_sources").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("trusted_sources")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Wellness — Vitals (wellness_metrics)
      // =================================================================
      case "list_wellness_metrics": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const limit = Math.min(Math.max(Number(body?.limit ?? 90), 1), 200);
        const { data, error } = await supabase.from("wellness_metrics").select(WELLNESS_METRIC_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null)
          .order("recorded_on", { ascending: false }).limit(limit);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, metrics: data ?? [], count: data?.length ?? 0 });
      }

      case "add_wellness_metric": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const recorded_on = body?.recorded_on ? String(body.recorded_on) : new Date().toISOString().slice(0, 10);

        const { data: inserted, error } = await supabase
          .from("wellness_metrics")
          .insert({
            user_id: ownerId, recorded_on,
            weight_kg: body?.weight_kg ?? null,
            waist_cm: body?.waist_cm ?? null,
            body_fat_pct: body?.body_fat_pct ?? null,
            systolic_bp: body?.systolic_bp ?? null,
            diastolic_bp: body?.diastolic_bp ?? null,
            resting_hr: body?.resting_hr ?? null,
            steps: body?.steps ?? null,
            sleep_hours: body?.sleep_hours ?? null,
            water_ml: body?.water_ml ?? null,
            notes: typeof body?.notes === "string" ? body.notes : null,
          })
          .select(WELLNESS_METRIC_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, metric: inserted });
      }

      case "delete_wellness_metric": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("wellness_metrics").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("wellness_metrics")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Wellness — Exercise (wellness_workouts)
      // =================================================================
      case "list_wellness_workouts": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const category = body?.category ? String(body.category) : null;
        const limit = Math.min(Math.max(Number(body?.limit ?? 100), 1), 200);
        let q = supabase.from("wellness_workouts").select(WELLNESS_WORKOUT_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null)
          .order("workout_date", { ascending: false }).limit(limit);
        if (category) q = q.eq("category", category);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, workouts: data ?? [], count: data?.length ?? 0 });
      }

      case "add_wellness_workout": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const activity = body?.activity ? String(body.activity).trim() : "";
        if (!activity) return json({ ok: false, error: "activity_required" }, 400);
        const workout_date = body?.workout_date ? String(body.workout_date) : new Date().toISOString().slice(0, 10);

        const { data: inserted, error } = await supabase
          .from("wellness_workouts")
          .insert({
            user_id: ownerId, activity, workout_date,
            category: typeof body?.category === "string" ? body.category : "other",
            duration_minutes: body?.duration_minutes ?? null,
            intensity: typeof body?.intensity === "string" ? body.intensity : null,
            distance_km: body?.distance_km ?? null,
            calories_burned: body?.calories_burned ?? null,
            notes: typeof body?.notes === "string" ? body.notes : null,
          })
          .select(WELLNESS_WORKOUT_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, workout: inserted });
      }

      case "delete_wellness_workout": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("wellness_workouts").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("wellness_workouts")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Wellness — Doctor's Reports (wellness_documents). Metadata only —
      // file attachment stays a web-UI-only action (see header comment).
      // =================================================================
      case "list_wellness_documents": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const category = body?.category ? String(body.category) : null;
        let q = supabase.from("wellness_documents").select(WELLNESS_DOCUMENT_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null)
          .order("report_date", { ascending: false, nullsFirst: false });
        if (category) q = q.eq("category", category);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, documents: data ?? [], count: data?.length ?? 0 });
      }

      case "add_wellness_document": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const title = body?.title ? String(body.title).trim() : "";
        if (!title) return json({ ok: false, error: "title_required" }, 400);

        const { data: inserted, error } = await supabase
          .from("wellness_documents")
          .insert({
            user_id: ownerId, title,
            category: typeof body?.category === "string" ? body.category : "other",
            doctor_name: typeof body?.doctor_name === "string" ? body.doctor_name : null,
            facility: typeof body?.facility === "string" ? body.facility : null,
            report_date: body?.report_date ?? null,
            follow_up_date: body?.follow_up_date ?? null,
            notes: typeof body?.notes === "string" ? body.notes : null,
          })
          .select(WELLNESS_DOCUMENT_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, document: inserted });
      }

      case "delete_wellness_document": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("wellness_documents").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("wellness_documents")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Wellness — Health Profile (wellness_conditions): conditions,
      // allergies, medications, immunizations.
      // =================================================================
      case "list_wellness_conditions": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const item_type = body?.item_type ? String(body.item_type) : null;
        let q = supabase.from("wellness_conditions").select(WELLNESS_CONDITION_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null)
          .order("item_type").order("name");
        if (item_type) q = q.eq("item_type", item_type);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, conditions: data ?? [], count: data?.length ?? 0 });
      }

      case "add_wellness_condition": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const item_type = body?.item_type ? String(body.item_type) : "";
        const name = body?.name ? String(body.name).trim() : "";
        if (!["condition", "allergy", "medication", "immunization"].includes(item_type)) {
          return json({ ok: false, error: "item_type_required" }, 400);
        }
        if (!name) return json({ ok: false, error: "name_required" }, 400);

        const { data: inserted, error } = await supabase
          .from("wellness_conditions")
          .insert({
            user_id: ownerId, item_type, name,
            detail: typeof body?.detail === "string" ? body.detail : null,
            status: typeof body?.status === "string" ? body.status : "active",
            started_on: body?.started_on ?? null,
            notes: typeof body?.notes === "string" ? body.notes : null,
          })
          .select(WELLNESS_CONDITION_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, condition: inserted });
      }

      case "update_wellness_condition_status": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        const status = body?.status ? String(body.status) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        if (!["active", "ongoing", "resolved"].includes(status)) {
          return json({ ok: false, error: "valid_status_required" }, 400);
        }
        const { data: existing, error: fetchErr } = await supabase
          .from("wellness_conditions").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { data: updated, error } = await supabase.from("wellness_conditions")
          .update({ status }).eq("id", id).select(WELLNESS_CONDITION_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, condition: updated });
      }

      case "delete_wellness_condition": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("wellness_conditions").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("wellness_conditions")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Wellness — Journal (wellness_journal)
      // =================================================================
      case "list_wellness_journal": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const limit = Math.min(Math.max(Number(body?.limit ?? 100), 1), 200);
        const { data, error } = await supabase.from("wellness_journal").select(WELLNESS_JOURNAL_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null)
          .order("entry_date", { ascending: false }).limit(limit);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, entries: data ?? [], count: data?.length ?? 0 });
      }

      case "add_wellness_journal_entry": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const notes = body?.notes ? String(body.notes).trim() : "";
        if (!notes) return json({ ok: false, error: "notes_required" }, 400);
        const entry_date = body?.entry_date ? String(body.entry_date) : new Date().toISOString().slice(0, 10);

        const { data: inserted, error } = await supabase
          .from("wellness_journal")
          .insert({
            user_id: ownerId, notes, entry_date,
            mood: typeof body?.mood === "string" ? body.mood : null,
            energy_level: body?.energy_level ?? null,
            stress_level: body?.stress_level ?? null,
            sleep_quality: body?.sleep_quality ?? null,
            meditation_minutes: body?.meditation_minutes ?? null,
            gratitude: typeof body?.gratitude === "string" ? body.gratitude : null,
            goal_focus: typeof body?.goal_focus === "string" ? body.goal_focus : null,
          })
          .select(WELLNESS_JOURNAL_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, entry: inserted });
      }

      case "delete_wellness_journal_entry": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("wellness_journal").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("wellness_journal")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      // =================================================================
      // Wellness — Goals (wellness_goals)
      // =================================================================
      case "list_wellness_goals": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const status = body?.status ? String(body.status) : null;
        let q = supabase.from("wellness_goals").select(WELLNESS_GOAL_FIELDS)
          .eq("user_id", ownerId).is("deleted_at", null)
          .order("status").order("target_date", { ascending: true, nullsFirst: false });
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, goals: data ?? [], count: data?.length ?? 0 });
      }

      case "add_wellness_goal": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const title = body?.title ? String(body.title).trim() : "";
        if (!title) return json({ ok: false, error: "title_required" }, 400);

        const { data: inserted, error } = await supabase
          .from("wellness_goals")
          .insert({
            user_id: ownerId, title,
            domain: typeof body?.domain === "string" ? body.domain : "body",
            target_metric: typeof body?.target_metric === "string" ? body.target_metric : null,
            target_value: body?.target_value ?? null,
            starting_value: body?.starting_value ?? null,
            target_date: body?.target_date ?? null,
            status: "active",
            notes: typeof body?.notes === "string" ? body.notes : null,
          })
          .select(WELLNESS_GOAL_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, goal: inserted });
      }

      case "update_wellness_goal_status": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        const status = body?.status ? String(body.status) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        if (!["active", "achieved", "abandoned"].includes(status)) {
          return json({ ok: false, error: "valid_status_required" }, 400);
        }
        const { data: existing, error: fetchErr } = await supabase
          .from("wellness_goals").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { data: updated, error } = await supabase.from("wellness_goals")
          .update({ status }).eq("id", id).select(WELLNESS_GOAL_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, goal: updated });
      }

      case "delete_wellness_goal": {
        const ownerId = requireOwner();
        if (!ownerId) return json({ ok: false, error: "owner_not_configured" }, 500);
        const id = body?.id ? String(body.id) : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("wellness_goals").select("id").eq("id", id).eq("user_id", ownerId).is("deleted_at", null).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        const { error } = await supabase.from("wellness_goals")
          .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted_id: id });
      }

      default:
        return json({ ok: false, error: `unknown_action:${action}` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
