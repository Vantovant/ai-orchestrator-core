
-- Step 5G-D.1 BUILD: Rehearsal helper foundation (Option D)

-- 1) Append-only rehearsal log table
CREATE TABLE public.vos_role_rehearsal_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  rehearsal_kind text NOT NULL,
  target_user_redacted text NULL,
  assertions jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_pass boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'created',
  notes text NULL,
  CONSTRAINT vos_role_rehearsal_log_kind_chk CHECK (rehearsal_kind IN ('live_subtx','mirror_only')),
  CONSTRAINT vos_role_rehearsal_log_status_chk CHECK (status IN ('created','started','completed','failed'))
);

ALTER TABLE public.vos_role_rehearsal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read rehearsal log"
  ON public.vos_role_rehearsal_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins insert rehearsal log"
  ON public.vos_role_rehearsal_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') AND created_by = auth.uid());

-- Append-only guard: allow UPDATE only for status created->started->completed/failed by same admin; never DELETE
CREATE OR REPLACE FUNCTION public.vos_role_rehearsal_log_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'delete_forbidden';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Immutable identity columns
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.rehearsal_kind IS DISTINCT FROM OLD.rehearsal_kind
       OR NEW.target_user_redacted IS DISTINCT FROM OLD.target_user_redacted THEN
      RAISE EXCEPTION 'immutable_column_modified';
    END IF;
    -- Status state machine
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'created' AND NEW.status IN ('started','failed'))
        OR (OLD.status = 'started' AND NEW.status IN ('completed','failed'))
      ) THEN
        RAISE EXCEPTION 'invalid_status_transition: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
    -- overall_pass may only be set when transitioning to completed
    IF NEW.overall_pass IS DISTINCT FROM OLD.overall_pass AND NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'overall_pass_only_on_completed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vos_role_rehearsal_log_guard
  BEFORE UPDATE OR DELETE ON public.vos_role_rehearsal_log
  FOR EACH ROW EXECUTE FUNCTION public.vos_role_rehearsal_log_guard();

-- 2) Platform flag (defaulted false, locked)
INSERT INTO public.vos_platform_flags (flag_key, flag_value, description, locked)
VALUES ('REHEARSAL_HELPER_ENABLED','false','Step 5G-D.1 rehearsal helper gate. Must be true to invoke vos_simulate_revocation(). Default false.',true)
ON CONFLICT (flag_key) DO NOTHING;

-- 3) Helper function (Option D) — builds the function only; does NOT invoke it
CREATE OR REPLACE FUNCTION public.vos_simulate_revocation(_target_user_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Auth + admin gate
  IF caller IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT public.has_role(caller,'admin') THEN RAISE EXCEPTION 'admin_only'; END IF;

  -- Self-target block
  IF _target_user_id = caller THEN RAISE EXCEPTION 'cannot_target_self'; END IF;

  -- Reason
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'reason_required'; END IF;

  -- Flag must be enabled
  SELECT flag_value INTO flag_enabled FROM public.vos_platform_flags WHERE flag_key = 'REHEARSAL_HELPER_ENABLED';
  IF flag_enabled IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'rehearsal_helper_disabled';
  END IF;

  -- Target validity
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = _target_user_id) INTO target_exists;
  IF NOT target_exists THEN RAISE EXCEPTION 'target_not_in_auth_users'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin' AND revoked_at IS NULL) INTO target_is_admin;
  IF target_is_admin THEN RAISE EXCEPTION 'target_is_active_admin'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _target_user_id AND role = 'governance_reviewer') INTO target_has_gov;
  IF target_has_gov THEN RAISE EXCEPTION 'target_already_has_governance_reviewer'; END IF;

  -- Concurrency guard
  IF NOT pg_try_advisory_xact_lock(hashtext('vos_simulate_revocation')) THEN
    RAISE EXCEPTION 'concurrent_rehearsal_blocked';
  END IF;

  -- Persistent: started row
  INSERT INTO public.vos_role_rehearsal_log (created_by, rehearsal_kind, target_user_redacted, status)
  VALUES (caller, 'live_subtx', encode(digest(_target_user_id::text,'sha256'),'hex'), 'started')
  RETURNING id INTO rehearsal_id;

  -- Self-aborting subtransaction
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

    -- Irreversibility check
    BEGIN
      UPDATE public.user_roles SET revoked_at = NULL
        WHERE user_id = _target_user_id AND role = 'governance_reviewer';
      irreversible_blocked := false;
    EXCEPTION WHEN OTHERS THEN
      irreversible_blocked := true;
    END;
    assertions := assertions || jsonb_build_object('id','T10','name','revocation_irreversible','expected',true,'observed',irreversible_blocked,'pass',irreversible_blocked);
    IF NOT irreversible_blocked THEN overall := false; END IF;

    -- Append-only check on role_revocation_log
    BEGIN
      UPDATE public.role_revocation_log SET reason_text = 'rehearsal_tamper_attempt'
        WHERE target_user_id = _target_user_id;
      log_append_only := false;
    EXCEPTION WHEN OTHERS THEN
      log_append_only := true;
    END;
    assertions := assertions || jsonb_build_object('id','T12','name','revocation_log_append_only','expected',true,'observed',log_append_only,'pass',log_append_only);
    IF NOT log_append_only THEN overall := false; END IF;

    -- Intentional rollback of subtransaction
    RAISE EXCEPTION 'rehearsal_rollback';
  EXCEPTION WHEN OTHERS THEN
    err_text := SQLERRM;
    IF err_text <> 'rehearsal_rollback' THEN
      assertions := assertions || jsonb_build_object('id','TX','name','subtx_unexpected_error','expected','rehearsal_rollback','observed',err_text,'pass',false);
      overall := false;
    END IF;
  END;

  -- Post-rollback assertions in outer tx
  SELECT count(*) INTO user_roles_after
    FROM public.user_roles WHERE user_id = _target_user_id AND role = 'governance_reviewer';
  assertions := assertions || jsonb_build_object('id','POST1','name','no_user_roles_committed','expected',0,'observed',user_roles_after,'pass', user_roles_after = 0);
  IF user_roles_after <> 0 THEN overall := false; END IF;

  SELECT count(*) INTO log_after
    FROM public.role_revocation_log WHERE target_user_id = _target_user_id;
  assertions := assertions || jsonb_build_object('id','POST2','name','no_revocation_log_committed','expected',0,'observed',log_after,'pass', log_after = 0);
  IF log_after <> 0 THEN overall := false; END IF;

  -- Persist completion (separate UPDATE allowed by guard: started -> completed)
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
$$;

-- Lock down execution: only admins via in-body gate; revoke broad grants
REVOKE ALL ON FUNCTION public.vos_simulate_revocation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vos_simulate_revocation(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.vos_simulate_revocation(uuid, text) TO authenticated;
