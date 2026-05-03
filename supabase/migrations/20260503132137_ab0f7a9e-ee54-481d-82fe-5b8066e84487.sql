
-- =============================================================
-- STEP 5G-D — LIMITED ROLE SCHEMA BUILD (Part 2)
-- =============================================================

-- ---------- 2. user_roles revocation columns ----------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS revoked_at        timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revoked_by        uuid NULL,
  ADD COLUMN IF NOT EXISTS revocation_reason text NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_active
  ON public.user_roles (user_id, role)
  WHERE revoked_at IS NULL;

-- ---------- 3. role_revocation_log (append-only) ----------
CREATE TABLE IF NOT EXISTS public.role_revocation_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  revoker_user_id    uuid NOT NULL,
  target_user_id     uuid NOT NULL,
  target_role        public.app_role NOT NULL,
  revoked_at         timestamptz NOT NULL DEFAULT now(),
  reason_text        text NOT NULL,
  jwt_subject        text NULL,
  prev_active_since  timestamptz NULL
);

ALTER TABLE public.role_revocation_log ENABLE ROW LEVEL SECURITY;

-- ---------- 4. vos_approval_requests audit additions ----------
ALTER TABLE public.vos_approval_requests
  ADD COLUMN IF NOT EXISTS last_modified_by                uuid NULL,
  ADD COLUMN IF NOT EXISTS last_modified_at                timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approver_role_at_time           text NULL,
  ADD COLUMN IF NOT EXISTS second_approver_role_at_time    text NULL,
  ADD COLUMN IF NOT EXISTS approver_jwt_subject            text NULL,
  ADD COLUMN IF NOT EXISTS second_approver_jwt_subject     text NULL,
  ADD COLUMN IF NOT EXISTS source_chain_hash_at_approval   text NULL,
  ADD COLUMN IF NOT EXISTS invalidated_by_revocation       boolean NOT NULL DEFAULT false;

-- ---------- 5. vos_manual_action_log audit additions ----------
ALTER TABLE public.vos_manual_action_log
  ADD COLUMN IF NOT EXISTS executor_role_at_time text NULL,
  ADD COLUMN IF NOT EXISTS executor_jwt_subject  text NULL;

-- ---------- 6. has_active_role() ----------
CREATE OR REPLACE FUNCTION public.has_active_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND revoked_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.has_active_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_active_role(uuid, public.app_role) TO authenticated;

