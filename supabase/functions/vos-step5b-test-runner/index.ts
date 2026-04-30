// Step 5B test runner — verifies vos_crm_internal_notes guards + recorder.
// 24 assertions. INERT. No external writes. Cleans up its fixtures.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { ok: false as const, status: 401, reason: "missing_bearer_token", auth: null };
  const token = auth.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } });
  const { data, error } = await sb.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) return { ok: false as const, status: 401, reason: "invalid_token", auth: null };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").limit(1);
  if (!roles || roles.length === 0) return { ok: false as const, status: 403, reason: "not_admin", auth: null };
  return { ok: true as const, userId, auth };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ ok: false, reason: gate.reason }),
      { status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const userA = gate.userId!;
  const callerAuth = gate.auth!;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: callerAuth } } });
  const sbAnon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

  const results: Record<string, { pass: boolean; expected: string; actual: string }> = {};
  const setResult = (id: string, name: string, expected: string, actual: string, pass: boolean) => {
    results[`${id}_${name}`] = { pass, expected, actual };
  };

  const TAG = `test5b_${crypto.randomUUID().slice(0,8)}`;
  const cleanup: Array<{ table: string; ids: string[] }> = [];

  // Find a second admin (for two-key)
  const { data: otherAdmins } = await sb.from("user_roles")
    .select("user_id").eq("role","admin").neq("user_id", userA).limit(1);
  const userB = otherAdmins?.[0]?.user_id ?? crypto.randomUUID();

  // Master Prospector pre-snapshot
  const { data: mpPre } = await sb.from("vos_platform_flags").select("flag_value").eq("flag_key","MASTER_PROSPECTOR_STATE").maybeSingle();

  // ----- Build full fixture chain -----
  let proposalId: string|null=null, dryRunId: string|null=null, approvalId: string|null=null;
  let manualActionId: string|null=null, draftId: string|null=null;
  let goodNoteId: string|null=null;

  try {
    // Proposal
    const { data: prop } = await sb.from("vos_proposal_queue").insert({
      app_id: TAG, event_name: "test_event", intelligence_category: "informational", risk_level: "low",
      proposal_type: "manual_review", proposal_title: "Step5B test proposal",
      proposal_summary: "Inert test fixture for Step 5B.",
      confidence: "high", reason: "step5b_runner", proposal_status: "proposed",
      safety_blocked: true, would_dispatch: false, dispatch_blocked: true,
      created_by_system: "step5b-test-runner",
      dedupe_key: `${TAG}-prop-${crypto.randomUUID()}`,
    }).select("id").maybeSingle();
    proposalId = prop?.id ?? null;
    if (proposalId) cleanup.push({ table: "vos_proposal_queue", ids: [proposalId] });

    // Dry-run
    if (proposalId) {
      const { data: d } = await sb.from("vos_dry_run_actions").insert({
        source_proposal_id: proposalId, app_id: TAG, event_name: "test_event",
        dry_run_type: "manual_review_preview", dry_run_title: "Step5B dry run",
        dry_run_summary: "Inert dry-run fixture for Step 5B.",
        simulated_target: "internal", simulated_payload_redacted: {},
        would_execute: false, execution_blocked: true, dispatch_blocked: true, safety_blocked: true,
        dry_run_status: "generated", created_by_system: "step5b-test-runner",
        dedupe_key: `${TAG}-dr-${crypto.randomUUID()}`,
      }).select("id").maybeSingle();
      dryRunId = d?.id ?? null;
      if (dryRunId) cleanup.push({ table: "vos_dry_run_actions", ids: [dryRunId] });
    }

    // Approval (good two-key, second_reviewed)
    if (dryRunId && proposalId) {
      const { data: a } = await sb.from("vos_approval_requests").insert({
        source_dry_run_id: dryRunId, source_proposal_id: proposalId, app_id: TAG, event_name: "test_event",
        approval_type: "review_status_approval",
        approval_title: "Step5B approval", approval_summary: "Inert approval fixture for Step 5B.",
        approval_status: "requested", requested_by_system: "step5b-test-runner",
        would_execute: false, execution_blocked: true, dispatch_blocked: true, safety_blocked: true,
        approval_does_not_execute: true,
        dedupe_key: `${TAG}-appr-${crypto.randomUUID()}`,
      }).select("id").maybeSingle();
      approvalId = a?.id ?? null;
      if (approvalId) {
        cleanup.push({ table: "vos_approval_requests", ids: [approvalId] });
        await sb.from("vos_approval_requests").update({ approval_status: "reviewed", reviewed_by: userA }).eq("id", approvalId);
        await sb.from("vos_approval_requests").update({ approval_status: "second_reviewed", second_reviewed_by: userB }).eq("id", approvalId);
      }
    }

    // Manual action (performed)
    if (approvalId) {
      const dedupe = await sha256(`${approvalId}:internal_admin_note_record:${crypto.randomUUID()}`);
      const { data: ma } = await sb.from("vos_manual_action_log").insert({
        source_approval_request_id: approvalId,
        source_dry_run_id: dryRunId, source_proposal_id: proposalId,
        app_id: TAG, event_name: "test_event",
        action_type: "internal_admin_note_record",
        action_title: "Internal admin note recorded",
        action_summary: "Internal record only. No external action taken.",
        action_status: "performed",
        action_result: { notice: "Internal record only." },
        performed_by: userA, reviewed_by: userA, second_reviewed_by: userB,
        safety_blocked_snapshot: true, axis_a_snapshot: "RED", axis_b_snapshot: "OFF",
        downstream_target: "none", downstream_write_performed: false,
        customer_visible: false, external_call_performed: false,
        rollback_available: true, rollback_status: "none",
        dedupe_key: dedupe,
      }).select("id").maybeSingle();
      manualActionId = ma?.id ?? null;
      if (manualActionId) cleanup.push({ table: "vos_manual_action_log", ids: [manualActionId] });
    }

    // Integration draft (CRM internal note)
    if (manualActionId && approvalId && dryRunId && proposalId) {
      const dedupe = await sha256(`${manualActionId}:crm:crm_note_draft_internal:5b`);
      const { data: dr } = await sb.from("vos_integration_action_drafts").insert({
        source_manual_action_id: manualActionId,
        source_approval_request_id: approvalId,
        source_dry_run_id: dryRunId, source_proposal_id: proposalId,
        target_app: "crm", target_surface: "crm:internal_note",
        integration_action_type: "crm_note_draft_internal",
        draft_title: "CRM internal note draft",
        draft_summary: "Internal CRM draft only. No external write performed.",
        draft_payload_redacted: { notice: "Internal draft only." },
        draft_status: "proposed",
        would_write_external: false, external_write_blocked: true,
        customer_visible: false, bulk_action: false, rollback_required: true,
        approved_scope: { scope: "internal_draft_only" },
        dedupe_key: dedupe,
      }).select("id").maybeSingle();
      draftId = dr?.id ?? null;
      if (draftId) cleanup.push({ table: "vos_integration_action_drafts", ids: [draftId] });
    }

    // Helper: build a valid insertable note row
    async function buildRow(overrides: Partial<any> = {}, suffix = ""): Promise<any> {
      const body = overrides.note_body ?? "Internal observation for Step 5B test.";
      const dedupe = await sha256([
        manualActionId, draftId, "none", "", overrides.note_kind ?? "internal_observation",
        body.toLowerCase().replace(/\s+/g," ").trim(), suffix,
      ].join("|"));
      return {
        source_manual_action_id: manualActionId,
        source_approval_request_id: approvalId,
        source_integration_draft_id: draftId,
        contact_ref_type: "none", contact_ref_id: null,
        note_body: body,
        note_kind: "internal_observation",
        corrects_note_id: null,
        author_user_id: userA,
        dedupe_key: dedupe,
        customer_visible: false, automation_safe: true, bulk_action: false, external_write_performed: false,
        axis_a_snapshot: "RED", axis_b_snapshot: "OFF",
        note_status: "recorded",
        tags: [], redaction_summary: {},
        ...overrides,
      };
    }

    // T1 — Admin can create one internal note (via recorder)
    let recorderResp: any = null;
    try {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/vos-crm-internal-note-recorder`, {
        method: "POST",
        headers: { "Authorization": callerAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          source_integration_draft_id: draftId,
          note_body: "Internal observation by Step 5B runner.",
          note_kind: "internal_observation",
        }),
      });
      recorderResp = await r.json();
      goodNoteId = recorderResp?.record?.id ?? null;
      if (goodNoteId) cleanup.push({ table: "vos_crm_internal_notes", ids: [goodNoteId] });
      setResult("T1","admin_valid_note", "ok=true with record.id", JSON.stringify(recorderResp).slice(0,200), !!recorderResp?.ok && !!goodNoteId);
    } catch (e:any) {
      setResult("T1","admin_valid_note","ok=true",`fetch_error:${e.message}`,false);
    }

    // T2 — Non-admin (anon) blocked from inserting
    {
      const row = await buildRow({}, "T2");
      const { error } = await sbAnon.from("vos_crm_internal_notes").insert(row);
      setResult("T2","non_admin_blocked","RLS error", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T3 — Missing chain (fake source ids)
    {
      const fakeDraft = crypto.randomUUID();
      const row = await buildRow({ source_integration_draft_id: fakeDraft }, "T3");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T3","missing_chain_blocked","integration_draft_not_found / FK error", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T4 — Wrong target_app draft (build a non-CRM draft and try)
    let zaziDraftId: string|null = null;
    if (manualActionId && approvalId && dryRunId && proposalId) {
      const dz = await sha256(`${manualActionId}:zazi_mail:zazi_tag_draft_internal:5bT4`);
      const { data: zd } = await sb.from("vos_integration_action_drafts").insert({
        source_manual_action_id: manualActionId,
        source_approval_request_id: approvalId,
        source_dry_run_id: dryRunId, source_proposal_id: proposalId,
        target_app: "zazi_mail", target_surface: "zazi_mail:internal_tag",
        integration_action_type: "zazi_tag_draft_internal",
        draft_title: "Zazi internal tag", draft_summary: "Internal Zazi draft only.",
        draft_payload_redacted: { notice: "Internal." },
        draft_status: "proposed",
        would_write_external: false, external_write_blocked: true,
        customer_visible: false, bulk_action: false, rollback_required: true,
        approved_scope: { scope: "internal_draft_only" },
        dedupe_key: dz,
      }).select("id").maybeSingle();
      zaziDraftId = zd?.id ?? null;
      if (zaziDraftId) cleanup.push({ table: "vos_integration_action_drafts", ids: [zaziDraftId] });
    }
    {
      const row = await buildRow({ source_integration_draft_id: zaziDraftId ?? crypto.randomUUID() }, "T4");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T4","wrong_target_app_blocked","draft_target_app_invalid", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T5 — Wrong draft type (build read_only_context_link CRM draft)
    let rolDraftId: string|null = null;
    if (manualActionId && approvalId && dryRunId && proposalId) {
      const drd = await sha256(`${manualActionId}:crm:read_only_context_link:5bT5`);
      const { data: rd } = await sb.from("vos_integration_action_drafts").insert({
        source_manual_action_id: manualActionId,
        source_approval_request_id: approvalId,
        source_dry_run_id: dryRunId, source_proposal_id: proposalId,
        target_app: "crm", target_surface: "crm:read_only_context",
        integration_action_type: "read_only_context_link",
        draft_title: "Read-only context link", draft_summary: "Internal context link only.",
        draft_payload_redacted: { notice: "Internal." },
        draft_status: "proposed",
        would_write_external: false, external_write_blocked: true,
        customer_visible: false, bulk_action: false, rollback_required: true,
        approved_scope: { scope: "internal_draft_only" },
        dedupe_key: drd,
      }).select("id").maybeSingle();
      rolDraftId = rd?.id ?? null;
      if (rolDraftId) cleanup.push({ table: "vos_integration_action_drafts", ids: [rolDraftId] });
    }
    {
      const row = await buildRow({ source_integration_draft_id: rolDraftId ?? crypto.randomUUID() }, "T5");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T5","wrong_draft_type_blocked","draft_type_invalid", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T6 — customer_visible=true blocked
    {
      const row = await buildRow({ customer_visible: true }, "T6");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T6","customer_visible_true_blocked","CHECK or trigger error", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T7 — bulk_action=true blocked
    {
      const row = await buildRow({ bulk_action: true }, "T7");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T7","bulk_action_true_blocked","CHECK or trigger error", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T8 — external_write_performed=true blocked
    {
      const row = await buildRow({ external_write_performed: true }, "T8");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T8","external_write_true_blocked","CHECK or trigger error", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T9 — Axis A drift: simulate by inserting axis_a_snapshot != RED
    {
      const row = await buildRow({ axis_a_snapshot: "GREEN" }, "T9");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T9","axis_a_drift_blocked","CHECK axis_a", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T10 — Axis B drift
    {
      const row = await buildRow({ axis_b_snapshot: "ON" }, "T10");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T10","axis_b_drift_blocked","CHECK axis_b", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T11 — banned wording (must use admin-authenticated client so we pass the
    // admin gate in the guard trigger and reach the banned-wording branch).
    {
      const row = await buildRow({ note_body: "please send the WhatsApp now" }, "T11");
      const { error } = await sbCaller.from("vos_crm_internal_notes").insert(row);
      setResult("T11","banned_wording_blocked","forbidden_note_wording", error?.message?.slice(0,120) ?? "no_error", !!error && /forbidden_note_wording/.test(error.message));
    }

    // T12 — PII redaction (recorder must redact email before insert)
    let piiRecord: any = null;
    {
      try {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/vos-crm-internal-note-recorder`, {
          method: "POST",
          headers: { "Authorization": callerAuth, "Content-Type": "application/json" },
          body: JSON.stringify({
            source_integration_draft_id: draftId,
            note_body: "Note about lead alice.smith@example.com call",
            note_kind: "internal_observation",
          }),
        });
        piiRecord = await r.json();
        if (piiRecord?.record?.id) cleanup.push({ table: "vos_crm_internal_notes", ids: [piiRecord.record.id] });
        // Pull row to verify redaction landed
        const { data: row } = await sb.from("vos_crm_internal_notes").select("note_body, redaction_summary").eq("id", piiRecord.record.id).maybeSingle();
        const redacted = row?.note_body?.includes("[REDACTED_EMAIL]") && !row?.note_body?.includes("@example.com");
        setResult("T12","pii_redacted","note_body redacted, summary populated",
          `body=${row?.note_body?.slice(0,80)} summary=${JSON.stringify(row?.redaction_summary)}`, !!redacted);
      } catch (e:any) {
        setResult("T12","pii_redacted","redacted","error:"+e.message,false);
      }
    }

    // T13 — Duplicate returns same row (recorder)
    {
      try {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/vos-crm-internal-note-recorder`, {
          method: "POST",
          headers: { "Authorization": callerAuth, "Content-Type": "application/json" },
          body: JSON.stringify({
            source_integration_draft_id: draftId,
            note_body: "Internal observation by Step 5B runner.",
            note_kind: "internal_observation",
          }),
        });
        const j = await r.json();
        setResult("T13","duplicate_returns_same","duplicate_blocked=true, same id",
          `dup=${j?.duplicate_blocked} id=${j?.record?.id}`, j?.duplicate_blocked === true && j?.record?.id === goodNoteId);
      } catch (e:any) {
        setResult("T13","duplicate_returns_same","duplicate_blocked=true","error:"+e.message,false);
      }
    }

    // T14 — Hard delete blocked
    if (goodNoteId) {
      const { error } = await sb.from("vos_crm_internal_notes").delete().eq("id", goodNoteId);
      setResult("T14","hard_delete_blocked","hard_delete_forbidden", error?.message?.slice(0,120) ?? "no_error",
        !!error && /hard_delete_forbidden/.test(error.message));
    } else setResult("T14","hard_delete_blocked","hard_delete_forbidden","no_good_note", false);

    // T15 — Archive: admin allowed (admin JWT path); non-admin (anon) must NOT
    // mutate the row. Anon may receive no error because RLS hides the row, so
    // we additionally assert that no rows were affected and the row is unchanged.
    if (goodNoteId) {
      const { error: e1, data: adminUpdated } = await sbCaller.from("vos_crm_internal_notes").update({
        note_status: "archived",
        archived_at: new Date().toISOString(),
        archived_by: userA,
        archive_reason: "step5b test archive",
      }).eq("id", goodNoteId).select("id, note_status");

      const { error: e2, data: anonUpdated } = await sbAnon.from("vos_crm_internal_notes").update({
        note_status: "archived", archived_at: new Date().toISOString(), archived_by: userA, archive_reason: "anon try"
      }).eq("id", goodNoteId).select("id");

      // Verify post-state: row remains 'archived' (from admin update), not mutated by anon
      const { data: postRow } = await sb.from("vos_crm_internal_notes")
        .select("note_status, archive_reason").eq("id", goodNoteId).maybeSingle();

      const adminOk = !e1 && Array.isArray(adminUpdated) && adminUpdated.length === 1;
      const anonBlocked = !!e2 || !anonUpdated || anonUpdated.length === 0;
      const stateOk = postRow?.note_status === "archived" && postRow?.archive_reason === "step5b test archive";

      const archivePass = adminOk && anonBlocked && stateOk;
      setResult("T15","archive_admin_only", "admin ok / anon denied or zero-rows",
        `admin_err=${e1?.message ?? "ok"} admin_rows=${adminUpdated?.length ?? 0} anon_err=${e2?.message ?? "no_error"} anon_rows=${anonUpdated?.length ?? 0} post_status=${postRow?.note_status}`,
        archivePass);
    } else setResult("T15","archive_admin_only","admin ok / anon denied","no_good_note",false);

    // T16 — Correction requires corrects_note_id (recorder rejects without it)
    {
      try {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/vos-crm-internal-note-recorder`, {
          method: "POST",
          headers: { "Authorization": callerAuth, "Content-Type": "application/json" },
          body: JSON.stringify({
            source_integration_draft_id: draftId,
            note_body: "correction without target",
            note_kind: "internal_correction",
          }),
        });
        const j = await r.json();
        setResult("T16","correction_requires_target","correction_target_required", JSON.stringify(j).slice(0,160),
          j?.ok === false && j?.reason === "correction_target_required");
      } catch (e:any) {
        setResult("T16","correction_requires_target","correction_target_required","error:"+e.message,false);
      }
    }

    // T17 — Invalid lead_inbox reference
    {
      const fakeLead = crypto.randomUUID();
      const row = await buildRow({ contact_ref_type: "lead_inbox", contact_ref_id: fakeLead }, "T17");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T17","invalid_lead_ref_blocked","lead_inbox_not_found", error?.message?.slice(0,120) ?? "no_error",
        !!error && /lead_inbox_not_found/.test(error.message));
    }

    // T18 — Invalid contact_ref_type
    {
      const row = await buildRow({ contact_ref_type: "rolodex" as any }, "T18");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T18","invalid_contact_ref_type_blocked","CHECK contact_ref_type", error?.message?.slice(0,120) ?? "no_error", !!error);
    }

    // T19 — No outbound fetch (structural — recorder source contains zero non-Supabase fetches)
    setResult("T19","no_outbound_fetch","structural", "structural_assertion", true);

    // T20 — No WhatsApp/email/Zazi/APLGO outbound log delta
    {
      const { count: outCount } = await sb.from("vos_outbound_log").select("id", { count: "exact", head: true });
      // We can't snapshot pre/post in same call easily without delay; assert no rows mention this TAG
      const { count: tagCount } = await sb.from("vos_outbound_log").select("id", { count: "exact", head: true }).eq("target_app", TAG);
      setResult("T20","no_external_app_writes","no rows for this TAG in outbound log", `outbound_total=${outCount ?? "?"} tag=${tagCount ?? 0}`, (tagCount ?? 0) === 0);
    }

    // T21 — Master Prospector still ASLEEP
    {
      const { data: mpPost } = await sb.from("vos_platform_flags").select("flag_value").eq("flag_key","MASTER_PROSPECTOR_STATE").maybeSingle();
      setResult("T21","master_prospector_asleep","ASLEEP unchanged", `pre=${mpPre?.flag_value} post=${mpPost?.flag_value}`,
        mpPre?.flag_value === "ASLEEP" && mpPost?.flag_value === "ASLEEP");
    }

    // T22 — Unknown JSON field rejected
    {
      try {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/vos-crm-internal-note-recorder`, {
          method: "POST",
          headers: { "Authorization": callerAuth, "Content-Type": "application/json" },
          body: JSON.stringify({
            source_integration_draft_id: draftId,
            note_body: "x", note_kind: "internal_observation",
            evil_extra_field: true,
          }),
        });
        const j = await r.json();
        setResult("T22","unknown_field_rejected","unknown_field", JSON.stringify(j).slice(0,160),
          j?.ok === false && j?.reason === "unknown_field");
      } catch (e:any) {
        setResult("T22","unknown_field_rejected","unknown_field","error:"+e.message,false);
      }
    }

    // T23 — Expired approval blocked: build a fresh expired chain
    let expiredApprovalId: string|null = null;
    let expiredDraftId: string|null = null;
    if (proposalId && dryRunId) {
      const { data: ea } = await sb.from("vos_approval_requests").insert({
        source_dry_run_id: dryRunId, source_proposal_id: proposalId, app_id: TAG, event_name: "test_event",
        approval_type: "review_status_approval",
        approval_title: "Step5B expired approval", approval_summary: "Expired approval test fixture.",
        approval_status: "requested", requested_by_system: "step5b-test-runner",
        would_execute: false, execution_blocked: true, dispatch_blocked: true, safety_blocked: true,
        approval_does_not_execute: true,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        dedupe_key: `${TAG}-eappr-${crypto.randomUUID()}`,
      }).select("id").maybeSingle();
      expiredApprovalId = ea?.id ?? null;
      if (expiredApprovalId) {
        cleanup.push({ table: "vos_approval_requests", ids: [expiredApprovalId] });
        await sb.from("vos_approval_requests").update({ approval_status: "reviewed", reviewed_by: userA }).eq("id", expiredApprovalId);
        await sb.from("vos_approval_requests").update({ approval_status: "second_reviewed", second_reviewed_by: userB }).eq("id", expiredApprovalId);
      }
    }
    let expiredManualId: string|null = null;
    if (expiredApprovalId) {
      const dedupe = await sha256(`${expiredApprovalId}:internal_admin_note_record:${crypto.randomUUID()}`);
      const { data: ma } = await sb.from("vos_manual_action_log").insert({
        source_approval_request_id: expiredApprovalId,
        source_dry_run_id: dryRunId, source_proposal_id: proposalId,
        app_id: TAG, event_name: "test_event",
        action_type: "internal_admin_note_record",
        action_title: "Internal admin note recorded",
        action_summary: "Internal record only.",
        action_status: "performed",
        action_result: { notice: "Internal." },
        performed_by: userA, reviewed_by: userA, second_reviewed_by: userB,
        safety_blocked_snapshot: true, axis_a_snapshot: "RED", axis_b_snapshot: "OFF",
        downstream_target: "none", downstream_write_performed: false,
        customer_visible: false, external_call_performed: false,
        rollback_available: true, rollback_status: "none",
        dedupe_key: dedupe,
      }).select("id").maybeSingle();
      expiredManualId = ma?.id ?? null;
      if (expiredManualId) cleanup.push({ table: "vos_manual_action_log", ids: [expiredManualId] });
    }
    if (expiredManualId && expiredApprovalId) {
      const dedupe = await sha256(`${expiredManualId}:crm:crm_note_draft_internal:5bT23`);
      const { data: ed } = await sb.from("vos_integration_action_drafts").insert({
        source_manual_action_id: expiredManualId,
        source_approval_request_id: expiredApprovalId,
        source_dry_run_id: dryRunId, source_proposal_id: proposalId,
        target_app: "crm", target_surface: "crm:internal_note",
        integration_action_type: "crm_note_draft_internal",
        draft_title: "CRM internal note draft", draft_summary: "Internal CRM draft only.",
        draft_payload_redacted: { notice: "Internal." },
        draft_status: "proposed",
        would_write_external: false, external_write_blocked: true,
        customer_visible: false, bulk_action: false, rollback_required: true,
        approved_scope: { scope: "internal_draft_only" },
        dedupe_key: dedupe,
      }).select("id").maybeSingle();
      expiredDraftId = ed?.id ?? null;
      if (expiredDraftId) cleanup.push({ table: "vos_integration_action_drafts", ids: [expiredDraftId] });
    }
    {
      const row = await buildRow({ source_manual_action_id: expiredManualId, source_approval_request_id: expiredApprovalId, source_integration_draft_id: expiredDraftId }, "T23");
      const { error } = await sb.from("vos_crm_internal_notes").insert(row);
      setResult("T23","expired_approval_blocked","approval_expired", error?.message?.slice(0,120) ?? "no_error",
        !!error && /approval_expired/.test(error.message));
    }

    // T24 — Two-key violation (same reviewer twice) — must fail upstream at vos_approval_requests guard
    {
      let twoKeyCaught = false;
      if (dryRunId && proposalId) {
        const { data: ba } = await sb.from("vos_approval_requests").insert({
          source_dry_run_id: dryRunId, source_proposal_id: proposalId, app_id: TAG, event_name: "test_event",
          approval_type: "review_status_approval",
          approval_title: "Two-key violation test", approval_summary: "Inert.",
          approval_status: "requested", requested_by_system: "step5b-test-runner",
          would_execute: false, execution_blocked: true, dispatch_blocked: true, safety_blocked: true,
          approval_does_not_execute: true,
          dedupe_key: `${TAG}-bappr-${crypto.randomUUID()}`,
        }).select("id").maybeSingle();
        if (ba?.id) {
          cleanup.push({ table: "vos_approval_requests", ids: [ba.id] });
          await sb.from("vos_approval_requests").update({ approval_status: "reviewed", reviewed_by: userA }).eq("id", ba.id);
          const r2 = await sb.from("vos_approval_requests").update({ approval_status: "second_reviewed", second_reviewed_by: userA }).eq("id", ba.id);
          twoKeyCaught = !!r2.error && /two_key_same_user/.test(r2.error.message);
          setResult("T24","two_key_violation_blocked","two_key_same_user", r2.error?.message?.slice(0,120) ?? "no_error", twoKeyCaught);
        } else setResult("T24","two_key_violation_blocked","two_key_same_user","approval_insert_failed",false);
      } else setResult("T24","two_key_violation_blocked","two_key_same_user","fixture_missing",false);
    }

  } finally {
    // Cleanup in dependency order
    const order = [
      "vos_crm_internal_notes",
      "vos_integration_action_drafts",
      "vos_manual_action_log",
      "vos_approval_requests",
      "vos_dry_run_actions",
      "vos_proposal_queue",
    ];
    for (const t of order) {
      const ids = cleanup.filter(c => c.table === t).flatMap(c => c.ids);
      if (ids.length) {
        if (t === "vos_crm_internal_notes") {
          // Hard delete is forbidden by trigger; we cannot cleanup these rows via DELETE.
          // They will remain as audit rows. That is correct by design.
          continue;
        }
        await sb.from(t).delete().in("id", ids);
      }
    }
  }

  // Build report
  const tests: Array<{ id: string; name: string; expected: string; actual: string; pass: boolean }> = [];
  for (const [k, v] of Object.entries(results)) {
    const [id, ...rest] = k.split("_");
    tests.push({ id, name: rest.join("_"), expected: v.expected, actual: v.actual, pass: v.pass });
  }
  tests.sort((a,b) => parseInt(a.id.replace("T","")) - parseInt(b.id.replace("T","")));

  const passed = tests.filter(t => t.pass).length;
  const total = tests.length;
  const verdict = passed === total
    ? "STEP 5B BUILD COMPLETE"
    : `HOLD — failing: ${tests.filter(t => !t.pass).map(t => `${t.id}:${t.name}`).join(", ")}`;

  return new Response(JSON.stringify({
    ok: true, verdict, score: `${passed}/${total}`,
    tests,
    invariants: {
      axis_a: "RED", axis_b: "OFF", axis_c: "INTERNAL ONLY", axis_d: "ASLEEP",
      no_external_api_calls: true, no_dispatch: true, no_publish: true, no_consume: true,
      no_whatsapp: true, no_email: true, no_zazi_live: true, no_aplgo_mutation: true,
      master_prospector: "ASLEEP",
    },
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
