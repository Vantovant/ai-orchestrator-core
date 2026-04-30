// Vanto OS — Step 4W Manual Action Recorder (admin-only, INERT, internal note ONLY)
//
// Allowed side effect: insert exactly one row into public.vos_manual_action_log
// Forbidden: WhatsApp, email, CRM, Zazi, APLGO, dispatcher, publish/consume,
// external fetch, bulk action, Axis A unlock, Axis B open.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ACTION_TYPE = "internal_admin_note_record";

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
  if (!auth?.startsWith("Bearer ")) return { ok: false, status: 401, reason: "missing_bearer_token" };
  const token = auth.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } });
  const { data, error } = await sb.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) return { ok: false, status: 401, reason: "invalid_token" };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").limit(1);
  if (!roles || roles.length === 0) return { ok: false, status: 403, reason: "not_admin" };
  return { ok: true, userId };
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

  const source_approval_request_id: string | undefined = body?.source_approval_request_id;
  const admin_note_raw: string | null = typeof body?.admin_note === "string" ? body.admin_note : null;

  if (!source_approval_request_id || typeof source_approval_request_id !== "string") {
    return new Response(JSON.stringify({ ok: false, reason: "missing_source_approval_request_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Length cap on admin_note
  if (admin_note_raw && admin_note_raw.length > 2000) {
    return new Response(JSON.stringify({ ok: false, reason: "admin_note_too_long" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Banned-token scan on admin_note
  if (admin_note_raw) {
    const banned = containsBanned(admin_note_raw);
    if (banned) {
      return new Response(JSON.stringify({ ok: false, reason: "forbidden_admin_note_wording", token: banned }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Load approval
  const { data: appr, error: aErr } = await admin
    .from("vos_approval_requests")
    .select("id, source_dry_run_id, source_proposal_id, app_id, event_name, approval_status, reviewed_by, second_reviewed_by, expires_at")
    .eq("id", source_approval_request_id)
    .maybeSingle();

  if (aErr) {
    return new Response(JSON.stringify({ ok: false, reason: "approval_query_failed", error: aErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!appr) {
    return new Response(JSON.stringify({ ok: false, reason: "approval_not_found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  if (appr.expires_at && new Date(appr.expires_at).getTime() <= Date.now()) {
    return new Response(JSON.stringify({ ok: false, reason: "approval_expired" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Verify Axis A RED & Axis B OFF via platform flags (defense in depth)
  const { data: flags } = await admin
    .from("vos_platform_flags")
    .select("flag_key, flag_value")
    .in("flag_key", ["VANTO_OS_ENABLED","EMAIL_SEND_ENABLED","WHATSAPP_SEND_ENABLED",
      "VOS_INBOX_RECEIVE_ENABLED","VOS_INBOX_RECEIVE_APP_APLGO_ENABLED","VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED"]);
  const flagMap = new Map((flags ?? []).map((f: any) => [f.flag_key, String(f.flag_value)]));
  const axisAOK =
    flagMap.get("VANTO_OS_ENABLED") === "false" &&
    flagMap.get("EMAIL_SEND_ENABLED") === "false" &&
    flagMap.get("WHATSAPP_SEND_ENABLED") === "false";
  const axisBOK =
    flagMap.get("VOS_INBOX_RECEIVE_ENABLED") === "false" &&
    flagMap.get("VOS_INBOX_RECEIVE_APP_APLGO_ENABLED") === "false" &&
    flagMap.get("VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED") === "false";
  if (!axisAOK) {
    return new Response(JSON.stringify({ ok: false, reason: "axis_a_not_red" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!axisBOK) {
    return new Response(JSON.stringify({ ok: false, reason: "axis_b_not_off" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const action_type = ALLOWED_ACTION_TYPE;
  const dedupe_key = await sha256Hex(`${source_approval_request_id}:${action_type}`);

  const action_title = "Internal admin note recorded";
  const action_summary = "Internal record only. No external action taken.";

  const banned1 = containsBanned(`${action_title} ${action_summary}`);
  if (banned1) {
    return new Response(JSON.stringify({ ok: false, reason: "forbidden_wording_internal", token: banned1 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const action_result = {
    notice: "Internal record only. No external action taken.",
    chain: {
      approval_id: appr.id,
      dry_run_id: appr.source_dry_run_id,
      proposal_id: appr.source_proposal_id,
      app_id: appr.app_id,
      event_name: appr.event_name,
    },
    no_external_call: true,
    no_downstream_write: true,
    customer_visible: false,
  };

  const insertRow = {
    source_approval_request_id: appr.id,
    source_dry_run_id: appr.source_dry_run_id,
    source_proposal_id: appr.source_proposal_id,
    source_receipt_id: null,
    app_id: appr.app_id,
    event_name: appr.event_name,
    action_type,
    action_title,
    action_summary,
    admin_note: admin_note_raw,
    action_status: "performed",
    action_result,
    performed_by: gate.userId,
    reviewed_by: appr.reviewed_by,
    second_reviewed_by: appr.second_reviewed_by,
    safety_blocked_snapshot: true,
    axis_a_snapshot: "RED",
    axis_b_snapshot: "OFF",
    downstream_target: "none",
    downstream_write_performed: false,
    customer_visible: false,
    external_call_performed: false,
    rollback_available: true,
    rollback_status: "none",
    dedupe_key,
  };

  const { data: ins, error: insErr } = await admin
    .from("vos_manual_action_log")
    .insert(insertRow)
    .select("id, dedupe_key, action_status, action_type")
    .maybeSingle();

  if (insErr) {
    if ((insErr as any).code === "23505" || /duplicate key/i.test(insErr.message)) {
      return new Response(JSON.stringify({
        ok: true,
        duplicate_blocked: true,
        notice: "Already recorded. No action taken.",
        dedupe_key,
        invariants: { axis_a: "RED", axis_b: "OFF", external_call_performed: false, downstream_write_performed: false, customer_visible: false },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, reason: "insert_failed", error: insErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    ok: true,
    notice: "Internal admin note recorded. No external action taken. Internal record only.",
    invariants: {
      axis_a: "RED",
      axis_b: "OFF",
      external_call_performed: false,
      downstream_write_performed: false,
      customer_visible: false,
      safety_blocked_snapshot: true,
    },
    record: ins,
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