-- ---------- 10. Source-chain hash helper ----------
CREATE OR REPLACE FUNCTION public.vos_compute_source_chain_hash(approval_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appr   public.vos_approval_requests%ROWTYPE;
  dry    public.vos_dry_run_actions%ROWTYPE;
  prop   public.vos_proposal_queue%ROWTYPE;
  payload text;
BEGIN
  SELECT * INTO appr FROM public.vos_approval_requests WHERE id = approval_id;
  IF appr IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO dry  FROM public.vos_dry_run_actions  WHERE id = appr.source_dry_run_id;
  SELECT * INTO prop FROM public.vos_proposal_queue   WHERE id = appr.source_proposal_id;

  payload :=
    coalesce(appr.id::text,'')        || '|' ||
    coalesce(appr.source_dry_run_id::text,'')   || '|' ||
    coalesce(appr.source_proposal_id::text,'')  || '|' ||
    coalesce(appr.app_id,'')          || '|' ||
    coalesce(appr.approval_type,'')   || '|' ||
    coalesce(appr.approval_title,'')  || '|' ||
    coalesce(appr.approval_summary,'')|| '|' ||
    coalesce(appr.dedupe_key,'')      || '|' ||
    coalesce(dry.id::text,'')         || '|' ||
    coalesce(dry.dry_run_title,'')    || '|' ||
    coalesce(dry.dry_run_summary,'')  || '|' ||
    coalesce(dry.dedupe_key,'')       || '|' ||
    coalesce(prop.id::text,'')        || '|' ||
    coalesce(prop.proposal_title,'')  || '|' ||
    coalesce(prop.proposal_summary,'')|| '|' ||
    coalesce(prop.dedupe_key,'');

  RETURN encode(digest(payload, 'sha256'), 'hex');
END;
$$;

REVOKE ALL ON FUNCTION public.vos_compute_source_chain_hash(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.vos_compute_source_chain_hash(uuid) TO authenticated;

-- ---------- 7. revoke_user_role() ----------
CREATE OR REPLACE FUNCTION public.revoke_user_role(
  _target_user_id uuid,
  _role public.app_role,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  log_id uuid;
  prev_since timestamptz;
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
  -- block self-revocation of governance_reviewer
  IF _role = 'governance_reviewer' AND caller = _target_user_id THEN
    RAISE EXCEPTION 'self_revocation_forbidden';
  END IF;

  SELECT created_at INTO prev_since
    FROM public.user_roles
   WHERE user_id = _target_user_id AND role = _role AND revoked_at IS NULL
   LIMIT 1;

  IF prev_since IS NULL THEN
    RAISE EXCEPTION 'active_role_not_found';
  END IF;

  UPDATE public.user_roles
     SET revoked_at = now(),
         revoked_by = caller,
         revocation_reason = _reason
   WHERE user_id = _target_user_id
     AND role = _role
     AND revoked_at IS NULL;

  INSERT INTO public.role_revocation_log (
    revoker_user_id, target_user_id, target_role,
    revoked_at, reason_text, jwt_subject, prev_active_since
  ) VALUES (
    caller, _target_user_id, _role,
    now(), _reason, caller::text, prev_since
  ) RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_role(uuid, public.app_role, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.revoke_user_role(uuid, public.app_role, text) TO authenticated;

-- ---------- 9. Trigger logic ----------

-- 9a. user_roles: irreversible revocation + propagate invalidation
CREATE OR REPLACE FUNCTION public.user_roles_revocation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'revocation_irreversible';
    END IF;
    IF OLD.revoked_at IS NOT NULL
       AND (NEW.role IS DISTINCT FROM OLD.role
         OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
      RAISE EXCEPTION 'revoked_role_immutable';
    END IF;

    -- propagate: when becoming revoked, flag pending approvals
    IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
      UPDATE public.vos_approval_requests
         SET invalidated_by_revocation = true,
             last_modified_by = NEW.revoked_by,
             last_modified_at = now()
       WHERE approval_status IN ('requested','reviewed')
         AND (reviewed_by = NEW.user_id OR requested_by_user = NEW.user_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_revocation_guard ON public.user_roles;
CREATE TRIGGER trg_user_roles_revocation_guard
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.user_roles_revocation_guard();

-- 9b. role_revocation_log: append-only
CREATE OR REPLACE FUNCTION public.role_revocation_log_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'update_forbidden'; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'delete_forbidden'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_revocation_log_no_update ON public.role_revocation_log;
CREATE TRIGGER trg_role_revocation_log_no_update
  BEFORE UPDATE ON public.role_revocation_log
  FOR EACH ROW EXECUTE FUNCTION public.role_revocation_log_guard();

DROP TRIGGER IF EXISTS trg_role_revocation_log_no_delete ON public.role_revocation_log;
CREATE TRIGGER trg_role_revocation_log_no_delete
  BEFORE DELETE ON public.role_revocation_log
  FOR EACH ROW EXECUTE FUNCTION public.role_revocation_log_guard();

-- 9c. vos_approval_requests: hardening (capture role/jwt + source-chain hash + tamper guard + delete forbidden)
CREATE OR REPLACE FUNCTION public.vos_approval_requests_5g_d_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  jwt_role text;
  computed_hash text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'hard_delete_forbidden';
  END IF;

  -- determine caller jwt role (service-role blocked from approval transitions)
  BEGIN
    jwt_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF TG_OP = 'UPDATE' THEN
    -- Revoked approver cannot drive transitions
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND NEW.approval_status IN ('reviewed','second_reviewed')
       AND caller IS NOT NULL
       AND NOT public.has_active_role(caller, 'admin')
       AND NOT public.has_active_role(caller, 'governance_reviewer') THEN
      RAISE EXCEPTION 'caller_not_active_reviewer';
    END IF;

    -- Block service-role transitions on second_reviewed
    IF NEW.approval_status = 'second_reviewed'
       AND OLD.approval_status <> 'second_reviewed'
       AND jwt_role = 'service_role' THEN
      RAISE EXCEPTION 'service_role_approval_blocked';
    END IF;

    -- Two-key hardening on second_reviewed
    IF NEW.approval_status = 'second_reviewed' AND OLD.approval_status <> 'second_reviewed' THEN
      IF NEW.reviewed_by IS NULL OR NEW.second_reviewed_by IS NULL THEN
        RAISE EXCEPTION 'two_key_required';
      END IF;
      IF NEW.reviewed_by = NEW.second_reviewed_by THEN
        RAISE EXCEPTION 'two_key_same_user';
      END IF;
      -- self-approval / transitive self-approval
      IF NEW.requested_by_user IS NOT NULL
         AND (NEW.requested_by_user = NEW.reviewed_by
           OR NEW.requested_by_user = NEW.second_reviewed_by) THEN
        RAISE EXCEPTION 'self_approval_blocked';
      END IF;
      IF OLD.last_modified_by IS NOT NULL
         AND OLD.last_modified_by = NEW.second_reviewed_by THEN
        RAISE EXCEPTION 'transitive_self_approval_blocked';
      END IF;
      IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
        RAISE EXCEPTION 'approval_expired';
      END IF;
      IF NEW.invalidated_by_revocation THEN
        RAISE EXCEPTION 'approval_invalidated_by_revocation';
      END IF;

      -- capture role / jwt subject for second reviewer if not set
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

      -- source-chain hash capture + tamper check
      computed_hash := public.vos_compute_source_chain_hash(NEW.id);
      IF NEW.source_chain_hash_at_approval IS NULL THEN
        NEW.source_chain_hash_at_approval := computed_hash;
      ELSIF NEW.source_chain_hash_at_approval IS DISTINCT FROM computed_hash THEN
        RAISE EXCEPTION 'source_chain_hash_mismatch';
      END IF;
    END IF;

    -- Capture first reviewer role on transition into 'reviewed'
    IF NEW.approval_status = 'reviewed' AND OLD.approval_status <> 'reviewed' THEN
      IF NEW.reviewed_by IS NULL THEN
        RAISE EXCEPTION 'reviewer_required';
      END IF;
      IF NEW.requested_by_user IS NOT NULL AND NEW.requested_by_user = NEW.reviewed_by THEN
        RAISE EXCEPTION 'self_approval_blocked';
      END IF;
      IF NEW.approver_role_at_time IS NULL THEN
        IF public.has_active_role(NEW.reviewed_by, 'admin') THEN
          NEW.approver_role_at_time := 'admin';
        ELSIF public.has_active_role(NEW.reviewed_by, 'governance_reviewer') THEN
          NEW.approver_role_at_time := 'governance_reviewer';
        ELSE
          RAISE EXCEPTION 'reviewer_role_invalid';
        END IF;
      END IF;
      IF NEW.approver_jwt_subject IS NULL THEN
        NEW.approver_jwt_subject := NEW.reviewed_by::text;
      END IF;
    END IF;

    -- Maintain last_modified_by/at on any change
    IF caller IS NOT NULL THEN
      NEW.last_modified_by := caller;
      NEW.last_modified_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vos_approval_requests_5gd_guard ON public.vos_approval_requests;
CREATE TRIGGER trg_vos_approval_requests_5gd_guard
  BEFORE UPDATE ON public.vos_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.vos_approval_requests_5g_d_guard();

DROP TRIGGER IF EXISTS trg_vos_approval_requests_5gd_no_delete ON public.vos_approval_requests;
CREATE TRIGGER trg_vos_approval_requests_5gd_no_delete
  BEFORE DELETE ON public.vos_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.vos_approval_requests_5g_d_guard();

-- 9d. vos_manual_action_log: executor cannot be either reviewer + capture role/jwt
CREATE OR REPLACE FUNCTION public.vos_manual_action_log_5g_d_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.performed_by = NEW.reviewed_by THEN
      RAISE EXCEPTION 'executor_equals_first_reviewer';
    END IF;
    IF NEW.performed_by = NEW.second_reviewed_by THEN
      RAISE EXCEPTION 'executor_equals_second_reviewer';
    END IF;
    IF NEW.executor_role_at_time IS NULL THEN
      IF public.has_active_role(NEW.performed_by, 'admin') THEN
        NEW.executor_role_at_time := 'admin';
      ELSE
        NEW.executor_role_at_time := 'unknown';
      END IF;
    END IF;
    IF NEW.executor_jwt_subject IS NULL THEN
      NEW.executor_jwt_subject := NEW.performed_by::text;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vos_manual_action_log_5gd_guard ON public.vos_manual_action_log;
CREATE TRIGGER trg_vos_manual_action_log_5gd_guard
  BEFORE INSERT ON public.vos_manual_action_log
  FOR EACH ROW EXECUTE FUNCTION public.vos_manual_action_log_5g_d_guard();

-- ---------- 8. RLS policies for governance_reviewer (SELECT-only on audit surfaces) ----------

-- Reusable helper macro: each table gets one permissive SELECT policy.
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'vos_approval_requests','vos_manual_action_log','vos_integration_action_drafts',
    'vos_crm_internal_notes','vos_proposal_queue','vos_dry_run_actions',
    'vos_decision_log','vos_inbound_log','vos_outbound_log','vos_inbox_receive_audit',
    'vos_killswitch_log','vos_rotation_log','vos_platform_flags','vos_kill_switches',
    'vos_app_registry','role_revocation_log'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "governance_reviewer_select" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "governance_reviewer_select" ON public.%I
         FOR SELECT TO authenticated
         USING (public.has_active_role(auth.uid(), ''governance_reviewer''))',
      t);
  END LOOP;
END $$;

-- The single allowed write surface for governance_reviewer
DROP POLICY IF EXISTS "governance_reviewer_approval_update" ON public.vos_approval_requests;
CREATE POLICY "governance_reviewer_approval_update"
ON public.vos_approval_requests
FOR UPDATE
TO authenticated
USING (
  public.has_active_role(auth.uid(), 'governance_reviewer')
  AND approval_status = 'reviewed'
  AND (expires_at IS NULL OR expires_at > now())
  AND invalidated_by_revocation = false
  AND (requested_by_user IS NULL OR requested_by_user <> auth.uid())
  AND (reviewed_by      IS NULL OR reviewed_by      <> auth.uid())
  AND (last_modified_by IS NULL OR last_modified_by <> auth.uid())
)
WITH CHECK (
  public.has_active_role(auth.uid(), 'governance_reviewer')
  AND approval_status IN ('second_reviewed','rejected')
  AND (
    approval_status <> 'second_reviewed'
    OR (second_reviewed_by = auth.uid() AND reviewed_by <> auth.uid())
  )
);
