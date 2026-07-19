-- Step 6A: Traffic Gate flag-flip approval flow (two-key)
-- 1. Extend approval_type CHECK + relax source_* NOT NULL for governance approvals
-- 2. Seed policy for platform_flag_flip (admin + governance_reviewer)
-- 3. RPC: vos_execute_platform_flag_flip — post-second-review flip with audit
-- 4. Insert pending approval for VANTO_OS_ENABLED=true

ALTER TABLE public.vos_approval_requests
  ALTER COLUMN source_dry_run_id DROP NOT NULL,
  ALTER COLUMN source_proposal_id DROP NOT NULL;

ALTER TABLE public.vos_approval_requests
  DROP CONSTRAINT IF EXISTS vos_appr_type_allowed;

ALTER TABLE public.vos_approval_requests
  ADD CONSTRAINT vos_appr_type_allowed CHECK (
    approval_type IN (
      'internal_note_approval',
      'review_status_approval',
      'no_action_confirmation',
      'platform_flag_flip'
    )
  );

INSERT INTO public.vos_approval_type_policies
  (approval_type, first_role, second_role, require_active_second, notes)
VALUES
  ('platform_flag_flip', 'admin', 'governance_reviewer', true,
   'Two-key governance approval to change a locked platform flag. Flip is executed by vos_execute_platform_flag_flip only after both keys are recorded.')
ON CONFLICT (approval_type) DO NOTHING;

-- Execute the flip AFTER the two-key approval has reached second_reviewed.
-- Caller must be admin. Idempotent: repeat calls are no-ops once flipped.
CREATE OR REPLACE FUNCTION public.vos_execute_platform_flag_flip(p_approval_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_appr   public.vos_approval_requests%ROWTYPE;
  v_flag_key text;
  v_target_value text;
  v_prev text;
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT * INTO v_appr FROM public.vos_approval_requests WHERE id = p_approval_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval_not_found';
  END IF;
  IF v_appr.approval_type <> 'platform_flag_flip' THEN
    RAISE EXCEPTION 'wrong_approval_type';
  END IF;
  IF v_appr.approval_status <> 'second_reviewed' THEN
    RAISE EXCEPTION 'not_second_reviewed';
  END IF;

  -- The dedupe_key encodes:  flag_flip:<FLAG_KEY>=<VALUE>
  IF v_appr.dedupe_key NOT LIKE 'flag_flip:%=%' THEN
    RAISE EXCEPTION 'malformed_dedupe_key';
  END IF;
  v_flag_key    := split_part(substring(v_appr.dedupe_key from 11), '=', 1);
  v_target_value := split_part(substring(v_appr.dedupe_key from 11), '=', 2);

  SELECT flag_value INTO v_prev
  FROM public.vos_platform_flags WHERE flag_key = v_flag_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'flag_not_found';
  END IF;

  IF v_prev = v_target_value THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'flag', v_flag_key, 'value', v_prev);
  END IF;

  UPDATE public.vos_platform_flags
    SET flag_value = v_target_value,
        updated_by = v_caller,
        updated_at = now()
    WHERE flag_key = v_flag_key;

  INSERT INTO public.vos_killswitch_log (scope, scope_target, prev_state, new_state, reason, changed_by)
  VALUES ('platform_flag', v_flag_key, v_prev, v_target_value,
          'Two-key approval ' || p_approval_id::text, v_caller);

  UPDATE public.vos_approval_requests
    SET approval_status = 'archived'
    WHERE id = p_approval_id;

  RETURN jsonb_build_object('ok', true, 'flag', v_flag_key, 'prev', v_prev, 'new', v_target_value);
END;
$$;

GRANT EXECUTE ON FUNCTION public.vos_execute_platform_flag_flip(uuid) TO authenticated;

-- Seed the pending approval for VANTO_OS_ENABLED = true (flag 1 of 5)
INSERT INTO public.vos_approval_requests (
  app_id, approval_type, approval_title, approval_summary,
  requested_by_system, requested_by_user, dedupe_key
)
VALUES (
  'vanto_os_console',
  'platform_flag_flip',
  'Governance: change locked flag VANTO_OS_ENABLED from false to true',
  'Two-key governance approval to change locked flag VANTO_OS_ENABLED from false to true. Approval alone does not modify anything. After both keys are recorded, an admin invokes vos_execute_platform_flag_flip which writes the new value and records the change in vos_killswitch_log.',
  'roadmap_step_6a',
  NULL,
  'flag_flip:VANTO_OS_ENABLED=true'
)
ON CONFLICT (dedupe_key) DO NOTHING;