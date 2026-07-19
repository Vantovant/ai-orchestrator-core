
-- Solo-approve RPC: admin-only shortcut that stamps both first and second review
-- with the same admin identity. Intended as a temporary super-admin bypass of the
-- two-key rule so a single operator can drive approvals end-to-end.
-- Governance invariants preserved: does NOT execute, dispatch, or send anything.
-- Actual side-effects (e.g. platform_flag_flip) still require the separate
-- vos_execute_* RPC, which only runs when approval_status = 'second_reviewed'.

CREATE OR REPLACE FUNCTION public.vos_solo_approve(p_approval_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_row public.vos_approval_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT public.has_role(v_uid, 'admin'::app_role) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT * INTO v_row FROM public.vos_approval_requests WHERE id = p_approval_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval_not_found';
  END IF;

  IF v_row.approval_status NOT IN ('requested','reviewed') THEN
    RAISE EXCEPTION 'invalid_status_for_solo_approve: %', v_row.approval_status;
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RAISE EXCEPTION 'approval_expired';
  END IF;

  UPDATE public.vos_approval_requests
     SET approval_status        = 'second_reviewed',
         reviewed_by            = COALESCE(reviewed_by, v_uid),
         reviewed_at            = COALESCE(reviewed_at, now()),
         approver_jwt_subject   = COALESCE(approver_jwt_subject, v_uid::text),
         second_reviewed_by     = v_uid,
         second_reviewed_at     = now(),
         second_approver_jwt_subject = v_uid::text
   WHERE id = p_approval_id;

  INSERT INTO public.vos_decision_log (approval_id, decision, actor_user_id, notes)
  VALUES (p_approval_id, 'solo_approved', v_uid,
          'Super-admin solo approval (two-key bypass, single operator mode).');

  RETURN jsonb_build_object('ok', true, 'approval_id', p_approval_id, 'status', 'second_reviewed');
END;
$$;

REVOKE ALL ON FUNCTION public.vos_solo_approve(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.vos_solo_approve(uuid) TO authenticated;
