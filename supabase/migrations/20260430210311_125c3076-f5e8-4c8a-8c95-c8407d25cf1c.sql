-- Step 5B — vos_crm_internal_notes (internal-only CRM note primitive)
-- INERT. No external write surface. Admin-only RLS + guard trigger.

CREATE TABLE public.vos_crm_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Source chain (immutable)
  source_manual_action_id uuid NOT NULL REFERENCES public.vos_manual_action_log(id) ON DELETE RESTRICT,
  source_approval_request_id uuid NOT NULL REFERENCES public.vos_approval_requests(id) ON DELETE RESTRICT,
  source_integration_draft_id uuid NOT NULL REFERENCES public.vos_integration_action_drafts(id) ON DELETE RESTRICT,

  -- Optional polymorphic contact reference
  contact_ref_type text NOT NULL DEFAULT 'none',
  contact_ref_id uuid NULL,

  -- Note content
  note_body text NOT NULL,
  note_kind text NOT NULL DEFAULT 'internal_observation',
  corrects_note_id uuid NULL REFERENCES public.vos_crm_internal_notes(id) ON DELETE RESTRICT,

  -- Authorship
  author_user_id uuid NOT NULL,

  -- Idempotency
  dedupe_key text NOT NULL UNIQUE,

  -- Safety invariants (also defended by trigger)
  customer_visible boolean NOT NULL DEFAULT false,
  automation_safe boolean NOT NULL DEFAULT true,
  bulk_action boolean NOT NULL DEFAULT false,
  external_write_performed boolean NOT NULL DEFAULT false,

  -- Axis snapshots
  axis_a_snapshot text NOT NULL DEFAULT 'RED',
  axis_b_snapshot text NOT NULL DEFAULT 'OFF',

  -- Lifecycle
  note_status text NOT NULL DEFAULT 'recorded',
  archived_at timestamptz NULL,
  archived_by uuid NULL,
  archive_reason text NULL,

  -- Tagging / audit metadata
  tags text[] NOT NULL DEFAULT '{}',
  redaction_summary jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Hard CHECK constraints
  CONSTRAINT vcin_customer_visible_chk CHECK (customer_visible = false),
  CONSTRAINT vcin_automation_safe_chk CHECK (automation_safe = true),
  CONSTRAINT vcin_bulk_action_chk CHECK (bulk_action = false),
  CONSTRAINT vcin_external_write_chk CHECK (external_write_performed = false),
  CONSTRAINT vcin_axis_a_chk CHECK (axis_a_snapshot = 'RED'),
  CONSTRAINT vcin_axis_b_chk CHECK (axis_b_snapshot = 'OFF'),
  CONSTRAINT vcin_note_kind_chk CHECK (note_kind IN ('internal_observation','internal_correction')),
  CONSTRAINT vcin_contact_ref_type_chk CHECK (contact_ref_type IN ('lead_inbox','none')),
  CONSTRAINT vcin_note_status_chk CHECK (note_status IN ('recorded','corrected','archived')),
  CONSTRAINT vcin_note_body_length_chk CHECK (length(note_body) BETWEEN 1 AND 2000),
  CONSTRAINT vcin_correction_requires_target_chk
    CHECK ((note_kind <> 'internal_correction') OR (corrects_note_id IS NOT NULL)),
  CONSTRAINT vcin_contact_ref_consistency_chk
    CHECK (
      (contact_ref_type = 'none' AND contact_ref_id IS NULL)
      OR (contact_ref_type = 'lead_inbox' AND contact_ref_id IS NOT NULL)
    ),
  CONSTRAINT vcin_archive_consistency_chk
    CHECK (
      (note_status <> 'archived')
      OR (archived_at IS NOT NULL AND archived_by IS NOT NULL AND archive_reason IS NOT NULL)
    ),
  CONSTRAINT vcin_dedupe_key_format_chk CHECK (dedupe_key ~ '^[0-9a-f]{64}$')
);

