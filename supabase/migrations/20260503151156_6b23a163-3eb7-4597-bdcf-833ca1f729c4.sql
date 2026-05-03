-- STEP 5G-E.FIX-1: schema-qualify digest() calls to extensions.digest()
-- Two functions updated. SECURITY DEFINER, search_path=public, all gates/assertions/cleanup preserved.

CREATE OR REPLACE FUNCTION public.vos_simulate_revocation(_target_user_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  flag_enabled text;
  target_exists boolean;
  target_is_admin boolean;
  target_has_gov boolean;
  rehearsal_id uuid;
  assertions jsonb := '[]'::jsonb;
  active_mid boolean;
  revoked_mid timestamptz;
  log_count_mid int;
  active_after boolean;
  irreversible_blocked boolean := false;
  log_append_only boolean := false;
  user_roles_after int;
  log_after int;
  overall boolean := true;
  err_text text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_role(caller,'admin') THEN RAISE EXCEPTION 'admin_only'; END IF;

  IF _target_user_id = caller THEN RAISE EXCEPTION 'cannot_target_self'; END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT flag_value INTO flag_enabled FROM public.vos_platform_flags WHERE flag_key = 'REHEARSAL_HELPER_ENABLED';
  IF flag_enabled IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'rehearsal_helper_disabled';
  END IF;

  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = _target_user_id) INTO target_exists;
  IF NOT target_exists THEN RAISE EXCEPTION 'target_not_in_auth_users'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin' AND revoked_at IS NULL) INTO target_is_admin;
  IF target_is_admin THEN RAISE EXCEPTION 'target_is_active_admin'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _target_user_id AND role = 'governance_reviewer') INTO target_has_gov;
  IF target_has_gov THEN RAISE EXCEPTION 'target_already_has_governance_reviewer'; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('vos_simulate_revocation')) THEN
    RAISE EXCEPTION 'concurrent_rehearsal_blocked';
  END IF;

  INSERT INTO public.vos_role_rehearsal_log (created_by, rehearsal_kind, target_user_redacted, status)
  VALUES (caller, 'live_subtx', encode(extensions.digest(_target_user_id::text,'sha256'),'hex'), 'started')
  RETURNING id INTO rehearsal_id;

  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, 'governance_reviewer');

    SELECT public.has_active_role(_target_user_id, 'governance_reviewer') INTO active_mid;
    assertions := assertions || jsonb_build_object('id','T7','name','active_role_true_mid','expected',true,'observed',active_mid,'pass',active_mid);
    IF NOT active_mid THEN overall := false; END IF;

    PERFORM public.revoke_user_role(_target_user_id, 'governance_reviewer', _reason);

    SELECT revoked_at INTO revoked_mid FROM public.user_roles
      WHERE user_id = _target_user_id AND role = 'governance_reviewer';
    assertions := assertions || jsonb_build_object('id','T9','name','revoked_at_populated','expected','not_null','observed', (revoked_mid IS NOT NULL),'pass', revoked_mid IS NOT NULL);
    IF revoked_mid IS NULL THEN overall := false; END IF;

    SELECT count(*) INTO log_count_mid FROM public.role_revocation_log WHERE target_user_id = _target_user_id;
    assertions := assertions || jsonb_build_object('id','T11','name','revocation_log_appended_mid','expected','>=1','observed',log_count_mid,'pass', log_count_mid >= 1);
    IF log_count_mid < 1 THEN overall := false; END IF;

    SELECT public.has_active_role(_target_user_id, 'governance_reviewer') INTO active_after;
    assertions := assertions || jsonb_build_object('id','T13','name','active_role_false_after_revoke','expected',false,'observed',active_after,'pass', NOT active_after);
    IF active_after THEN overall := false; END IF;

    BEGIN
      UPDATE public.user_roles SET revoked_at = NULL
        WHERE user_id = _target_user_id AND role = 'governance_reviewer';
      irreversible_blocked := false;
    EXCEPTION WHEN OTHERS THEN
      irreversible_blocked := true;
    END;
    assertions := assertions || jsonb_build_object('id','T10','name','revocation_irreversible','expected',true,'observed',irreversible_blocked,'pass',irreversible_blocked);
    IF NOT irreversible_blocked THEN overall := false; END IF;

    BEGIN
      UPDATE public.role_revocation_log SET reason_text = 'rehearsal_tamper_attempt'
        WHERE target_user_id = _target_user_id;
      log_append_only := false;
    EXCEPTION WHEN OTHERS THEN
      log_append_only := true;
    END;
    assertions := assertions || jsonb_build_object('id','T12','name','revocation_log_append_only','expected',true,'observed',log_append_only,'pass',log_append_only);
    IF NOT log_append_only THEN overall := false; END IF;

    RAISE EXCEPTION 'rehearsal_rollback';
  EXCEPTION WHEN OTHERS THEN
    err_text := SQLERRM;
    IF err_text <> 'rehearsal_rollback' THEN
      assertions := assertions || jsonb_build_object('id','TX','name','subtx_unexpected_error','expected','rehearsal_rollback','observed',err_text,'pass',false);
      overall := false;
    END IF;
  END;

  SELECT count(*) INTO user_roles_after
    FROM public.user_roles WHERE user_id = _target_user_id AND role = 'governance_reviewer';
  assertions := assertions || jsonb_build_object('id','POST1','name','no_user_roles_committed','expected',0,'observed',user_roles_after,'pass', user_roles_after = 0);
  IF user_roles_after <> 0 THEN overall := false; END IF;

  SELECT count(*) INTO log_after
    FROM public.role_revocation_log WHERE target_user_id = _target_user_id;
  assertions := assertions || jsonb_build_object('id','POST2','name','no_revocation_log_committed','expected',0,'observed',log_after,'pass', log_after = 0);
  IF log_after <> 0 THEN overall := false; END IF;

  UPDATE public.vos_role_rehearsal_log
     SET status = 'completed',
         overall_pass = overall,
         assertions = assertions,
         notes = 'rehearsal completed; subtx rolled back as designed'
   WHERE id = rehearsal_id;

  RETURN jsonb_build_object(
    'rehearsal_id', rehearsal_id,
    'overall_pass', overall,
    'committed_writes', 0,
    'assertions', assertions
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
  caller            uuid := auth.uid();
  armed             text;
  pre_helper_flag   text;
  target_uuid       uuid;
  target_hash       text;
  helper_result     jsonb;
  post_helper_flag  text;
  post_helper_lock  boolean;
  post_armed_flag   text;
  overall           boolean := false;
  err_text          text;
  err_state         text;
  rehearsal_id      uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('vos_run_revocation_rehearsal_once')) THEN
    RAISE EXCEPTION 'concurrent_rehearsal_blocked';
  END IF;

  SELECT flag_value INTO armed
    FROM public.vos_platform_flags
   WHERE flag_key = 'REHEARSAL_RETRY_ARMED';
  IF armed IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'rehearsal_retry_not_armed';
  END IF;

  SELECT flag_value INTO pre_helper_flag
    FROM public.vos_platform_flags
   WHERE flag_key = 'REHEARSAL_HELPER_ENABLED';

  SELECT u.id INTO target_uuid
    FROM auth.users u
   WHERE u.id <> caller
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

  IF target_uuid IS NULL THEN
    UPDATE public.vos_platform_flags
       SET flag_value='false', locked=true, updated_by=caller, updated_at=now()
     WHERE flag_key='REHEARSAL_RETRY_ARMED';
    RAISE EXCEPTION 'no_eligible_target';
  END IF;

  target_hash := encode(extensions.digest(target_uuid::text, 'sha256'), 'hex');

  BEGIN
    UPDATE public.vos_platform_flags
       SET flag_value='true', locked=false, updated_by=caller, updated_at=now()
     WHERE flag_key='REHEARSAL_HELPER_ENABLED';

    helper_result := public.vos_simulate_revocation(target_uuid, _reason);

    UPDATE public.vos_platform_flags
       SET flag_value='false', locked=true, updated_by=caller, updated_at=now()
     WHERE flag_key='REHEARSAL_HELPER_ENABLED';

    UPDATE public.vos_platform_flags
       SET flag_value='false', locked=true, updated_by=caller, updated_at=now()
     WHERE flag_key='REHEARSAL_RETRY_ARMED';

    overall := COALESCE((helper_result ->> 'overall_pass')::boolean, false);
    rehearsal_id := NULLIF(helper_result ->> 'rehearsal_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN
    err_text := SQLERRM;
    err_state := SQLSTATE;
    BEGIN
      UPDATE public.vos_platform_flags
         SET flag_value='false', locked=true, updated_by=caller, updated_at=now()
       WHERE flag_key='REHEARSAL_HELPER_ENABLED';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      UPDATE public.vos_platform_flags
         SET flag_value='false', locked=true, updated_by=caller, updated_at=now()
       WHERE flag_key='REHEARSAL_RETRY_ARMED';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RAISE EXCEPTION 'wrapper_failed: % (state=%)', err_text, err_state;
  END;

  SELECT flag_value, locked INTO post_helper_flag, post_helper_lock
    FROM public.vos_platform_flags WHERE flag_key='REHEARSAL_HELPER_ENABLED';
  SELECT flag_value INTO post_armed_flag
    FROM public.vos_platform_flags WHERE flag_key='REHEARSAL_RETRY_ARMED';

  RETURN jsonb_build_object(
    'wrapper_version', '1.0.0',
    'caller_admin_hash', encode(extensions.digest(caller::text,'sha256'),'hex'),
    'target_hash', target_hash,
    'helper_result', helper_result,
    'rehearsal_id', rehearsal_id,
    'pre_flag', pre_helper_flag,
    'post_flag', post_helper_flag,
    'post_flag_locked', post_helper_lock,
    'armed_flag_after', post_armed_flag,
    'advisory_lock_acquired', true,
    'completed_at', now(),
    'overall_pass', overall
  );
END;
$function$;