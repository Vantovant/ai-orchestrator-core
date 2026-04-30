// Step 5E test runner — verifies vos_crm_internal_notes archive guard.
// 18 assertions. INERT. No external writes. Cleans up its fixtures
// (except vos_crm_internal_notes rows which cannot be hard-deleted).

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

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sbAnon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

  const results: Record<string, { pass: boolean; expected: string; actual: string }> = {};
  const setResult = (id: string, name: string, expected: string, actual: string, pass: boolean) => {
    results[`${id}_${name}`] = { pass, expected, actual };
  };

  const TAG = `test5e_${crypto.randomUUID().slice(0,8)}`;
  const cleanup: Array<{ table: string; ids: string[] }> = [];

  const { data: otherAdmins } = await sb.from("user_roles")
    .select("user_id").eq("role","admin").neq("user_id", userA).limit(1);
  const userB = otherAdmins?.[0]?.user_id ?? crypto.randomUUID();

  let proposalId: string|null=null, dryRunId: string|null=null, approvalId: string|null=null;
  let manualActionId: string|null=null, draftId: string|null=null;

  async function buildChain(): Promise<void> {
    const { data: prop } = await sb.from("vos_proposal_queue").insert({
      app_id: TAG, event_name: "test_event", intelligence_category: "informational", risk_level: "low",
      proposal_type: "manual_review", proposal_title: "Step5E test proposal",
      proposal_summary: "Inert test fixture for Step 5E archive.",
      confidence: "high", reason: "step5e_runner", proposal_status: "proposed",
      safety_blocked: true, would_dispatch: false, dispatch_blocked: true,
      created_by_system: "step5e-archive-test-runner",
      dedupe_key: `${TAG}-prop-${crypto.randomUUID()}`,
    }).select("id").maybeSingle();
    proposalId = prop?.id ?? null;
    if (proposalId) cleanup.push({ table: "vos_proposal_queue", ids: [proposalId] });

    if (!proposalId) return;
    const { data: d } = await sb.from("vos_dry_run_actions").insert({
      source_proposal_id: proposalId, app_id: TAG, event_name: "test_event",
      dry_run_type: "manual_review_preview", dry_run_title: "Step5E dry run",
      dry_run_summary: "Inert dry-run fixture for Step 5E archive.",
      simulated_target: "internal", simulated_payload_redacted: {},
      would_execute: false, execution_blocked: true, dispatch_blocked: true, safety_blocked: true,
      dry_run_status: "generated", created_by_system: "step5e-archive-test-runner",
      dedupe_key: `${TAG}-dr-${crypto.randomUUID()}`,
    }).select("id").maybeSingle();
    dryRunId = d?.id ?? null;
    if (dryRunId) cleanup.push({ table: "vos_dry_run_actions", ids: [dryRunId] });

    if (!dryRunId) return;
    const { data: a } = await sb.from("vos_approval_requests").insert({
      source_dry_run_id: dryRunId, source_proposal_id: proposalId, app_id: TAG, event_name: "test_event",
      approval_type: "review_status_approval",
      approval_title: "Step5E approval", approval_summary: "Inert approval fixture for Step 5E archive.",
      approval_status: "requested", requested_by_system: "step5e-archive-test-runner",
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

    if (!approvalId) return;
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

    if (!manualActionId) return;
    const dedupeD = await sha256(`${manualActionId}:crm:crm_note_draft_internal:5e`);
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
      dedupe_key: dedupeD,
    }).select("id").maybeSingle();
    draftId = dr?.id ?? null;
    if (draftId) cleanup.push({ table: "vos_integration_action_drafts", ids: [draftId] });
  }

  async function createNote(callerAuth: string, suffix: string): Promise<string|null> {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/vos-crm-internal-note-recorder`, {
      method: "POST",
      headers: { "Authorization": callerAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        source_integration_draft_id: draftId,
        note_body: `Internal observation by Step 5E runner ${suffix}.`,
        note_kind: "internal_observation",
      }),
    });
    const j = await r.json();
    const id = j?.record?.id ?? null;
    if (id) cleanup.push({ table: "vos_crm_internal_notes", ids: [id] });
    return id;
  }

  try {
    await buildChain();
    if (!draftId) {
      return new Response(JSON.stringify({
        ok: false, verdict: "HOLD — fixture chain failed to build", score: "0/18",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const callerAuth = gate.auth!;
    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: callerAuth } } });

    {
      const id = await createNote(callerAuth, "A1b");
      if (!id) {
        setResult("A1","admin_archives_recorded","success","note_creation_failed", false);
      } else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Pilot completed; observation no longer needed.",
        }).eq("id", id).eq("note_status", "recorded");
        setResult("A1","admin_archives_recorded","no_error", error?.message?.slice(0,120) ?? "ok", !error);
      }
    }

    {
      const origId = await createNote(callerAuth, "A2-orig");
      if (!origId) {
        setResult("A2","admin_archives_corrected","success","orig_creation_failed", false);
      } else {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/vos-crm-internal-note-recorder`, {
          method: "POST",
          headers: { "Authorization": callerAuth, "Content-Type": "application/json" },
          body: JSON.stringify({
            source_integration_draft_id: draftId,
            note_body: `Internal correction for A2 by Step 5E runner.`,
            note_kind: "internal_correction",
            corrects_note_id: origId,
          }),
        });
        const cj = await r.json();
        const corrId = cj?.record?.id ?? null;
        if (corrId) cleanup.push({ table: "vos_crm_internal_notes", ids: [corrId] });

        const t1 = await sbCaller.from("vos_crm_internal_notes").update({ note_status: "corrected" })
          .eq("id", origId).eq("note_status", "recorded");
        const t2 = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Corrected and now archived for audit closure.",
        }).eq("id", origId).eq("note_status", "corrected");
        const ok = !t1.error && !t2.error && !!corrId;
        const actual = t1.error?.message ?? t2.error?.message ?? (corrId ? "ok" : "no_correction_sibling");
        setResult("A2","admin_archives_corrected","no_error", actual.slice(0,120), ok);
      }
    }

    {
      const id = await createNote(callerAuth, "A3");
      if (!id) {
        setResult("A3","non_admin_blocked_rls","RLS denial","note_creation_failed", false);
      } else {
        const { error, data } = await sbAnon.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Anon attempt should fail.",
        }).eq("id", id).eq("note_status", "recorded").select("id");
        const blocked = !!error || !data || data.length === 0;
        setResult("A3","non_admin_blocked_rls","rls_blocks", error?.message?.slice(0,120) ?? `rows=${data?.length ?? 0}`, blocked);
      }
    }

    {
      const id = await createNote(callerAuth, "A4");
      if (!id) {
        setResult("A4","guard_blocks_non_admin","archive_admin_only","note_creation_failed", false);
      } else {
        const { error } = await sb.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Service-role attempt; should be blocked by guard.",
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /archive_admin_only/.test(error.message);
        setResult("A4","guard_blocks_non_admin","archive_admin_only", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A5");
      if (!id) { setResult("A5","null_reason_rejected","archive_metadata_required","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: null as any,
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /archive_metadata_required/.test(error.message);
        setResult("A5","null_reason_rejected","archive_metadata_required", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A6");
      if (!id) { setResult("A6","empty_reason_rejected","archive_metadata_required","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "",
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /archive_metadata_required/.test(error.message);
        setResult("A6","empty_reason_rejected","archive_metadata_required", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A7");
      if (!id) { setResult("A7","whitespace_reason_rejected","archive_metadata_required","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "     ",
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /archive_metadata_required/.test(error.message);
        setResult("A7","whitespace_reason_rejected","archive_metadata_required", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A8");
      if (!id) { setResult("A8","short_reason_rejected","archive_reason_too_short","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "abcd",
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /archive_reason_too_short/.test(error.message);
        setResult("A8","short_reason_rejected","archive_reason_too_short", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A9");
      if (!id) { setResult("A9","banned_send_rejected","forbidden_archive_wording","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Please send the audit closure to records.",
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /forbidden_archive_wording/.test(error.message);
        setResult("A9","banned_send_rejected","forbidden_archive_wording: token=send", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A10");
      if (!id) { setResult("A10","banned_dispatch_rejected","forbidden_archive_wording","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "We will dispatch the closure soon.",
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /forbidden_archive_wording/.test(error.message);
        setResult("A10","banned_dispatch_rejected","forbidden_archive_wording: token=dispatch", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A11");
      if (!id) { setResult("A11","email_pii_rejected","pii_in_archive_reason: email","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Closing per request from user@example.com.",
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /pii_in_archive_reason: email/.test(error.message);
        setResult("A11","email_pii_rejected","pii_in_archive_reason: email", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A12");
      if (!id) { setResult("A12","sa_id_pii_rejected","pii_in_archive_reason: sa_id","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Audit closed: 8001015009087 referenced.",
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /pii_in_archive_reason: sa_id/.test(error.message);
        setResult("A12","sa_id_pii_rejected","pii_in_archive_reason: sa_id", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A13");
      if (!id) { setResult("A13","phone_pii_rejected","pii_in_archive_reason: phone","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Closure logged. Reach via +27 82 555 1234 if needed.",
        }).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /pii_in_archive_reason: phone/.test(error.message);
        setResult("A13","phone_pii_rejected","pii_in_archive_reason: phone_*", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A14");
      if (!id) { setResult("A14","archived_to_recorded_blocked","invalid_status_transition","note_creation_failed", false); }
      else {
        await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Audit closure for A14 path.",
        }).eq("id", id).eq("note_status", "recorded");
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({ note_status: "recorded" }).eq("id", id);
        const matches = !!error && /invalid_status_transition/.test(error.message);
        setResult("A14","archived_to_recorded_blocked","invalid_status_transition", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A15");
      if (!id) { setResult("A15","archived_to_corrected_blocked","invalid_status_transition","note_creation_failed", false); }
      else {
        await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Audit closure for A15 path.",
        }).eq("id", id).eq("note_status", "recorded");
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({ note_status: "corrected" }).eq("id", id);
        const matches = !!error && /invalid_status_transition/.test(error.message);
        setResult("A15","archived_to_corrected_blocked","invalid_status_transition", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A16");
      if (!id) { setResult("A16","hard_delete_blocked","hard_delete_forbidden","note_creation_failed", false); }
      else {
        const { error } = await sb.from("vos_crm_internal_notes").delete().eq("id", id);
        const matches = !!error && /hard_delete_forbidden/.test(error.message);
        setResult("A16","hard_delete_blocked","hard_delete_forbidden", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A17");
      if (!id) { setResult("A17","note_body_immutable","immutable_column_modified","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Audit closure for A17 path.",
          note_body: "ATTEMPTED MUTATION",
        } as any).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /immutable_column_modified/.test(error.message);
        setResult("A17","note_body_immutable","immutable_column_modified", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

    {
      const id = await createNote(callerAuth, "A18");
      if (!id) { setResult("A18","safety_flags_immutable","immutable_column_modified","note_creation_failed", false); }
      else {
        const { error } = await sbCaller.from("vos_crm_internal_notes").update({
          note_status: "archived", archived_at: new Date().toISOString(),
          archived_by: userA, archive_reason: "Audit closure for A18 path.",
          customer_visible: true, axis_a_snapshot: "GREEN",
        } as any).eq("id", id).eq("note_status", "recorded");
        const matches = !!error && /immutable_column_modified/.test(error.message);
        setResult("A18","safety_flags_immutable","immutable_column_modified", error?.message?.slice(0,120) ?? "no_error", matches);
      }
    }

  } finally {
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
        if (t === "vos_crm_internal_notes") continue;
        await sb.from(t).delete().in("id", ids);
      }
    }
  }

  const tests: Array<{ id: string; name: string; expected: string; actual: string; pass: boolean }> = [];
  for (const [k, v] of Object.entries(results)) {
    const [id, ...rest] = k.split("_");
    tests.push({ id, name: rest.join("_"), expected: v.expected, actual: v.actual, pass: v.pass });
  }
  tests.sort((a,b) => parseInt(a.id.replace("A","")) - parseInt(b.id.replace("A","")));

  const passed = tests.filter(t => t.pass).length;
  const total = tests.length;
  const verdict = passed === total
    ? "STEP 5E ARCHIVE BUILD COMPLETE"
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
