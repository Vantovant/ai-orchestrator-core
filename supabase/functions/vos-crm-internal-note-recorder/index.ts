// Vanto OS — Step 5B Recorder: vos-crm-internal-note-recorder
//
// Allowed side effect: at most ONE insert into public.vos_crm_internal_notes.
// Forbidden: any external write, any non-Supabase fetch, any dispatch, any
// flag mutation, any wake of Master Prospector, any WhatsApp/email/Zazi/APLGO touch.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BANNED = [
  "send","reply","enrol","enroll","follow up","push","dispatch",
  "forward","contact","message","notify","automate","trigger","schedule",
];

const ALLOWED_INPUT_KEYS = new Set([
  "source_integration_draft_id",
  "note_body",
  "note_kind",
  "corrects_note_id",
  "tags",
]);

const PII = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  sa_id: /\b\d{13}\b/g,
  phone_intl: /\+27\s?\d[\d\s-]{7,12}/g,
  phone_local: /\b0[1-9]\d[\d\s-]{7,10}\b/g,
};

function redactPII(s: string): { redacted: string; summary: Record<string, number> } {
  const summary: Record<string, number> = {};
  let out = s;
  for (const [k, re] of Object.entries(PII)) {
    let n = 0;
    out = out.replace(re, () => { n++; return `[REDACTED_${k.toUpperCase()}]`; });
    if (n > 0) summary[k] = n;
  }
  return { redacted: out, summary };
}

