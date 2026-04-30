-- Step 4W — Manual Action Pilot log (internal admin note only, fully inert)

CREATE TABLE IF NOT EXISTS public.vos_manual_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source_approval_request_id uuid NOT NULL,
  source_dry_run_id uuid NOT NULL,
  source_proposal_id uuid NOT NULL,
  source_receipt_id uuid NULL,
  app_id text NOT NULL,
  event_name text NULL,
  action_type text NOT NULL,
  action_title text NOT NULL,
  action_summary text NOT NULL,
  admin_note text NULL,
  action_status text NOT NULL DEFAULT 'performed',
  action_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid NOT NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid NOT NULL,
  second_reviewed_by uuid NOT NULL,
  safety_blocked_snapshot boolean NOT NULL DEFAULT true,
  axis_a_snapshot text NOT NULL DEFAULT 'RED',
  axis_b_snapshot text NOT NULL DEFAULT 'OFF',
  downstream_target text NOT NULL DEFAULT 'none',
  downstream_write_performed boolean NOT NULL DEFAULT false,
  customer_visible boolean NOT NULL DEFAULT false,
  external_call_performed boolean NOT NULL DEFAULT false,
  rollback_available boolean NOT NULL DEFAULT true,
  rollback_status text NULL DEFAULT 'none',
  dedupe_key text NOT NULL UNIQUE,
  CONSTRAINT vos_mal_action_type_chk CHECK (action_type = 'internal_admin_note_record'),
  CONSTRAINT vos_mal_action_status_chk CHECK (action_status IN ('performed','archived','rollback_recorded')),
  CONSTRAINT vos_mal_downstream_write_chk CHECK (downstream_write_performed = false),
  CONSTRAINT vos_mal_customer_visible_chk CHECK (customer_visible = false),
  CONSTRAINT vos_mal_external_call_chk CHECK (external_call_performed = false),
  CONSTRAINT vos_mal_safety_blocked_chk CHECK (safety_blocked_snapshot = true),
  CONSTRAINT vos_mal_axis_a_chk CHECK (axis_a_snapshot = 'RED'),
  CONSTRAINT vos_mal_axis_b_chk CHECK (axis_b_snapshot = 'OFF'),
  CONSTRAINT vos_mal_downstream_target_chk CHECK (downstream_target = 'none'),
  CONSTRAINT vos_mal_two_key_distinct_chk CHECK (reviewed_by <> second_reviewed_by),
  CONSTRAINT vos_mal_rollback_status_chk CHECK (rollback_status IN ('none','archived','rollback_recorded'))
);

CREATE INDEX IF NOT EXISTS idx_vos_mal_approval ON public.vos_manual_action_log(source_approval_request_id);
CREATE INDEX IF NOT EXISTS idx_vos_mal_status ON public.vos_manual_action_log(action_status);
CREATE INDEX IF NOT EXISTS idx_vos_mal_created ON public.vos_manual_action_log(created_at DESC);

ALTER TABLE public.vos_manual_action_log ENABLE ROW LEVEL SECURITY;

-- Admin SELECT only
CREATE POLICY "vos_mal_admin_select"
  ON public.vos_manual_action_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin UPDATE only (further restricted to status fields by trigger)
CREATE POLICY "vos_mal_admin_update"
  ON public.vos_manual_action_log
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- No INSERT policy for clients — service role only via edge function.
-- No DELETE policy — archive only.

