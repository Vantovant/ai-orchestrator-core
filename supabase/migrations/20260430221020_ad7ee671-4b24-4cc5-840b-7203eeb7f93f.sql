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

    -- 9. PII regex scan
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

    -- 11. lead_inbox FK
    IF NEW.contact_ref_type = 'lead_inbox' THEN
      SELECT EXISTS(SELECT 1 FROM public.lead_inbox WHERE id = NEW.contact_ref_id) INTO lead_exists;
      IF NOT lead_exists THEN
        RAISE EXCEPTION 'lead_inbox_not_found';
      END IF;
    END IF;

    -- 12. Dedupe key format
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
    -- Immutable columns
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

    -- Archive consistency + Step 5E hardening
    IF NEW.note_status = 'archived' AND OLD.note_status <> 'archived' THEN
      IF NEW.archived_at IS NULL OR NEW.archived_by IS NULL OR NEW.archive_reason IS NULL OR length(trim(NEW.archive_reason)) = 0 THEN
        RAISE EXCEPTION 'archive_metadata_required';
      END IF;
      IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'archive_admin_only';
      END IF;

      -- Step 5E: minimum length on archive_reason
      IF length(trim(NEW.archive_reason)) < 5 THEN
        RAISE EXCEPTION 'archive_reason_too_short';
      END IF;

      -- Step 5E: banned wording scan on archive_reason
      combined := lower(NEW.archive_reason);
      FOREACH w IN ARRAY banned LOOP
        IF position(w IN combined) > 0 THEN
          RAISE EXCEPTION 'forbidden_archive_wording: token=%', w;
        END IF;
      END LOOP;

      -- Step 5E: PII regex scan on archive_reason
      IF NEW.archive_reason ~ pii_email      THEN RAISE EXCEPTION 'pii_in_archive_reason: email'; END IF;
      IF NEW.archive_reason ~ pii_sa_id      THEN RAISE EXCEPTION 'pii_in_archive_reason: sa_id'; END IF;
      IF NEW.archive_reason ~ pii_phone_intl THEN RAISE EXCEPTION 'pii_in_archive_reason: phone_intl'; END IF;
      IF NEW.archive_reason ~ pii_phone_local THEN RAISE EXCEPTION 'pii_in_archive_reason: phone_local'; END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'hard_delete_forbidden';
  END IF;

  RETURN NEW;
END;
$function$;