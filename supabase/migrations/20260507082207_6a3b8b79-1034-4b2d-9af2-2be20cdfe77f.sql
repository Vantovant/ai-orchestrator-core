CREATE OR REPLACE FUNCTION public.vos_step5d_create_rehearsal()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_proposal_id  uuid;
  v_dry_run_id   uuid;
  v_approval_id  uuid;
  v_rehearsal_id uuid;
  v_ts           text := to_char(now(), 'YYYYMMDDHH24MISS');
  v_dedupe_p     text;
  v_dedupe_d     text;
  v_dedupe_a     text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_role(v_caller, 'admin') THEN RAISE EXCEPTION 'admin_only'; END IF;

  v_dedupe_p := encode(extensions.digest('step5d|proposal|' || v_ts || '|' || v_caller::text, 'sha256'), 'hex');
  v_dedupe_d := encode(extensions.digest('step5d|dry_run|'  || v_ts || '|' || v_caller::text, 'sha256'), 'hex');
  v_dedupe_a := encode(extensions.digest('step5d|approval|' || v_ts || '|' || v_caller::text, 'sha256'), 'hex');

  -- Proposal
  INSERT INTO public.vos_proposal_queue (
    app_id, intelligence_category, risk_level, proposal_type,
    proposal_title, proposal_summary, confidence, reason,
    safety_blocked, would_dispatch, dispatch_blocked,
    created_by_system, dedupe_key
  ) VALUES (
    'vanto_os_console', 'governance', 'low', 'internal_admin_note_record_proposal',
    'Step 5D Two-Key Rehearsal Proposal',
    'Internal governance rehearsal to prove two distinct human keys can complete an approval. No external action.',
    'high', 'Two-key repeatability proof. Internal only.',
    true, false, true,
    'step5d_console', v_dedupe_p
  ) RETURNING id INTO v_proposal_id;

  -- Dry run
  INSERT INTO public.vos_dry_run_actions (
    source_proposal_id, app_id, dry_run_type,
    dry_run_title, dry_run_summary, simulated_target,
    simulated_payload_redacted,
    would_execute, execution_blocked, dispatch_blocked, safety_blocked,
    created_by_system, dedupe_key
  ) VALUES (
    v_proposal_id, 'vanto_os_console', 'internal_admin_note_record_dry_run',
    'Step 5D Two-Key Rehearsal Dry Run',
    'Simulated internal note recording. No external write performed.',
    'none',
    '{"redacted":true,"target":"none"}'::jsonb,
    false, true, true, true,
    'step5d_console', v_dedupe_d
  ) RETURNING id INTO v_dry_run_id;

  -- Approval request
  INSERT INTO public.vos_approval_requests (
    source_dry_run_id, source_proposal_id, app_id,
    approval_type, approval_title, approval_summary,
    requested_by_system, requested_by_user,
    safety_blocked, would_execute, execution_blocked,
    dispatch_blocked, approval_does_not_execute,
    expires_at, dedupe_key
  ) VALUES (
    v_dry_run_id, v_proposal_id, 'vanto_os_console',
    'internal_admin_note_record',
    'Step 5D Two-Key Rehearsal Approval',
    'Approval request for two-key rehearsal. Approval does not execute. Internal only.',
    'step5d_console', v_caller,
    true, false, true,
    true, true,
    now() + interval '24 hours', v_dedupe_a
  ) RETURNING id INTO v_approval_id;

  -- Rehearsal log
  INSERT INTO public.vos_role_rehearsal_log (
    created_by, rehearsal_kind, target_user_redacted, status, notes
  ) VALUES (
    v_caller, 'live_two_key',
    encode(extensions.digest(v_approval_id::text, 'sha256'), 'hex'),
    'started',
    'Step 5D Path A1 rehearsal started; awaiting two-key authenticated reviews.'
  ) RETURNING id INTO v_rehearsal_id;

  RETURN jsonb_build_object(
    'approval_id',  v_approval_id,
    'proposal_id',  v_proposal_id,
    'dry_run_id',   v_dry_run_id,
    'rehearsal_id', v_rehearsal_id,
    'created_by',   v_caller
  );
END;
$function$;