-- Step 4Y: Integration Drafts Internal-Only Layer

CREATE TABLE IF NOT EXISTS public.vos_integration_action_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source_manual_action_id uuid NOT NULL,
  source_approval_request_id uuid NOT NULL,
  source_dry_run_id uuid NOT NULL,
  source_proposal_id uuid NOT NULL,
  target_app text NOT NULL,
  target_surface text NOT NULL,
  integration_action_type text NOT NULL,
  draft_title text NOT NULL,
  draft_summary text NOT NULL,
  draft_payload_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_status text NOT NULL DEFAULT 'proposed',
  would_write_external boolean NOT NULL DEFAULT false,
  external_write_blocked boolean NOT NULL DEFAULT true,
  customer_visible boolean NOT NULL DEFAULT false,
  bulk_action boolean NOT NULL DEFAULT false,
  rollback_required boolean NOT NULL DEFAULT true,
  approved_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_system text NOT NULL DEFAULT 'vos-integration-draft-recorder-v1',
  reviewed_by uuid NULL,
  reviewed_at timestamptz NULL,
  dedupe_key text NOT NULL UNIQUE,

  CONSTRAINT vos_iad_target_app_chk CHECK (target_app IN ('crm','zazi_mail','aplgo')),
  CONSTRAINT vos_iad_action_type_chk CHECK (integration_action_type IN (
    'crm_note_draft_internal','zazi_tag_draft_internal','aplgo_interest_note_draft_internal','read_only_context_link'
  )),
  CONSTRAINT vos_iad_status_chk CHECK (draft_status IN ('proposed','reviewed','dismissed','archived')),
  CONSTRAINT vos_iad_would_write_chk CHECK (would_write_external = false),
  CONSTRAINT vos_iad_ext_blocked_chk CHECK (external_write_blocked = true),
  CONSTRAINT vos_iad_cust_vis_chk CHECK (customer_visible = false),
  CONSTRAINT vos_iad_bulk_chk CHECK (bulk_action = false),
  CONSTRAINT vos_iad_rollback_chk CHECK (rollback_required = true)
);

CREATE INDEX IF NOT EXISTS vos_iad_source_manual_idx ON public.vos_integration_action_drafts(source_manual_action_id);
CREATE INDEX IF NOT EXISTS vos_iad_status_idx ON public.vos_integration_action_drafts(draft_status);
CREATE INDEX IF NOT EXISTS vos_iad_target_idx ON public.vos_integration_action_drafts(target_app);

ALTER TABLE public.vos_integration_action_drafts ENABLE ROW LEVEL SECURITY;

-- Admin SELECT only
CREATE POLICY "vos_iad_admin_select"
  ON public.vos_integration_action_drafts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin UPDATE only — and only allowed status transitions are enforced by trigger
CREATE POLICY "vos_iad_admin_update"
  ON public.vos_integration_action_drafts
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- No INSERT policy (service role bypasses RLS via edge function)
-- No DELETE policy

