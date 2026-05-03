-- 1) Create REHEARSAL_RETRY_ARMED flag (idempotent)
INSERT INTO public.vos_platform_flags (flag_key, flag_value, description, locked)
SELECT 'REHEARSAL_RETRY_ARMED', 'false',
       'Step 5G-E.RETRY-PATH-1C arming gate. Must be true to allow vos_run_revocation_rehearsal_once() to proceed. Auto-disarms after one use.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.vos_platform_flags WHERE flag_key = 'REHEARSAL_RETRY_ARMED'
);

-- 2) Create wrapper function
CREATE OR REPLACE FUNCTION public.vos_run_revocation_rehearsal_once(_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- Admin gate
  IF caller IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  -- Reason gate
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  -- Concurrency
  IF NOT pg_try_advisory_xact_lock(hashtext('vos_run_revocation_rehearsal_once')) THEN
    RAISE EXCEPTION 'concurrent_rehearsal_blocked';
  END IF;

  -- Arming gate
  SELECT flag_value INTO armed
    FROM public.vos_platform_flags
   WHERE flag_key = 'REHEARSAL_RETRY_ARMED';
  IF armed IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'rehearsal_retry_not_armed';
  END IF;

  -- Capture pre-state of helper flag
  SELECT flag_value INTO pre_helper_flag
    FROM public.vos_platform_flags
   WHERE flag_key = 'REHEARSAL_HELPER_ENABLED';

  -- Target selection: one eligible non-admin auth.users
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
    -- Disarm and abort cleanly
    UPDATE public.vos_platform_flags
       SET flag_value='false', locked=true, updated_by=caller, updated_at=now()
     WHERE flag_key='REHEARSAL_RETRY_ARMED';
    RAISE EXCEPTION 'no_eligible_target';
  END IF;

  target_hash := encode(digest(target_uuid::text, 'sha256'), 'hex');

  BEGIN
    -- Enable helper flag
    UPDATE public.vos_platform_flags
       SET flag_value='true', locked=false, updated_by=caller, updated_at=now()
     WHERE flag_key='REHEARSAL_HELPER_ENABLED';

    -- Single helper invocation
    helper_result := public.vos_simulate_revocation(target_uuid, _reason);

    -- Disable helper flag (success path)
    UPDATE public.vos_platform_flags
       SET flag_value='false', locked=true, updated_by=caller, updated_at=now()
     WHERE flag_key='REHEARSAL_HELPER_ENABLED';

    -- Disarm retry gate
    UPDATE public.vos_platform_flags
       SET flag_value='false', locked=true, updated_by=caller, updated_at=now()
     WHERE flag_key='REHEARSAL_RETRY_ARMED';

    overall := COALESCE((helper_result ->> 'overall_pass')::boolean, false);
    rehearsal_id := NULLIF(helper_result ->> 'rehearsal_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN
    err_text := SQLERRM;
    err_state := SQLSTATE;
    -- Cleanup: always restore helper flag and disarm
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

  -- Post-state capture
  SELECT flag_value, locked INTO post_helper_flag, post_helper_lock
    FROM public.vos_platform_flags WHERE flag_key='REHEARSAL_HELPER_ENABLED';
  SELECT flag_value INTO post_armed_flag
    FROM public.vos_platform_flags WHERE flag_key='REHEARSAL_RETRY_ARMED';

  RETURN jsonb_build_object(
    'wrapper_version', '1.0.0',
    'caller_admin_hash', encode(digest(caller::text,'sha256'),'hex'),
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

-- 3) Grants: lock down execute
REVOKE ALL ON FUNCTION public.vos_run_revocation_rehearsal_once(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vos_run_revocation_rehearsal_once(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.vos_run_revocation_rehearsal_once(text) TO authenticated;

-- 4) Reaffirm helper remains denied to authenticated/anon (defense in depth)
REVOKE ALL ON FUNCTION public.vos_simulate_revocation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vos_simulate_revocation(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.vos_simulate_revocation(uuid, text) FROM authenticated;