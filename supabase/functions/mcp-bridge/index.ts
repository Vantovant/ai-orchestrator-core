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
// THIS UPDATE adds three read-only actions — list_tasks, list_reminders,
// list_meetings — so Claude can answer "what's on my plate today" without
// a human relaying it from the app UI. No new secrets or config needed;
// these reuse the exact same owner-scoping and auth path as the existing
// create_task/create_reminder/create_meeting actions.

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
// UTC. Used by the new list_* actions for "today" style date filtering.
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

      // NEW: list_tasks — read-only. Powers "what's on my plate" queries
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

      // NEW: list_reminders — read-only. Supports filtering by project,
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

      // NEW: list_meetings — read-only. Supports filtering by project,
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

      default:
        return json({ ok: false, error: `unknown_action:${action}` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