-- Guard trigger
CREATE OR REPLACE FUNCTION public.vos_integration_action_drafts_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  banned text[] := ARRAY[
    'send','reply','enrol','enroll','follow up','push','dispatch',
    'forward','contact','message','notify','automate','trigger','schedule'
  ];
  forbidden_types text[] := ARRAY[
    'whatsapp_send','email_send','crm_write_live','zazi_enroll_live','aplgo_writeback_live',
    'dispatcher_run','master_prospector_wake','phase_4a_start','bulk_action','external_api_call_live'
  ];
  forbidden_statuses text[] := ARRAY[
    'sent','dispatched','pushed','enrolled','executed_external','completed_live','written_live'
  ];
  allowed_apps text[] := ARRAY['crm','zazi_mail','aplgo'];
  allowed_types text[] := ARRAY['crm_note_draft_internal','zazi_tag_draft_internal','aplgo_interest_note_draft_internal','read_only_context_link'];
  w text;
  combined text;
  ma RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT (NEW.target_app = ANY (allowed_apps)) THEN
      RAISE EXCEPTION 'forbidden_target_app: %', NEW.target_app;
    END IF;
    IF NEW.integration_action_type = ANY (forbidden_types) THEN
      RAISE EXCEPTION 'forbidden_integration_action_type: %', NEW.integration_action_type;
    END IF;
    IF NOT (NEW.integration_action_type = ANY (allowed_types)) THEN
      RAISE EXCEPTION 'integration_action_type_not_allowlisted: %', NEW.integration_action_type;
    END IF;
    IF NEW.draft_status = ANY (forbidden_statuses) THEN
      RAISE EXCEPTION 'forbidden_draft_status: %', NEW.draft_status;
    END IF;
    IF NEW.draft_status <> 'proposed' THEN
      RAISE EXCEPTION 'invalid_initial_status: %', NEW.draft_status;
    END IF;

    -- Re-assert safety flags (defense in depth)
    IF NEW.would_write_external IS DISTINCT FROM false
       OR NEW.external_write_blocked IS DISTINCT FROM true
       OR NEW.customer_visible IS DISTINCT FROM false
       OR NEW.bulk_action IS DISTINCT FROM false
       OR NEW.rollback_required IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'safety_flags_violated';
    END IF;

    -- Banned wording
    combined := lower(coalesce(NEW.draft_title,'') || ' ' ||
                      coalesce(NEW.draft_summary,'') || ' ' ||
                      coalesce(NEW.draft_payload_redacted::text,''));
    FOREACH w IN ARRAY banned LOOP
      IF position(w IN combined) > 0 THEN
        RAISE EXCEPTION 'forbidden_draft_wording: token=%', w;
      END IF;
    END LOOP;

    -- Verify linked manual action
    SELECT m.action_type, m.action_status, m.downstream_write_performed,
           m.external_call_performed, m.customer_visible,
           m.axis_a_snapshot, m.axis_b_snapshot,
           m.source_approval_request_id, m.source_dry_run_id, m.source_proposal_id
      INTO ma
      FROM public.vos_manual_action_log m
     WHERE m.id = NEW.source_manual_action_id;

    IF ma IS NULL THEN
      RAISE EXCEPTION 'manual_action_not_found';
    END IF;
    IF ma.action_type <> 'internal_admin_note_record' THEN
      RAISE EXCEPTION 'manual_action_type_invalid: %', ma.action_type;
    END IF;
    IF ma.action_status <> 'performed' THEN
      RAISE EXCEPTION 'manual_action_not_performed: %', ma.action_status;
    END IF;
    IF ma.downstream_write_performed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'manual_action_downstream_write_performed';
    END IF;
    IF ma.external_call_performed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'manual_action_external_call_performed';
    END IF;
    IF ma.customer_visible IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'manual_action_customer_visible';
    END IF;
    IF ma.axis_a_snapshot <> 'RED' THEN
      RAISE EXCEPTION 'axis_a_not_red';
    END IF;
    IF ma.axis_b_snapshot <> 'OFF' THEN
      RAISE EXCEPTION 'axis_b_not_off';
    END IF;

    -- Snapshot linkage must match manual action's chain
    IF NEW.source_approval_request_id <> ma.source_approval_request_id
       OR NEW.source_dry_run_id <> ma.source_dry_run_id
       OR NEW.source_proposal_id <> ma.source_proposal_id THEN
      RAISE EXCEPTION 'source_chain_mismatch';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable columns
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.source_manual_action_id IS DISTINCT FROM OLD.source_manual_action_id
      OR NEW.source_approval_request_id IS DISTINCT FROM OLD.source_approval_request_id
      OR NEW.source_dry_run_id IS DISTINCT FROM OLD.source_dry_run_id
      OR NEW.source_proposal_id IS DISTINCT FROM OLD.source_proposal_id
      OR NEW.target_app IS DISTINCT FROM OLD.target_app
      OR NEW.target_surface IS DISTINCT FROM OLD.target_surface
      OR NEW.integration_action_type IS DISTINCT FROM OLD.integration_action_type
      OR NEW.draft_title IS DISTINCT FROM OLD.draft_title
      OR NEW.draft_summary IS DISTINCT FROM OLD.draft_summary
      OR NEW.draft_payload_redacted::text IS DISTINCT FROM OLD.draft_payload_redacted::text
      OR NEW.would_write_external IS DISTINCT FROM OLD.would_write_external
      OR NEW.external_write_blocked IS DISTINCT FROM OLD.external_write_blocked
      OR NEW.customer_visible IS DISTINCT FROM OLD.customer_visible
      OR NEW.bulk_action IS DISTINCT FROM OLD.bulk_action
      OR NEW.rollback_required IS DISTINCT FROM OLD.rollback_required
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
    THEN
      RAISE EXCEPTION 'immutable_column_modified';
    END IF;

    IF NEW.draft_status = ANY (forbidden_statuses) THEN
      RAISE EXCEPTION 'forbidden_draft_status: %', NEW.draft_status;
    END IF;

    -- State machine
    IF NEW.draft_status IS DISTINCT FROM OLD.draft_status THEN
      IF NOT (
        (OLD.draft_status = 'proposed'  AND NEW.draft_status IN ('reviewed','dismissed','archived'))
        OR (OLD.draft_status = 'reviewed'  AND NEW.draft_status = 'archived')
        OR (OLD.draft_status = 'dismissed' AND NEW.draft_status = 'archived')
      ) THEN
        RAISE EXCEPTION 'invalid_status_transition: % -> %', OLD.draft_status, NEW.draft_status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vos_iad_guard ON public.vos_integration_action_drafts;
CREATE TRIGGER vos_iad_guard
  BEFORE INSERT OR UPDATE ON public.vos_integration_action_drafts
  FOR EACH ROW EXECUTE FUNCTION public.vos_integration_action_drafts_guard();