CREATE TABLE IF NOT EXISTS public.vos_approval_type_policies (
  approval_type text PRIMARY KEY,
  first_role    public.app_role NOT NULL,
  second_role   public.app_role NOT NULL,
  require_active_second boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vos_approval_type_policies TO authenticated;
GRANT ALL    ON public.vos_approval_type_policies TO service_role;

ALTER TABLE public.vos_approval_type_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read approval type policies" ON public.vos_approval_type_policies;
CREATE POLICY "admins read approval type policies"
  ON public.vos_approval_type_policies
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.vos_approval_type_policies (approval_type, first_role, second_role, require_active_second, notes)
VALUES
  ('internal_note_approval',   'admin', 'governance_reviewer', true, 'Two-key internal note governance record.'),
  ('review_status_approval',   'admin', 'governance_reviewer', true, 'Two-key review-status governance record.'),
  ('no_action_confirmation',   'admin', 'governance_reviewer', true, 'Two-key no-action confirmation record.')
ON CONFLICT (approval_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.vos_generic_first_review(p_approval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_appr   public.vos_approval_requests%ROWTYPE;
  v_pol    public.vos_approval_type_policies%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  SELECT * INTO v_appr FROM public.vos_approval_requests WHERE id = p_approval_id;
  IF v_appr IS NULL THEN RAISE EXCEPTION 'approval_not_found'; END IF;

  SELECT * INTO v_pol FROM public.vos_approval_type_policies
   WHERE approval_type = v_appr.approval_type AND active = true;
  IF v_pol IS NULL THEN RAISE EXCEPTION 'no_policy_for_approval_type: %', v_appr.approval_type; END IF;

  IF NOT public.has_role(v_caller, v_pol.first_role) THEN
    RAISE EXCEPTION 'first_reviewer_role_required: %', v_pol.first_role;
  END IF;
  IF v_appr.approval_status <> 'requested' THEN
    RAISE EXCEPTION 'invalid_state_for_first_review: %', v_appr.approval_status;
  END IF;
  IF v_appr.expires_at IS NOT NULL AND v_appr.expires_at <= now() THEN
    RAISE EXCEPTION 'approval_expired';
  END IF;
  IF v_appr.invalidated_by_revocation THEN RAISE EXCEPTION 'invalidated_by_revocation'; END IF;
  IF v_appr.requested_by_user IS NOT NULL AND v_appr.requested_by_user = v_caller THEN
    RAISE EXCEPTION 'self_approval_blocked';
  END IF;

  UPDATE public.vos_approval_requests
     SET approval_status       = 'reviewed',
         reviewed_by           = v_caller,
         reviewed_at           = now(),
         approver_role_at_time = v_pol.first_role::text,
         approver_jwt_subject  = v_caller::text,
         last_modified_by      = v_caller,
         last_modified_at      = now()
   WHERE id = p_approval_id;

  RETURN jsonb_build_object('approval_id', p_approval_id, 'approval_type', v_appr.approval_type,
    'reviewed_by', v_caller, 'first_role', v_pol.first_role, 'status', 'reviewed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.vos_generic_second_review(p_approval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_appr   public.vos_approval_requests%ROWTYPE;
  v_pol    public.vos_approval_type_policies%ROWTYPE;
  v_ok     boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  SELECT * INTO v_appr FROM public.vos_approval_requests WHERE id = p_approval_id;
  IF v_appr IS NULL THEN RAISE EXCEPTION 'approval_not_found'; END IF;

  SELECT * INTO v_pol FROM public.vos_approval_type_policies
   WHERE approval_type = v_appr.approval_type AND active = true;
  IF v_pol IS NULL THEN RAISE EXCEPTION 'no_policy_for_approval_type: %', v_appr.approval_type; END IF;

  IF v_pol.require_active_second THEN
    v_ok := public.has_active_role(v_caller, v_pol.second_role);
  ELSE
    v_ok := public.has_role(v_caller, v_pol.second_role);
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'second_reviewer_role_required: %', v_pol.second_role;
  END IF;

  IF v_appr.approval_status <> 'reviewed' THEN
    RAISE EXCEPTION 'invalid_state_for_second_review: %', v_appr.approval_status;
  END IF;
  IF v_appr.reviewed_by IS NULL THEN RAISE EXCEPTION 'first_reviewer_missing'; END IF;
  IF v_appr.reviewed_by = v_caller THEN RAISE EXCEPTION 'two_key_same_user'; END IF;
  IF v_appr.requested_by_user IS NOT NULL AND v_appr.requested_by_user = v_caller THEN
    RAISE EXCEPTION 'self_approval_blocked';
  END IF;
  IF v_appr.expires_at IS NOT NULL AND v_appr.expires_at <= now() THEN
    RAISE EXCEPTION 'approval_expired';
  END IF;
  IF v_appr.invalidated_by_revocation THEN RAISE EXCEPTION 'invalidated_by_revocation'; END IF;

  UPDATE public.vos_approval_requests
     SET approval_status              = 'second_reviewed',
         second_reviewed_by           = v_caller,
         second_reviewed_at           = now(),
         second_approver_role_at_time = v_pol.second_role::text,
         second_approver_jwt_subject  = v_caller::text,
         last_modified_by             = v_caller,
         last_modified_at             = now()
   WHERE id = p_approval_id;

  RETURN jsonb_build_object('approval_id', p_approval_id, 'approval_type', v_appr.approval_type,
    'second_reviewed_by', v_caller, 'second_role', v_pol.second_role, 'status', 'second_reviewed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.vos_generic_reject(p_approval_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_appr   public.vos_approval_requests%ROWTYPE;
  v_pol    public.vos_approval_type_policies%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;

  SELECT * INTO v_appr FROM public.vos_approval_requests WHERE id = p_approval_id;
  IF v_appr IS NULL THEN RAISE EXCEPTION 'approval_not_found'; END IF;

  SELECT * INTO v_pol FROM public.vos_approval_type_policies
   WHERE approval_type = v_appr.approval_type AND active = true;
  IF v_pol IS NULL THEN RAISE EXCEPTION 'no_policy_for_approval_type: %', v_appr.approval_type; END IF;

  IF NOT (public.has_role(v_caller, v_pol.first_role) OR public.has_role(v_caller, v_pol.second_role)) THEN
    RAISE EXCEPTION 'reviewer_role_required';
  END IF;
  IF v_appr.approval_status NOT IN ('requested','reviewed') THEN
    RAISE EXCEPTION 'invalid_state_for_reject: %', v_appr.approval_status;
  END IF;

  UPDATE public.vos_approval_requests
     SET approval_status  = 'rejected',
         rejection_reason = p_reason,
         last_modified_by = v_caller,
         last_modified_at = now()
   WHERE id = p_approval_id;

  RETURN jsonb_build_object('approval_id', p_approval_id, 'status', 'rejected', 'rejected_by', v_caller);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vos_generic_first_review(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.vos_generic_second_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vos_generic_reject(uuid, text)  TO authenticated;