-- Guard trigger
CREATE OR REPLACE FUNCTION public.vos_manual_action_log_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  banned text[] := ARRAY[
    'send','reply','enrol','enroll','follow up','push','dispatch',
    'forward','contact','message','notify','automate','trigger','schedule'
  ];
  forbidden_types text[] := ARRAY[
    'whatsapp_send','email_send','crm_write','zazi_enroll','aplgo_writeback',
    'dispatcher_run','master_prospector_wake','phase_4a_start','bulk_action','external_api_call'
  ];
  forbidden_statuses text[] := ARRAY[
    'sent','dispatched','pushed','enrolled','executed_external','completed_live'
  ];
  w text;
  combined text;
  appr RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.action_type = ANY (forbidden_types) THEN
      RAISE EXCEPTION 'forbidden_action_type: %', NEW.action_type;
    END IF;
    IF NEW.action_type <> 'internal_admin_note_record' THEN
      RAISE EXCEPTION 'action_type_not_allowlisted: %', NEW.action_type;
    END IF;
    IF NEW.action_status = ANY (forbidden_statuses) THEN
      RAISE EXCEPTION 'forbidden_action_status: %', NEW.action_status;
    END IF;
    IF NEW.action_status <> 'performed' THEN
      RAISE EXCEPTION 'invalid_initial_status: %', NEW.action_status;
    END IF;

    -- Banned wording scan
    combined := lower(coalesce(NEW.action_title,'') || ' ' ||
                      coalesce(NEW.action_summary,'') || ' ' ||
                      coalesce(NEW.admin_note,'') || ' ' ||
                      coalesce(NEW.action_result::text,''));
    FOREACH w IN ARRAY banned LOOP
      IF position(w IN combined) > 0 THEN
        RAISE EXCEPTION 'forbidden_action_wording: token=%', w;
      END IF;
    END LOOP;

    -- Safety flag re-assert (defense in depth above CHECKs)
    IF NEW.downstream_write_performed IS DISTINCT FROM false
       OR NEW.customer_visible IS DISTINCT FROM false
       OR NEW.external_call_performed IS DISTINCT FROM false
       OR NEW.safety_blocked_snapshot IS DISTINCT FROM true
       OR NEW.axis_a_snapshot IS DISTINCT FROM 'RED'
       OR NEW.axis_b_snapshot IS DISTINCT FROM 'OFF'
       OR NEW.downstream_target IS DISTINCT FROM 'none' THEN
      RAISE EXCEPTION 'safety_flags_violated';
    END IF;

    -- Verify linked approval
    SELECT a.approval_status, a.reviewed_by, a.second_reviewed_by, a.expires_at
      INTO appr
      FROM public.vos_approval_requests a
     WHERE a.id = NEW.source_approval_request_id;

    IF appr IS NULL THEN
      RAISE EXCEPTION 'approval_not_found';
    END IF;
    IF appr.approval_status <> 'second_reviewed' THEN
      RAISE EXCEPTION 'approval_not_second_reviewed: %', appr.approval_status;
    END IF;
    IF appr.reviewed_by IS NULL OR appr.second_reviewed_by IS NULL THEN
      RAISE EXCEPTION 'two_key_required';
    END IF;
    IF appr.reviewed_by = appr.second_reviewed_by THEN
      RAISE EXCEPTION 'two_key_same_user';
    END IF;
    IF appr.expires_at IS NOT NULL AND appr.expires_at <= now() THEN
      RAISE EXCEPTION 'approval_expired';
    END IF;

    -- Snapshot reviewers must match approval
    IF NEW.reviewed_by <> appr.reviewed_by OR NEW.second_reviewed_by <> appr.second_reviewed_by THEN
      RAISE EXCEPTION 'reviewer_snapshot_mismatch';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable columns
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.source_approval_request_id IS DISTINCT FROM OLD.source_approval_request_id
      OR NEW.source_dry_run_id IS DISTINCT FROM OLD.source_dry_run_id
      OR NEW.source_proposal_id IS DISTINCT FROM OLD.source_proposal_id
      OR NEW.source_receipt_id IS DISTINCT FROM OLD.source_receipt_id
      OR NEW.app_id IS DISTINCT FROM OLD.app_id
      OR NEW.event_name IS DISTINCT FROM OLD.event_name
      OR NEW.action_type IS DISTINCT FROM OLD.action_type
      OR NEW.action_title IS DISTINCT FROM OLD.action_title
      OR NEW.action_summary IS DISTINCT FROM OLD.action_summary
      OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
      OR NEW.action_result::text IS DISTINCT FROM OLD.action_result::text
      OR NEW.performed_by IS DISTINCT FROM OLD.performed_by
      OR NEW.performed_at IS DISTINCT FROM OLD.performed_at
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.second_reviewed_by IS DISTINCT FROM OLD.second_reviewed_by
      OR NEW.safety_blocked_snapshot IS DISTINCT FROM OLD.safety_blocked_snapshot
      OR NEW.axis_a_snapshot IS DISTINCT FROM OLD.axis_a_snapshot
      OR NEW.axis_b_snapshot IS DISTINCT FROM OLD.axis_b_snapshot
      OR NEW.downstream_target IS DISTINCT FROM OLD.downstream_target
      OR NEW.downstream_write_performed IS DISTINCT FROM OLD.downstream_write_performed
      OR NEW.customer_visible IS DISTINCT FROM OLD.customer_visible
      OR NEW.external_call_performed IS DISTINCT FROM OLD.external_call_performed
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
    THEN
      RAISE EXCEPTION 'immutable_column_modified';
    END IF;

    IF NEW.action_status = ANY (forbidden_statuses) THEN
      RAISE EXCEPTION 'forbidden_action_status: %', NEW.action_status;
    END IF;

    -- State machine: performed -> archived | rollback_recorded ; rollback_recorded -> archived ; archived terminal
    IF NEW.action_status IS DISTINCT FROM OLD.action_status THEN
      IF NOT (
        (OLD.action_status = 'performed'         AND NEW.action_status IN ('archived','rollback_recorded'))
        OR (OLD.action_status = 'rollback_recorded' AND NEW.action_status = 'archived')
      ) THEN
        RAISE EXCEPTION 'invalid_status_transition: % -> %', OLD.action_status, NEW.action_status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vos_manual_action_log_guard ON public.vos_manual_action_log;
CREATE TRIGGER trg_vos_manual_action_log_guard
BEFORE INSERT OR UPDATE ON public.vos_manual_action_log
FOR EACH ROW EXECUTE FUNCTION public.vos_manual_action_log_guard();