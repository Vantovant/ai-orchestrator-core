// Vanto OS — Step 4Y Integration Draft Recorder (admin-only, INERT)
//
// Allowed side effect: insert exactly one row into public.vos_integration_action_drafts
// Forbidden: any external write, CRM/Zazi/APLGO mutation, dispatcher, send.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_APPS = ["crm", "zazi_mail", "aplgo"] as const;
const ALLOWED_TYPES = [
  "crm_note_draft_internal",
  "zazi_tag_draft_internal",
  "aplgo_interest_note_draft_internal",
  "read_only_context_link",
] as const;

const BANNED = [
  "send","reply","enrol","enroll","follow up","push","dispatch",
  "forward","contact","message","notify","automate","trigger","schedule",
];

function containsBanned(text: string): string | null {
  const t = text.toLowerCase();
  for (const w of BANNED) if (t.includes(w)) return w;
  return null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { ok: false, status: 401, reason: "missing_bearer_token" } as const;
  const token = auth.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } });
  const { data, error } = await sb.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) return { ok: false, status: 401, reason: "invalid_token" } as const;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").limit(1);
  if (!roles || roles.length === 0) return { ok: false, status: 403, reason: "not_admin" } as const;
  return { ok: true, userId } as const;
}

function defaultDraft(target_app: string, integration_action_type: string) {
  if (integration_action_type === "read_only_context_link") {
    return {
      target_surface: `${target_app}:read_only_context`,
      draft_title: "Read-only context link",
      draft_summary: "Internal context link only. No external write performed.",
    };
  }
  switch (target_app) {
    case "crm":
      return {
        target_surface: "crm:internal_note",
        draft_title: "CRM internal note draft",
        draft_summary: "Internal CRM draft only. No external write performed.",
      };
    case "zazi_mail":
      return {
        target_surface: "zazi_mail:internal_tag",
        draft_title: "Zazi Mail internal tag draft",
        draft_summary: "Internal Zazi draft only. No external write performed.",
      };
    case "aplgo":
      return {
        target_surface: "aplgo:internal_interest_note",
        draft_title: "APLGO interest note draft",
        draft_summary: "Internal APLGO interest draft only. No external write performed.",
      };
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ ok: false, reason: gate.reason }),
      { status: gate.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, reason: "invalid_json" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const source_manual_action_id: string | undefined = body?.source_manual_action_id;
  const target_app: string | undefined = body?.target_app;
  const integration_action_type: string | undefined = body?.integration_action_type;
  const draft_note: string | null = typeof body?.draft_note === "string" ? body.draft_note : null;

  if (!source_manual_action_id) {
    return new Response(JSON.stringify({ ok: false, reason: "missing_source_manual_action_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!target_app || !(ALLOWED_APPS as readonly string[]).includes(target_app)) {
    return new Response(JSON.stringify({ ok: false, reason: "forbidden_target_app", value: target_app }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!integration_action_type || !(ALLOWED_TYPES as readonly string[]).includes(integration_action_type)) {
    return new Response(JSON.stringify({ ok: false, reason: "forbidden_integration_action_type", value: integration_action_type }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (draft_note && draft_note.length > 2000) {
    return new Response(JSON.stringify({ ok: false, reason: "draft_note_too_long" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (draft_note) {
    const banned = containsBanned(draft_note);
    if (banned) {
      return new Response(JSON.stringify({ ok: false, reason: "forbidden_draft_wording", token: banned }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Load manual action
  const { data: ma, error: mErr } = await admin
    .from("vos_manual_action_log")
    .select("id, action_type, action_status, downstream_write_performed, external_call_performed, customer_visible, axis_a_snapshot, axis_b_snapshot, source_approval_request_id, source_dry_run_id, source_proposal_id, reviewed_by, second_reviewed_by")
    .eq("id", source_manual_action_id)
    .maybeSingle();

  if (mErr) {
    return new Response(JSON.stringify({ ok: false, reason: "manual_action_query_failed", error: mErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!ma) {
    return new Response(JSON.stringify({ ok: false, reason: "manual_action_not_found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (ma.action_type !== "internal_admin_note_record") {
    return new Response(JSON.stringify({ ok: false, reason: "manual_action_type_invalid", value: ma.action_type }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (ma.action_status !== "performed") {
    return new Response(JSON.stringify({ ok: false, reason: "manual_action_not_performed", value: ma.action_status }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (ma.external_call_performed) {
    return new Response(JSON.stringify({ ok: false, reason: "manual_action_external_call_performed" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (ma.downstream_write_performed) {
    return new Response(JSON.stringify({ ok: false, reason: "manual_action_downstream_write_performed" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (ma.customer_visible) {
    return new Response(JSON.stringify({ ok: false, reason: "manual_action_customer_visible" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (ma.axis_a_snapshot !== "RED") {
    return new Response(JSON.stringify({ ok: false, reason: "axis_a_not_red" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (ma.axis_b_snapshot !== "OFF") {
    return new Response(JSON.stringify({ ok: false, reason: "axis_b_not_off" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Verify approval was second_reviewed and two-key distinct
  const { data: appr } = await admin
    .from("vos_approval_requests")
    .select("id, approval_status, reviewed_by, second_reviewed_by")
    .eq("id", ma.source_approval_request_id)
    .maybeSingle();
  if (!appr) {
    return new Response(JSON.stringify({ ok: false, reason: "approval_not_found" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (appr.approval_status !== "second_reviewed") {
    return new Response(JSON.stringify({ ok: false, reason: "approval_not_second_reviewed", status: appr.approval_status }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!appr.reviewed_by || !appr.second_reviewed_by) {
    return new Response(JSON.stringify({ ok: false, reason: "two_key_required" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (appr.reviewed_by === appr.second_reviewed_by) {
    return new Response(JSON.stringify({ ok: false, reason: "two_key_same_user" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Verify Axis A & B via flags
  const { data: flags } = await admin
    .from("vos_platform_flags")
    .select("flag_key, flag_value")
    .in("flag_key", ["VANTO_OS_ENABLED","EMAIL_SEND_ENABLED","WHATSAPP_SEND_ENABLED",
      "VOS_INBOX_RECEIVE_ENABLED","VOS_INBOX_RECEIVE_APP_APLGO_ENABLED","VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED"]);
  const flagMap = new Map((flags ?? []).map((f: any) => [f.flag_key, String(f.flag_value)]));
  const axisAOK = flagMap.get("VANTO_OS_ENABLED") === "false"
    && flagMap.get("EMAIL_SEND_ENABLED") === "false"
    && flagMap.get("WHATSAPP_SEND_ENABLED") === "false";
  const axisBOK = flagMap.get("VOS_INBOX_RECEIVE_ENABLED") === "false"
    && flagMap.get("VOS_INBOX_RECEIVE_APP_APLGO_ENABLED") === "false"
    && flagMap.get("VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED") === "false";
  if (!axisAOK) {
    return new Response(JSON.stringify({ ok: false, reason: "axis_a_flags_not_red" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!axisBOK) {
    return new Response(JSON.stringify({ ok: false, reason: "axis_b_flags_not_off" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const defaults = defaultDraft(target_app, integration_action_type);
  if (!defaults) {
    return new Response(JSON.stringify({ ok: false, reason: "draft_defaults_unavailable" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const banned1 = containsBanned(`${defaults.draft_title} ${defaults.draft_summary}`);
  if (banned1) {
    return new Response(JSON.stringify({ ok: false, reason: "forbidden_wording_internal", token: banned1 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const dedupe_key = await sha256Hex(`${source_manual_action_id}:${target_app}:${integration_action_type}`);

  const draft_payload_redacted = {
    notice: "Internal draft only. No external write performed.",
    target_app,
    integration_action_type,
    chain: {
      manual_action_id: ma.id,
      approval_id: ma.source_approval_request_id,
      dry_run_id: ma.source_dry_run_id,
      proposal_id: ma.source_proposal_id,
    },
    admin_draft_note: draft_note,
  };

  const insertRow = {
    source_manual_action_id: ma.id,
    source_approval_request_id: ma.source_approval_request_id,
    source_dry_run_id: ma.source_dry_run_id,
    source_proposal_id: ma.source_proposal_id,
    target_app,
    target_surface: defaults.target_surface,
    integration_action_type,
    draft_title: defaults.draft_title,
    draft_summary: defaults.draft_summary,
    draft_payload_redacted,
    draft_status: "proposed",
    would_write_external: false,
    external_write_blocked: true,
    customer_visible: false,
    bulk_action: false,
    rollback_required: true,
    approved_scope: { scope: "internal_draft_only" },
    dedupe_key,
  };

  const { data: ins, error: insErr } = await admin
    .from("vos_integration_action_drafts")
    .insert(insertRow)
    .select("id, dedupe_key, draft_status, target_app, integration_action_type")
    .maybeSingle();

  if (insErr) {
    if ((insErr as any).code === "23505" || /duplicate key/i.test(insErr.message)) {
      return new Response(JSON.stringify({
        ok: true,
        duplicate_blocked: true,
        notice: "Already drafted. No action taken.",
        dedupe_key,
        invariants: { axis_a: "RED", axis_b: "OFF", external_write_blocked: true, would_write_external: false, customer_visible: false, bulk_action: false, rollback_required: true },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, reason: "insert_failed", error: insErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    ok: true,
    notice: "Internal integration draft recorded. No external write performed.",
    invariants: {
      axis_a: "RED",
      axis_b: "OFF",
      external_write_blocked: true,
      would_write_external: false,
      customer_visible: false,
      bulk_action: false,
      rollback_required: true,
    },
    record: ins,
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
