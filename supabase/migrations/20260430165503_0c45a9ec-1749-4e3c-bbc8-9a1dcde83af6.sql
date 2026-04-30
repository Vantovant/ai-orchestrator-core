
-- Step 4U — vos_approval_requests (inert, two-key, no execution)

CREATE TABLE IF NOT EXISTS public.vos_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source_dry_run_id uuid NOT NULL REFERENCES public.vos_dry_run_actions(id),
  source_proposal_id uuid NOT NULL REFERENCES public.vos_proposal_queue(id),
  app_id text NOT NULL,
  event_name text,
  approval_type text NOT NULL,
  approval_title text NOT NULL,
  approval_summary text NOT NULL,
  approval_status text NOT NULL DEFAULT 'requested',
  requested_by_system text NOT NULL,
  requested_by_user uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  second_reviewed_by uuid,
  second_reviewed_at timestamptz,
  rejection_reason text,
  safety_blocked boolean NOT NULL DEFAULT true,
  would_execute boolean NOT NULL DEFAULT false,
  execution_blocked boolean NOT NULL DEFAULT true,
  dispatch_blocked boolean NOT NULL DEFAULT true,
  approval_does_not_execute boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  dedupe_key text NOT NULL,

  CONSTRAINT vos_appr_safety_flags CHECK (
    safety_blocked = true
    AND would_execute = false
    AND execution_blocked = true
    AND dispatch_blocked = true
    AND approval_does_not_execute = true
  ),
  CONSTRAINT vos_appr_type_allowed CHECK (
    approval_type IN ('internal_note_approval','review_status_approval','no_action_confirmation')
  ),
  CONSTRAINT vos_appr_status_allowed CHECK (
    approval_status IN ('requested','reviewed','second_reviewed','rejected','expired','archived')
  ),
  CONSTRAINT vos_appr_two_key_distinct CHECK (
    second_reviewed_by IS NULL OR second_reviewed_by <> reviewed_by
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS vos_approval_requests_dedupe_key_uidx
  ON public.vos_approval_requests(dedupe_key);
CREATE INDEX IF NOT EXISTS vos_approval_requests_status_idx
  ON public.vos_approval_requests(approval_status);
CREATE INDEX IF NOT EXISTS vos_approval_requests_app_idx
  ON public.vos_approval_requests(app_id);
CREATE INDEX IF NOT EXISTS vos_approval_requests_created_idx
  ON public.vos_approval_requests(created_at DESC);

-- Guard trigger
CREATE OR REPLACE FUNCTION public.vos_approval_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  banned text[] := ARRAY[
    'send','reply','enrol','enroll','follow up','push','dispatch',
    'forward','contact','message','notify','automate','trigger','schedule'
  ];
  forbidden_types text[] := ARRAY[
    'whatsapp_send','email_send','crm_push','zazi_enroll','aplgo_writeback',
    'dispatcher_run','master_prospector_wake','phase_4a_start','bulk_action'
  ];
  forbidden_statuses text[] := ARRAY[
    'executed','sent','dispatched','pushed','enrolled','completed_live'
  ];
  w text;
  combined text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_type = ANY (forbidden_types) THEN
      RAISE EXCEPTION 'forbidden_approval_type: %', NEW.approval_type;
    END IF;
    IF NEW.approval_status = ANY (forbidden_statuses) THEN
      RAISE EXCEPTION 'forbidden_approval_status: %', NEW.approval_status;
    END IF;
    IF NEW.approval_status <> 'requested' THEN
      RAISE EXCEPTION 'invalid_initial_status: %', NEW.approval_status;
    END IF;

    combined := lower(coalesce(NEW.approval_title,'') || ' ' ||
                      coalesce(NEW.approval_summary,'') || ' ' ||
                      coalesce(NEW.rejection_reason,''));
    FOREACH w IN ARRAY banned LOOP
      IF position(w IN combined) > 0 THEN
        RAISE EXCEPTION 'forbidden_approval_wording: token=%', w;
      END IF;
    END LOOP;

    IF NEW.would_execute IS DISTINCT FROM false
       OR NEW.execution_blocked IS DISTINCT FROM true
       OR NEW.dispatch_blocked IS DISTINCT FROM true
       OR NEW.safety_blocked IS DISTINCT FROM true
       OR NEW.approval_does_not_execute IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'safety_flags_violated';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable columns
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.source_dry_run_id IS DISTINCT FROM OLD.source_dry_run_id
      OR NEW.source_proposal_id IS DISTINCT FROM OLD.source_proposal_id
      OR NEW.app_id IS DISTINCT FROM OLD.app_id
      OR NEW.event_name IS DISTINCT FROM OLD.event_name
      OR NEW.approval_type IS DISTINCT FROM OLD.approval_type
      OR NEW.approval_title IS DISTINCT FROM OLD.approval_title
      OR NEW.approval_summary IS DISTINCT FROM OLD.approval_summary
      OR NEW.requested_by_system IS DISTINCT FROM OLD.requested_by_system
      OR NEW.requested_by_user IS DISTINCT FROM OLD.requested_by_user
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
      OR NEW.would_execute IS DISTINCT FROM OLD.would_execute
      OR NEW.execution_blocked IS DISTINCT FROM OLD.execution_blocked
      OR NEW.dispatch_blocked IS DISTINCT FROM OLD.dispatch_blocked
      OR NEW.safety_blocked IS DISTINCT FROM OLD.safety_blocked
      OR NEW.approval_does_not_execute IS DISTINCT FROM OLD.approval_does_not_execute
    THEN
      RAISE EXCEPTION 'immutable_column_modified';
    END IF;

    IF NEW.approval_status = ANY (forbidden_statuses) THEN
      RAISE EXCEPTION 'forbidden_approval_status: %', NEW.approval_status;
    END IF;

    -- State machine
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
      IF NOT (
        (OLD.approval_status = 'requested'      AND NEW.approval_status IN ('reviewed','rejected','expired','archived'))
        OR (OLD.approval_status = 'reviewed'    AND NEW.approval_status IN ('second_reviewed','rejected','expired','archived'))
        OR (OLD.approval_status = 'second_reviewed' AND NEW.approval_status = 'archived')
        OR (OLD.approval_status = 'rejected'    AND NEW.approval_status = 'archived')
        OR (OLD.approval_status = 'expired'     AND NEW.approval_status = 'archived')
      ) THEN
        RAISE EXCEPTION 'invalid_status_transition: % -> %', OLD.approval_status, NEW.approval_status;
      END IF;
    END IF;

    -- Two-key on second_reviewed
    IF NEW.approval_status = 'second_reviewed' THEN
      IF NEW.second_reviewed_by IS NULL OR NEW.reviewed_by IS NULL THEN
        RAISE EXCEPTION 'two_key_required';
      END IF;
      IF NEW.second_reviewed_by = NEW.reviewed_by THEN
        RAISE EXCEPTION 'two_key_same_user';
      END IF;
    END IF;

    -- Rejection requires reason
    IF NEW.approval_status = 'rejected' AND OLD.approval_status <> 'rejected' THEN
      IF NEW.rejection_reason IS NULL OR length(trim(NEW.rejection_reason)) = 0 THEN
        RAISE EXCEPTION 'rejection_reason_required';
      END IF;
      -- Re-scan banned words on rejection_reason
      combined := lower(coalesce(NEW.rejection_reason,''));
      FOREACH w IN ARRAY banned LOOP
        IF position(w IN combined) > 0 THEN
          RAISE EXCEPTION 'forbidden_approval_wording: token=%', w;
        END IF;
      END LOOP;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vos_approval_requests_guard_trg ON public.vos_approval_requests;
CREATE TRIGGER vos_approval_requests_guard_trg
BEFORE INSERT OR UPDATE ON public.vos_approval_requests
FOR EACH ROW EXECUTE FUNCTION public.vos_approval_requests_guard();

-- RLS
ALTER TABLE public.vos_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vos_appr_admin_select"
ON public.vos_approval_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vos_appr_admin_update"
ON public.vos_approval_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- No INSERT policy → only service role can insert.
-- No DELETE policy → no one can delete.
