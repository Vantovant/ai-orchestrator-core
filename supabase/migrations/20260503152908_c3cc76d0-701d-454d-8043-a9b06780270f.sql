CREATE OR REPLACE FUNCTION public.vos_simulate_revocation(_target_user_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller                uuid := auth.uid();
  v_flag_enabled          text;
  v_target_exists         boolean;
  v_target_is_admin       boolean;
  v_target_has_gov        boolean;
  v_rehearsal_id          uuid;
  v_assertions            jsonb := '[]'::jsonb;
  v_active_mid            boolean;
  v_revoked_mid           timestamptz;
  v_log_count_mid         int;
  v_active_after          boolean;
  v_irreversible_blocked  boolean := false;
  v_log_append_only       boolean := false;
  v_user_roles_after      int;
  v_log_after             int;
  v_overall               boolean := true;
  v_err_text              text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_role(v_caller,'admin') THEN RAISE EXCEPTION 'admin_only'; END IF;

  IF _target_user_id = v_caller THEN RAISE EXCEPTION 'cannot_target_self'; END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT flag_value INTO v_flag_enabled FROM public.vos_platform_flags WHERE flag_key = 'REHEARSAL_HELPER_ENABLED';
  IF v_flag_enabled IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'rehearsal_helper_disabled';
  END IF;

  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = _target_user_id) INTO v_target_exists;
  IF NOT v_target_exists THEN RAISE EXCEPTION 'target_not_in_auth_users'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin' AND revoked_at IS NULL) INTO v_target_is_admin;
  IF v_target_is_admin THEN RAISE EXCEPTION 'target_is_active_admin'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _target_user_id AND role = 'governance_reviewer') INTO v_target_has_gov;
  IF v_target_has_gov THEN RAISE EXCEPTION 'target_already_has_governance_reviewer'; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('vos_simulate_revocation')) THEN
    RAISE EXCEPTION 'concurrent_rehearsal_blocked';
  END IF;

  INSERT INTO public.vos_role_rehearsal_log (created_by, rehearsal_kind, target_user_redacted, status)
  VALUES (v_caller, 'live_subtx', encode(extensions.digest(_target_user_id::text,'sha256'),'hex'), 'started')
  RETURNING id INTO v_rehearsal_id;

  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, 'governance_reviewer');

    SELECT public.has_active_role(_target_user_id, 'governance_reviewer') INTO v_active_mid;
    v_assertions := v_assertions || jsonb_build_object('id','T7','name','active_role_true_mid','expected',true,'observed',v_active_mid,'pass',v_active_mid);
    IF NOT v_active_mid THEN v_overall := false; END IF;

    PERFORM public.revoke_user_role(_target_user_id, 'governance_reviewer', _reason);

    SELECT revoked_at INTO v_revoked_mid FROM public.user_roles
      WHERE user_id = _target_user_id AND role = 'governance_reviewer';
    v_assertions := v_assertions || jsonb_build_object('id','T9','name','revoked_at_populated','expected','not_null','observed', (v_revoked_mid IS NOT NULL),'pass', v_revoked_mid IS NOT NULL);
    IF v_revoked_mid IS NULL THEN v_overall := false; END IF;

    SELECT count(*) INTO v_log_count_mid FROM public.role_revocation_log WHERE target_user_id = _target_user_id;
    v_assertions := v_assertions || jsonb_build_object('id','T11','name','revocation_log_appended_mid','expected','>=1','observed',v_log_count_mid,'pass', v_log_count_mid >= 1);
    IF v_log_count_mid < 1 THEN v_overall := false; END IF;

    SELECT public.has_active_role(_target_user_id, 'governance_reviewer') INTO v_active_after;
    v_assertions := v_assertions || jsonb_build_object('id','T13','name','active_role_false_after_revoke','expected',false,'observed',v_active_after,'pass', NOT v_active_after);
    IF v_active_after THEN v_overall := false; END IF;

    BEGIN
      UPDATE public.user_roles SET revoked_at = NULL
        WHERE user_id = _target_user_id AND role = 'governance_reviewer';
      v_irreversible_blocked := false;
    EXCEPTION WHEN OTHERS THEN
      v_irreversible_blocked := true;
    END;
    v_assertions := v_assertions || jsonb_build_object('id','T10','name','revocation_irreversible','expected',true,'observed',v_irreversible_blocked,'pass',v_irreversible_blocked);
    IF NOT v_irreversible_blocked THEN v_overall := false; END IF;

    BEGIN
      UPDATE public.role_revocation_log SET reason_text = 'rehearsal_tamper_attempt'
        WHERE target_user_id = _target_user_id;
      v_log_append_only := false;
    EXCEPTION WHEN OTHERS THEN
      v_log_append_only := true;
    END;
    v_assertions := v_assertions || jsonb_build_object('id','T12','name','revocation_log_append_only','expected',true,'observed',v_log_append_only,'pass',v_log_append_only);
    IF NOT v_log_append_only THEN v_overall := false; END IF;

    RAISE EXCEPTION 'rehearsal_rollback';
  EXCEPTION WHEN OTHERS THEN
    v_err_text := SQLERRM;
    IF v_err_text <> 'rehearsal_rollback' THEN
      v_assertions := v_assertions || jsonb_build_object('id','TX','name','subtx_unexpected_error','expected','rehearsal_rollback','observed',v_err_text,'pass',false);
      v_overall := false;
    END IF;
  END;

  SELECT count(*) INTO v_user_roles_after
    FROM public.user_roles WHERE user_id = _target_user_id AND role = 'governance_reviewer';
  v_assertions := v_assertions || jsonb_build_object('id','POST1','name','no_user_roles_committed','expected',0,'observed',v_user_roles_after,'pass', v_user_roles_after = 0);
  IF v_user_roles_after <> 0 THEN v_overall := false; END IF;

  SELECT count(*) INTO v_log_after
    FROM public.role_revocation_log WHERE target_user_id = _target_user_id;
  v_assertions := v_assertions || jsonb_build_object('id','POST2','name','no_revocation_log_committed','expected',0,'observed',v_log_after,'pass', v_log_after = 0);
  IF v_log_after <> 0 THEN v_overall := false; END IF;

  UPDATE public.vos_role_rehearsal_log
     SET status = 'completed',
         overall_pass = v_overall,
         assertions = v_assertions,
         notes = 'rehearsal completed; subtx rolled back as designed'
   WHERE id = v_rehearsal_id;

  RETURN jsonb_build_object(
    'rehearsal_id', v_rehearsal_id,
    'overall_pass', v_overall,
    'committed_writes', 0,
    'assertions', v_assertions
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.vos_run_revocation_rehearsal_once(_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller            uuid := auth.uid();
  v_armed             text;
  v_pre_helper_flag   text;
  v_target_uuid       uuid;
  v_target_hash       text;
  v_helper_result     jsonb;
  v_post_helper_flag  text;
  v_post_helper_lock  boolean;
  v_post_armed_flag   text;
  v_overall           boolean := false;
  v_err_text          text;
  v_err_state         text;
  v_rehearsal_id      uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('vos_run_revocation_rehearsal_once')) THEN
    RAISE EXCEPTION 'concurrent_rehearsal_blocked';
  END IF;

  SELECT flag_value INTO v_armed
    FROM public.vos_platform_flags
   WHERE flag_key = 'REHEARSAL_RETRY_ARMED';
  IF v_armed IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'rehearsal_retry_not_armed';
  END IF;

  SELECT flag_value INTO v_pre_helper_flag
    FROM public.vos_platform_flags
   WHERE flag_key = 'REHEARSAL_HELPER_ENABLED';

  SELECT u.id INTO v_target_uuid
    FROM auth.users u
   WHERE u.id <> v_caller
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.user_id = u.id AND r.role = 'admin' AND r.revoked_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.user_id = u.id AND r.role = 'governance_reviewer'
     )
   ORDER BY u.created_at ASC
   LIMIT 1;

  IF v_target_uuid IS NULL THEN
    UPDATE public.vos_platform_flags
       SET flag_value='false', locked=true, updated_by=v_caller, updated_at=now()
     WHERE flag_key='REHEARSAL_RETRY_ARMED';
    RAISE EXCEPTION 'no_eligible_target';
  END IF;

  v_target_hash := encode(extensions.digest(v_target_uuid::text, 'sha256'), 'hex');

  BEGIN
    UPDATE public.vos_platform_flags
       SET flag_value='true', locked=false, updated_by=v_caller, updated_at=now()
     WHERE flag_key='REHEARSAL_HELPER_ENABLED';

    v_helper_result := public.vos_simulate_revocation(v_target_uuid, _reason);

    UPDATE public.vos_platform_flags
       SET flag_value='false', locked=true, updated_by=v_caller, updated_at=now()
     WHERE flag_key='REHEARSAL_HELPER_ENABLED';

    UPDATE public.vos_platform_flags
       SET flag_value='false', locked=true, updated_by=v_caller, updated_at=now()
     WHERE flag_key='REHEARSAL_RETRY_ARMED';

    v_overall := COALESCE((v_helper_result ->> 'overall_pass')::boolean, false);
    v_rehearsal_id := NULLIF(v_helper_result ->> 'rehearsal_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_err_text := SQLERRM;
    v_err_state := SQLSTATE;
    BEGIN
      UPDATE public.vos_platform_flags
         SET flag_value='false', locked=true, updated_by=v_caller, updated_at=now()
       WHERE flag_key='REHEARSAL_HELPER_ENABLED';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      UPDATE public.vos_platform_flags
         SET flag_value='false', locked=true, updated_by=v_caller, updated_at=now()
       WHERE flag_key='REHEARSAL_RETRY_ARMED';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RAISE EXCEPTION 'wrapper_failed: % (state=%)', v_err_text, v_err_state;
  END;

  SELECT flag_value, locked INTO v_post_helper_flag, v_post_helper_lock
    FROM public.vos_platform_flags WHERE flag_key='REHEARSAL_HELPER_ENABLED';
  SELECT flag_value INTO v_post_armed_flag
    FROM public.vos_platform_flags WHERE flag_key='REHEARSAL_RETRY_ARMED';

  RETURN jsonb_build_object(
    'wrapper_version', '1.0.0',
    'caller_admin_hash', encode(extensions.digest(v_caller::text,'sha256'),'hex'),
    'target_hash', v_target_hash,
    'helper_result', v_helper_result,
    'rehearsal_id', v_rehearsal_id,
    'pre_flag', v_pre_helper_flag,
    'post_flag', v_post_helper_flag,
    'post_flag_locked', v_post_helper_lock,
    'armed_flag_after', v_post_armed_flag,
    'advisory_lock_acquired', true,
    'completed_at', now(),
    'overall_pass', v_overall
  );
END;
$function$;