function containsBanned(t: string): string | null {
  const lo = t.toLowerCase();
  for (const w of BANNED) if (lo.includes(w)) return w;
  return null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function err(reason: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: false, reason, ...extra }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return err("method_not_allowed", 405);

  // 1. Auth gate — admin JWT
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return err("missing_bearer_token", 401);
  const token = auth.replace("Bearer ", "");

  const sbUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData, error: userErr } = await sbUser.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) return err("invalid_token", 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: roles } = await sb.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").limit(1);
  if (!roles || roles.length === 0) return err("not_admin", 403);

  // 2. Strict input validation
  let body: any;
  try { body = await req.json(); } catch { return err("invalid_json", 400); }
  if (!body || typeof body !== "object") return err("invalid_body", 400);

  for (const k of Object.keys(body)) {
    if (!ALLOWED_INPUT_KEYS.has(k)) return err("unknown_field", 400, { field: k });
  }

  const source_integration_draft_id: string | undefined = body.source_integration_draft_id;
  const raw_note_body: string | undefined = body.note_body;
  const note_kind: string | undefined = body.note_kind;
  const corrects_note_id: string | null = body.corrects_note_id ?? null;
  const tags: string[] = Array.isArray(body.tags) ? body.tags.filter((t: any) => typeof t === "string").slice(0, 16) : [];

  if (!source_integration_draft_id || typeof source_integration_draft_id !== "string") return err("missing_source_integration_draft_id", 400);
  if (!raw_note_body || typeof raw_note_body !== "string") return err("missing_note_body", 400);
  if (raw_note_body.length < 1 || raw_note_body.length > 2000) return err("note_body_length_invalid", 400);
  if (note_kind !== "internal_observation" && note_kind !== "internal_correction") return err("note_kind_invalid", 400);
  if (note_kind === "internal_correction" && !corrects_note_id) return err("correction_target_required", 400);
  if (corrects_note_id && typeof corrects_note_id !== "string") return err("corrects_note_id_invalid", 400);

  // 3. Live platform-flag kill-switch
  const { data: flags } = await sb.from("vos_platform_flags").select("flag_key, flag_value")
    .in("flag_key", ["VANTO_OS_ENABLED","EMAIL_SEND_ENABLED","WHATSAPP_SEND_ENABLED",
                     "VOS_INBOX_RECEIVE_ENABLED","VOS_INBOX_RECEIVE_APP_APLGO_ENABLED","VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED",
                     "MASTER_PROSPECTOR_STATE","PHASE_4A_STEP_3"]);
  const fmap = new Map((flags ?? []).map((f: any) => [f.flag_key, String(f.flag_value)]));
  const axisA = fmap.get("VANTO_OS_ENABLED")==="false" && fmap.get("EMAIL_SEND_ENABLED")==="false" && fmap.get("WHATSAPP_SEND_ENABLED")==="false";
  const axisB = fmap.get("VOS_INBOX_RECEIVE_ENABLED")==="false" && fmap.get("VOS_INBOX_RECEIVE_APP_APLGO_ENABLED")==="false" && fmap.get("VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED")==="false";
  if (!axisA) return err("kill_switch_engaged", 423, { axis: "A" });
  if (!axisB) return err("kill_switch_engaged", 423, { axis: "B" });
  if (fmap.get("MASTER_PROSPECTOR_STATE") !== "ASLEEP") return err("master_prospector_not_asleep", 423);

  // 4. Source chain — load draft
  const { data: draft, error: draftErr } = await sb
    .from("vos_integration_action_drafts")
    .select("id, source_manual_action_id, source_approval_request_id, source_dry_run_id, source_proposal_id, target_app, integration_action_type, draft_status, would_write_external, external_write_blocked, customer_visible, bulk_action, rollback_required")
    .eq("id", source_integration_draft_id)
    .maybeSingle();
  if (draftErr) return err("draft_query_failed", 500, { detail: draftErr.message });
  if (!draft) return err("integration_draft_not_found", 404);
  if (draft.target_app !== "crm") return err("draft_target_app_invalid", 409, { value: draft.target_app });
  if (draft.integration_action_type !== "crm_note_draft_internal") return err("draft_type_invalid", 409, { value: draft.integration_action_type });
  if (draft.would_write_external !== false) return err("draft_would_write_external_true", 409);
  if (draft.external_write_blocked !== true) return err("draft_external_write_not_blocked", 409);
  if (draft.customer_visible !== false) return err("draft_customer_visible_true", 409);
  if (draft.bulk_action !== false) return err("draft_bulk_action_true", 409);
  if (draft.rollback_required !== true) return err("draft_rollback_not_required", 409);
  if (!["proposed","reviewed"].includes(draft.draft_status)) return err("draft_status_invalid", 409, { value: draft.draft_status });

  // 5. Manual action
  const { data: ma } = await sb
    .from("vos_manual_action_log")
    .select("id, action_type, action_status, external_call_performed, downstream_write_performed, customer_visible, axis_a_snapshot, axis_b_snapshot, source_approval_request_id")
    .eq("id", draft.source_manual_action_id)
    .maybeSingle();
  if (!ma) return err("manual_action_not_found", 409);
  if (ma.action_type !== "internal_admin_note_record") return err("manual_action_type_invalid", 409);
  if (ma.action_status !== "performed") return err("manual_action_not_performed", 409);
  if (ma.external_call_performed || ma.downstream_write_performed || ma.customer_visible) return err("manual_action_unsafe", 409);
  if (ma.axis_a_snapshot !== "RED" || ma.axis_b_snapshot !== "OFF") return err("manual_action_axis_drift", 409);

  // 6. Approval (two-key)
  const { data: appr } = await sb
    .from("vos_approval_requests")
    .select("id, approval_status, reviewed_by, second_reviewed_by, expires_at")
    .eq("id", ma.source_approval_request_id)
    .maybeSingle();
  if (!appr) return err("approval_not_found", 409);
  if (appr.approval_status !== "second_reviewed") return err("approval_not_second_reviewed", 409, { value: appr.approval_status });
  if (!appr.reviewed_by || !appr.second_reviewed_by) return err("two_key_required", 409);
  if (appr.reviewed_by === appr.second_reviewed_by) return err("two_key_same_user", 409);
  if (appr.expires_at && new Date(appr.expires_at).getTime() <= Date.now()) return err("approval_expired", 409);

  // 7. Dry-run + proposal existence
  const { data: dr } = await sb.from("vos_dry_run_actions").select("id, dry_run_status").eq("id", draft.source_dry_run_id).maybeSingle();
  if (!dr) return err("dry_run_not_found", 409);
  const { data: prop } = await sb.from("vos_proposal_queue").select("id").eq("id", draft.source_proposal_id).maybeSingle();
  if (!prop) return err("proposal_not_found", 409);

  // 8. Banned wording on raw input
  const banned = containsBanned(raw_note_body);
  if (banned) return err("forbidden_note_wording", 400, { token: banned });

  // 9. PII redaction
  const { redacted, summary } = redactPII(raw_note_body);

  // 10. Correction validation
  if (note_kind === "internal_correction") {
    const { data: tgt } = await sb.from("vos_crm_internal_notes")
      .select("id, note_kind, note_status").eq("id", corrects_note_id!).maybeSingle();
    if (!tgt) return err("correction_target_not_found", 409);
    if (tgt.note_kind === "internal_correction") return err("correction_chain_forbidden", 409);
    if (tgt.note_status === "archived") return err("correction_target_archived", 409);
  }

  // 11. Server-computed dedupe key (ignores tags + corrects ref)
  const dedupe_key = await sha256Hex([
    draft.source_manual_action_id,
    source_integration_draft_id,
    "none", // contact_ref_type fixed in v1 (no contact ref support in input contract yet)
    "",     // contact_ref_id
    note_kind,
    normalize(redacted),
  ].join("|"));

  // 12. Insert (single row)
  const insertRow = {
    source_manual_action_id: draft.source_manual_action_id,
    source_approval_request_id: ma.source_approval_request_id,
    source_integration_draft_id: source_integration_draft_id,
    contact_ref_type: "none",
    contact_ref_id: null,
    note_body: redacted,
    note_kind,
    corrects_note_id,
    author_user_id: userId,
    dedupe_key,
    customer_visible: false,
    automation_safe: true,
    bulk_action: false,
    external_write_performed: false,
    axis_a_snapshot: "RED",
    axis_b_snapshot: "OFF",
    note_status: "recorded",
    tags,
    redaction_summary: summary,
  };

  // Use an authenticated client (user JWT) so RLS evaluates the caller as admin
  // and so author_user_id = auth.uid() check passes.
  const { data: ins, error: insErr } = await sbUser
    .from("vos_crm_internal_notes")
    .insert(insertRow)
    .select("id, dedupe_key, note_status, created_at")
    .maybeSingle();

  if (insErr) {
    if ((insErr as any).code === "23505" || /duplicate key|unique/i.test(insErr.message)) {
      const { data: existing } = await sb.from("vos_crm_internal_notes")
        .select("id, dedupe_key, note_status, created_at")
        .eq("dedupe_key", dedupe_key).maybeSingle();
      return new Response(JSON.stringify({
        ok: true, duplicate_blocked: true,
        notice: "Note already recorded. No second write performed.",
        record: existing, dedupe_key,
        invariants: { axis_a: "RED", axis_b: "OFF", customer_visible: false, automation_safe: true, bulk_action: false, external_write_performed: false },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return err("insert_failed", 500, { detail: insErr.message });
  }

  return new Response(JSON.stringify({
    ok: true,
    notice: "Internal CRM note recorded. No external write performed.",
    record: ins, dedupe_key,
    invariants: { axis_a: "RED", axis_b: "OFF", customer_visible: false, automation_safe: true, bulk_action: false, external_write_performed: false },
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