-- Indexes
CREATE INDEX vcin_source_manual_idx ON public.vos_crm_internal_notes(source_manual_action_id);
CREATE INDEX vcin_source_draft_idx ON public.vos_crm_internal_notes(source_integration_draft_id);
CREATE INDEX vcin_contact_ref_idx ON public.vos_crm_internal_notes(contact_ref_type, contact_ref_id) WHERE contact_ref_id IS NOT NULL;
CREATE INDEX vcin_author_created_idx ON public.vos_crm_internal_notes(author_user_id, created_at DESC);
CREATE INDEX vcin_status_created_idx ON public.vos_crm_internal_notes(note_status, created_at DESC);

-- RLS
ALTER TABLE public.vos_crm_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vcin_admin_select" ON public.vos_crm_internal_notes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vcin_admin_insert" ON public.vos_crm_internal_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND author_user_id = auth.uid());

CREATE POLICY "vcin_admin_update" ON public.vos_crm_internal_notes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- NO DELETE POLICY — hard delete impossible by default-deny + trigger

-- Guard trigger function
CREATE OR REPLACE FUNCTION public.vos_crm_internal_notes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  banned text[] := ARRAY[
    'send','reply','enrol','enroll','follow up','push','dispatch',
    'forward','contact','message','notify','automate','trigger','schedule'
  ];
  pii_email text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
  pii_sa_id text := '\m\d{13}\M';
  pii_phone_intl text := '\+27\s?\d[\d\s-]{7,12}';
  pii_phone_local text := '\m0[1-9]\d[\d\s-]{7,10}\M';
  w text;
  combined text;
  draft RECORD;
  ma RECORD;
  appr RECORD;
  flag_axis_a boolean;
  flag_axis_b boolean;
  corr RECORD;
  lead_exists boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 1. Admin gate
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'not_admin';
    END IF;

    -- 2. Author must be the caller
    IF NEW.author_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'author_mismatch';
    END IF;

    -- 3. Re-assert safety flags (defense in depth above CHECKs)
    IF NEW.customer_visible IS DISTINCT FROM false
       OR NEW.automation_safe IS DISTINCT FROM true
       OR NEW.bulk_action IS DISTINCT FROM false
       OR NEW.external_write_performed IS DISTINCT FROM false
       OR NEW.axis_a_snapshot IS DISTINCT FROM 'RED'
       OR NEW.axis_b_snapshot IS DISTINCT FROM 'OFF' THEN
      RAISE EXCEPTION 'safety_flags_violated';
    END IF;

    -- 4. Live platform flag check — Axis A and Axis B must be locked
    SELECT
      (SELECT flag_value FROM public.vos_platform_flags WHERE flag_key='VANTO_OS_ENABLED') = 'false'
      AND (SELECT flag_value FROM public.vos_platform_flags WHERE flag_key='EMAIL_SEND_ENABLED') = 'false'
      AND (SELECT flag_value FROM public.vos_platform_flags WHERE flag_key='WHATSAPP_SEND_ENABLED') = 'false'
    INTO flag_axis_a;
    IF NOT COALESCE(flag_axis_a, false) THEN
      RAISE EXCEPTION 'axis_a_flags_not_red';
    END IF;
    SELECT
      (SELECT flag_value FROM public.vos_platform_flags WHERE flag_key='VOS_INBOX_RECEIVE_ENABLED') = 'false'
      AND (SELECT flag_value FROM public.vos_platform_flags WHERE flag_key='VOS_INBOX_RECEIVE_APP_APLGO_ENABLED') = 'false'
      AND (SELECT flag_value FROM public.vos_platform_flags WHERE flag_key='VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED') = 'false'
    INTO flag_axis_b;
    IF NOT COALESCE(flag_axis_b, false) THEN
      RAISE EXCEPTION 'axis_b_flags_not_off';
    END IF;

    -- 5. Source chain: integration draft
    SELECT * INTO draft FROM public.vos_integration_action_drafts WHERE id = NEW.source_integration_draft_id;
    IF draft IS NULL THEN
      RAISE EXCEPTION 'integration_draft_not_found';
    END IF;
    IF draft.target_app <> 'crm' THEN
      RAISE EXCEPTION 'draft_target_app_invalid: %', draft.target_app;
    END IF;
    IF draft.integration_action_type <> 'crm_note_draft_internal' THEN
      RAISE EXCEPTION 'draft_type_invalid: %', draft.integration_action_type;
    END IF;
    IF draft.would_write_external IS DISTINCT FROM false
       OR draft.external_write_blocked IS DISTINCT FROM true
       OR draft.customer_visible IS DISTINCT FROM false
       OR draft.bulk_action IS DISTINCT FROM false
       OR draft.rollback_required IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'draft_safety_flags_violated';
    END IF;
    IF draft.draft_status NOT IN ('proposed','reviewed') THEN
      RAISE EXCEPTION 'draft_status_invalid: %', draft.draft_status;
    END IF;
    -- Linkage: draft must point to the same manual action / approval
    IF draft.source_manual_action_id <> NEW.source_manual_action_id
       OR draft.source_approval_request_id <> NEW.source_approval_request_id THEN
      RAISE EXCEPTION 'draft_chain_mismatch';
    END IF;

    -- 6. Source chain: manual action
    SELECT * INTO ma FROM public.vos_manual_action_log WHERE id = NEW.source_manual_action_id;
    IF ma IS NULL THEN
      RAISE EXCEPTION 'manual_action_not_found';
    END IF;
    IF ma.action_type <> 'internal_admin_note_record' THEN
      RAISE EXCEPTION 'manual_action_type_invalid';
    END IF;
    IF ma.action_status <> 'performed' THEN
      RAISE EXCEPTION 'manual_action_not_performed';
    END IF;
    IF ma.external_call_performed OR ma.downstream_write_performed OR ma.customer_visible THEN
      RAISE EXCEPTION 'manual_action_unsafe';
    END IF;
    IF ma.axis_a_snapshot <> 'RED' OR ma.axis_b_snapshot <> 'OFF' THEN
      RAISE EXCEPTION 'manual_action_axis_drift';
    END IF;

    -- 7. Source chain: approval (two-key)
    SELECT * INTO appr FROM public.vos_approval_requests WHERE id = NEW.source_approval_request_id;
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

    -- 8. Banned wording
    combined := lower(coalesce(NEW.note_body,'') || ' ' || coalesce(NEW.redaction_summary::text,''));
    FOREACH w IN ARRAY banned LOOP
      IF position(w IN combined) > 0 THEN
        RAISE EXCEPTION 'forbidden_note_wording: token=%', w;
      END IF;
    END LOOP;

    -- 9. PII regex scan (post-redaction; raw PII must not survive)
    IF NEW.note_body ~ pii_email THEN RAISE EXCEPTION 'pii_not_redacted: email'; END IF;
    IF NEW.note_body ~ pii_sa_id THEN RAISE EXCEPTION 'pii_not_redacted: sa_id'; END IF;
    IF NEW.note_body ~ pii_phone_intl THEN RAISE EXCEPTION 'pii_not_redacted: phone_intl'; END IF;
    IF NEW.note_body ~ pii_phone_local THEN RAISE EXCEPTION 'pii_not_redacted: phone_local'; END IF;

    -- 10. Correction validation
    IF NEW.note_kind = 'internal_correction' THEN
      IF NEW.corrects_note_id IS NULL THEN
        RAISE EXCEPTION 'correction_target_required';
      END IF;
      SELECT * INTO corr FROM public.vos_crm_internal_notes WHERE id = NEW.corrects_note_id;
      IF corr IS NULL THEN RAISE EXCEPTION 'correction_target_not_found'; END IF;
      IF corr.note_kind = 'internal_correction' THEN
        RAISE EXCEPTION 'correction_chain_forbidden';
      END IF;
      IF corr.note_status = 'archived' THEN
        RAISE EXCEPTION 'correction_target_archived';
      END IF;
    END IF;

    -- 11. lead_inbox FK (polymorphic, enforced here)
    IF NEW.contact_ref_type = 'lead_inbox' THEN
      SELECT EXISTS(SELECT 1 FROM public.lead_inbox WHERE id = NEW.contact_ref_id) INTO lead_exists;
      IF NOT lead_exists THEN
        RAISE EXCEPTION 'lead_inbox_not_found';
      END IF;
    END IF;

    -- 12. Dedupe key format already CHECKed; trigger asserts again for clarity
    IF NEW.dedupe_key !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'dedupe_key_format_invalid';
    END IF;

    -- 13. Initial status
    IF NEW.note_status <> 'recorded' THEN
      RAISE EXCEPTION 'invalid_initial_status: %', NEW.note_status;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable columns — only archive/status/correction-link metadata may change
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.source_manual_action_id IS DISTINCT FROM OLD.source_manual_action_id
      OR NEW.source_approval_request_id IS DISTINCT FROM OLD.source_approval_request_id
      OR NEW.source_integration_draft_id IS DISTINCT FROM OLD.source_integration_draft_id
      OR NEW.contact_ref_type IS DISTINCT FROM OLD.contact_ref_type
      OR NEW.contact_ref_id IS DISTINCT FROM OLD.contact_ref_id
      OR NEW.note_body IS DISTINCT FROM OLD.note_body
      OR NEW.note_kind IS DISTINCT FROM OLD.note_kind
      OR NEW.corrects_note_id IS DISTINCT FROM OLD.corrects_note_id
      OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
      OR NEW.customer_visible IS DISTINCT FROM OLD.customer_visible
      OR NEW.automation_safe IS DISTINCT FROM OLD.automation_safe
      OR NEW.bulk_action IS DISTINCT FROM OLD.bulk_action
      OR NEW.external_write_performed IS DISTINCT FROM OLD.external_write_performed
      OR NEW.axis_a_snapshot IS DISTINCT FROM OLD.axis_a_snapshot
      OR NEW.axis_b_snapshot IS DISTINCT FROM OLD.axis_b_snapshot
      OR NEW.tags IS DISTINCT FROM OLD.tags
      OR NEW.redaction_summary::text IS DISTINCT FROM OLD.redaction_summary::text
    THEN
      RAISE EXCEPTION 'immutable_column_modified';
    END IF;

    -- Status transitions
    IF NEW.note_status IS DISTINCT FROM OLD.note_status THEN
      IF NOT (
        (OLD.note_status = 'recorded'  AND NEW.note_status IN ('archived','corrected'))
        OR (OLD.note_status = 'corrected' AND NEW.note_status = 'archived')
      ) THEN
        RAISE EXCEPTION 'invalid_status_transition: % -> %', OLD.note_status, NEW.note_status;
      END IF;
    END IF;

    -- recorded -> corrected requires a sibling correction note exists
    IF OLD.note_status = 'recorded' AND NEW.note_status = 'corrected' THEN
      IF NOT EXISTS (SELECT 1 FROM public.vos_crm_internal_notes WHERE corrects_note_id = OLD.id) THEN
        RAISE EXCEPTION 'correction_sibling_required';
      END IF;
    END IF;

    -- Archive consistency
    IF NEW.note_status = 'archived' AND OLD.note_status <> 'archived' THEN
      IF NEW.archived_at IS NULL OR NEW.archived_by IS NULL OR NEW.archive_reason IS NULL OR length(trim(NEW.archive_reason)) = 0 THEN
        RAISE EXCEPTION 'archive_metadata_required';
      END IF;
      IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'archive_admin_only';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'hard_delete_forbidden';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER vcin_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.vos_crm_internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.vos_crm_internal_notes_guard();