
-- Fix D: literal-only patch (no schema change, no data mutation)

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

  INSERT INTO public.vos_proposal_queue (
    app_id, intelligence_category, risk_level, proposal_type,
    proposal_title, proposal_summary, confidence, reason,
    safety_blocked, would_dispatch, dispatch_blocked,
    created_by_system, dedupe_key
  ) VALUES (
    'vanto_os_console', 'governance', 'low', 'admin_note_draft',
    'Step 5D Two-Key Rehearsal Proposal',
    'Internal governance rehearsal to prove two distinct human keys can complete an approval. No external action.',
    'high', 'Two-key repeatability proof. Internal only.',
    true, false, true,
    'step5d_console', v_dedupe_p
  ) RETURNING id INTO v_proposal_id;

  INSERT INTO public.vos_dry_run_actions (
    source_proposal_id, app_id, dry_run_type,
    dry_run_title, dry_run_summary, simulated_target,
    simulated_payload_redacted,
    would_execute, execution_blocked, dispatch_blocked, safety_blocked,
    created_by_system, dedupe_key
  ) VALUES (
    v_proposal_id, 'vanto_os_console', 'admin_note_preview',
    'Step 5D Two-Key Rehearsal Dry Run',
    'Simulated internal note recording. No external write performed.',
    'none',
    '{"redacted":true,"target":"none"}'::jsonb,
    false, true, true, true,
    'step5d_console', v_dedupe_d
  ) RETURNING id INTO v_dry_run_id;

  INSERT INTO public.vos_approval_requests (
    source_dry_run_id, source_proposal_id, app_id,
    approval_type, approval_title, approval_summary,
    requested_by_system, requested_by_user,
    safety_blocked, would_execute, execution_blocked,
    dispatch_blocked, approval_does_not_execute,
    expires_at, dedupe_key
  ) VALUES (
    v_dry_run_id, v_proposal_id, 'vanto_os_console',
    'internal_note_approval',
    'Step 5D Two-Key Rehearsal Approval',
    'Approval request for two-key rehearsal. Approval does not execute. Internal only.',
    'step5d_console', v_caller,
    true, false, true,
    true, true,
    now() + interval '24 hours', v_dedupe_a
  ) RETURNING id INTO v_approval_id;

  INSERT INTO public.vos_role_rehearsal_log (
    created_by, rehearsal_kind, target_user_redacted, status, notes
  ) VALUES (
    v_caller, 'live_subtx',
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

CREATE OR REPLACE FUNCTION public.vos_step5d_first_review(p_approval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_appr   public.vos_approval_requests%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_role(v_caller, 'admin') THEN RAISE EXCEPTION 'admin_only'; END IF;

  SELECT * INTO v_appr FROM public.vos_approval_requests WHERE id = p_approval_id;
  IF v_appr IS NULL THEN RAISE EXCEPTION 'approval_not_found'; END IF;
  IF v_appr.app_id <> 'vanto_os_console' OR v_appr.approval_type <> 'internal_note_approval' THEN
    RAISE EXCEPTION 'not_a_step5d_approval';
  END IF;
  IF v_appr.approval_status <> 'requested' THEN
    RAISE EXCEPTION 'invalid_state_for_first_review: %', v_appr.approval_status;
  END IF;
  IF v_appr.expires_at <= now() THEN RAISE EXCEPTION 'approval_expired'; END IF;

  UPDATE public.vos_approval_requests
     SET approval_status            = 'reviewed',
         reviewed_by                = v_caller,
         reviewed_at                = now(),
         approver_role_at_time      = 'admin',
         approver_jwt_subject       = v_caller::text,
         last_modified_by           = v_caller,
         last_modified_at           = now()
   WHERE id = p_approval_id;

  RETURN jsonb_build_object('approval_id', p_approval_id, 'reviewed_by', v_caller, 'status', 'reviewed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.vos_step5d_second_review(p_approval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_appr   public.vos_approval_requests%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_active_role(v_caller, 'governance_reviewer') THEN
    RAISE EXCEPTION 'governance_reviewer_only';
  END IF;

  SELECT * INTO v_appr FROM public.vos_approval_requests WHERE id = p_approval_id;
  IF v_appr IS NULL THEN RAISE EXCEPTION 'approval_not_found'; END IF;
  IF v_appr.app_id <> 'vanto_os_console' OR v_appr.approval_type <> 'internal_note_approval' THEN
    RAISE EXCEPTION 'not_a_step5d_approval';
  END IF;
  IF v_appr.approval_status <> 'reviewed' THEN
    RAISE EXCEPTION 'invalid_state_for_second_review: %', v_appr.approval_status;
  END IF;
  IF v_appr.reviewed_by IS NULL THEN RAISE EXCEPTION 'first_reviewer_missing'; END IF;
  IF v_appr.reviewed_by = v_caller THEN RAISE EXCEPTION 'two_key_same_user'; END IF;
  IF v_appr.expires_at <= now() THEN RAISE EXCEPTION 'approval_expired'; END IF;
  IF v_appr.invalidated_by_revocation THEN RAISE EXCEPTION 'invalidated_by_revocation'; END IF;

  UPDATE public.vos_approval_requests
     SET approval_status              = 'second_reviewed',
         second_reviewed_by           = v_caller,
         second_reviewed_at           = now(),
         second_approver_role_at_time = 'governance_reviewer',
         second_approver_jwt_subject  = v_caller::text,
         last_modified_by             = v_caller,
         last_modified_at             = now()
   WHERE id = p_approval_id;

  UPDATE public.vos_role_rehearsal_log
     SET status = 'completed',
         overall_pass = true,
         assertions = jsonb_build_array(
           jsonb_build_object('id','T4','name','two_distinct_humans','expected',true,'observed',true,'pass',true)
         ),
         notes = 'Step 5D Path A1 completed: two distinct authenticated humans recorded.'
   WHERE rehearsal_kind = 'live_subtx'
     AND target_user_redacted = encode(extensions.digest(p_approval_id::text, 'sha256'), 'hex')
     AND status = 'started';

  RETURN jsonb_build_object('approval_id', p_approval_id, 'second_reviewed_by', v_caller, 'status', 'second_reviewed');
END;
$function$;
