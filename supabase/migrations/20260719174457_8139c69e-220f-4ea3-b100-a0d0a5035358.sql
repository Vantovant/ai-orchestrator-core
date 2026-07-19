
-- Solo-approve bypass: set a session-local flag so trigger guards skip two-key/self checks for super-admin single-operator mode.

CREATE OR REPLACE FUNCTION public.vos_solo_approve(p_approval_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_row public.vos_approval_requests%ROWTYPE;
  v_placeholder uuid := '00000000-0000-0000-0000-000000000001';
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

  -- Enable bypass flag for the trigger for this transaction only
  PERFORM set_config('vos.solo_bypass', 'on', true);

  UPDATE public.vos_approval_requests
     SET approval_status             = 'second_reviewed',
         reviewed_by                 = v_uid,
         reviewed_at                 = COALESCE(reviewed_at, now()),
         approver_jwt_subject        = COALESCE(approver_jwt_subject, v_uid::text),
         approver_role_at_time       = COALESCE(approver_role_at_time, 'admin'),
         second_reviewed_by          = v_uid,
         second_reviewed_at          = now(),
         second_approver_jwt_subject = v_uid::text,
         second_approver_role_at_time= COALESCE(second_approver_role_at_time, 'admin')
   WHERE id = p_approval_id;

  INSERT INTO public.vos_decision_log (approval_id, decision, actor_user_id, notes)
  VALUES (p_approval_id, 'solo_approved', v_uid,
          'Super-admin solo approval (two-key bypass, single operator mode).');

  RETURN jsonb_build_object('ok', true, 'approval_id', p_approval_id, 'status', 'second_reviewed', 'solo', true);
END;
$function$;

-- Update guard trigger to honour the solo bypass flag
CREATE OR REPLACE FUNCTION public.vos_approval_requests_5g_d_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  jwt_role text;
  v_solo text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'hard_delete_forbidden';
  END IF;

  BEGIN
    jwt_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  BEGIN
    v_solo := current_setting('vos.solo_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    v_solo := NULL;
  END;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND NEW.approval_status IN ('reviewed','second_reviewed')
       AND caller IS NOT NULL
       AND NOT public.has_active_role(caller, 'admin')
       AND NOT public.has_active_role(caller, 'governance_reviewer') THEN
      RAISE EXCEPTION 'caller_not_active_reviewer';
    END IF;

    IF NEW.approval_status = 'second_reviewed'
       AND OLD.approval_status <> 'second_reviewed'
       AND jwt_role = 'service_role' THEN
      RAISE EXCEPTION 'service_role_approval_blocked';
    END IF;

    IF NEW.approval_status = 'second_reviewed' AND OLD.approval_status <> 'second_reviewed' THEN
      IF NEW.reviewed_by IS NULL OR NEW.second_reviewed_by IS NULL THEN
        RAISE EXCEPTION 'two_key_required';
      END IF;

      -- Two-key checks are skipped when solo bypass is active (super-admin single-operator mode)
      IF v_solo IS DISTINCT FROM 'on' THEN
        IF NEW.reviewed_by = NEW.second_reviewed_by THEN
          RAISE EXCEPTION 'two_key_same_user';
        END IF;
        IF NEW.requested_by_user IS NOT NULL
           AND (NEW.requested_by_user = NEW.reviewed_by
             OR NEW.requested_by_user = NEW.second_reviewed_by) THEN
          RAISE EXCEPTION 'self_approval_blocked';
        END IF;
        IF OLD.last_modified_by IS NOT NULL
           AND OLD.last_modified_by = NEW.second_reviewed_by THEN
          RAISE EXCEPTION 'transitive_self_approval_blocked';
        END IF;
      END IF;

      IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
        RAISE EXCEPTION 'approval_expired';
      END IF;
      IF NEW.invalidated_by_revocation THEN
        RAISE EXCEPTION 'approval_invalidated_by_revocation';
      END IF;

      IF NEW.second_approver_role_at_time IS NULL THEN
        IF public.has_active_role(NEW.second_reviewed_by, 'admin') THEN
          NEW.second_approver_role_at_time := 'admin';
        ELSIF public.has_active_role(NEW.second_reviewed_by, 'governance_reviewer') THEN
          NEW.second_approver_role_at_time := 'governance_reviewer';
        ELSE
          RAISE EXCEPTION 'second_reviewer_role_invalid';
        END IF;
      END IF;
      IF NEW.second_approver_jwt_subject IS NULL THEN
        NEW.second_approver_jwt_subject := NEW.second_reviewed_by::text;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
