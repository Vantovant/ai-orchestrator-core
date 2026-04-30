-- Step 4Q — Inert Proposal Queue
-- Hard safety: would_dispatch=false, dispatch_blocked=true, safety_blocked=true.
-- Admin SELECT + restricted UPDATE only. Service-role INSERT only. No DELETE policy.

CREATE TABLE IF NOT EXISTS public.vos_proposal_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source_receipt_id uuid NULL,
  source_audit_id uuid NULL,
  app_id text NOT NULL,
  event_name text NULL,
  intelligence_category text NOT NULL,
  risk_level text NOT NULL,
  proposal_type text NOT NULL,
  proposal_title text NOT NULL,
  proposal_summary text NOT NULL,
  proposal_status text NOT NULL DEFAULT 'proposed',
  confidence text NOT NULL,
  reason text NOT NULL,
  safety_blocked boolean NOT NULL DEFAULT true,
  would_dispatch boolean NOT NULL DEFAULT false,
  dispatch_blocked boolean NOT NULL DEFAULT true,
  created_by_system text NOT NULL DEFAULT 'vos-proposal-curator-v1',
  reviewed_by uuid NULL,
  reviewed_at timestamptz NULL,
  dedupe_key text NOT NULL UNIQUE,

  CONSTRAINT vos_proposal_queue_type_chk CHECK (
    proposal_type IN (
      'manual_review','admin_note_draft','risk_review',
      'classification_review','no_action_record'
    )
  ),
  CONSTRAINT vos_proposal_queue_status_chk CHECK (
    proposal_status IN ('proposed','reviewed','dismissed','archived')
  ),
  CONSTRAINT vos_proposal_queue_no_dispatch_chk CHECK (would_dispatch = false),
  CONSTRAINT vos_proposal_queue_blocked_chk CHECK (dispatch_blocked = true),
  CONSTRAINT vos_proposal_queue_safety_chk CHECK (safety_blocked = true),
  CONSTRAINT vos_proposal_queue_risk_chk CHECK (
    risk_level IN ('info','low','medium','medium-high','high','unknown')
  ),
  CONSTRAINT vos_proposal_queue_confidence_chk CHECK (
    confidence IN ('low','medium','high')
  )
);

CREATE INDEX IF NOT EXISTS idx_vos_proposal_queue_created_at
  ON public.vos_proposal_queue (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vos_proposal_queue_app_event
  ON public.vos_proposal_queue (app_id, event_name);
CREATE INDEX IF NOT EXISTS idx_vos_proposal_queue_status
  ON public.vos_proposal_queue (proposal_status);
CREATE INDEX IF NOT EXISTS idx_vos_proposal_queue_source_receipt
  ON public.vos_proposal_queue (source_receipt_id);

ALTER TABLE public.vos_proposal_queue ENABLE ROW LEVEL SECURITY;

-- Admin SELECT only
CREATE POLICY "Admins read vos_proposal_queue"
  ON public.vos_proposal_queue
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin UPDATE only (column restriction enforced by trigger below)
CREATE POLICY "Admins update vos_proposal_queue"
  ON public.vos_proposal_queue
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- NO INSERT policy for authenticated/anon → service role only path (bypass RLS).
-- NO DELETE policy by design.

-- Forbidden-verb guard for proposal text + immutability + status-transition guard.
CREATE OR REPLACE FUNCTION public.vos_proposal_queue_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  banned text[] := ARRAY[
    'send','reply','enrol','enroll','follow up','push','dispatch',
    'forward','contact','message','notify','automate','trigger','schedule'
  ];
  w text;
  combined text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    combined := lower(coalesce(NEW.proposal_title,'') || ' ' || coalesce(NEW.proposal_summary,'') || ' ' || coalesce(NEW.reason,''));
    FOREACH w IN ARRAY banned LOOP
      IF position(w IN combined) > 0 THEN
        RAISE EXCEPTION 'forbidden_proposal_wording: token=%', w;
      END IF;
    END LOOP;
    -- Hard re-assert safety flags on insert (defense in depth)
    IF NEW.would_dispatch IS DISTINCT FROM false
       OR NEW.dispatch_blocked IS DISTINCT FROM true
       OR NEW.safety_blocked IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'safety_flags_violated';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable columns
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.source_receipt_id IS DISTINCT FROM OLD.source_receipt_id
      OR NEW.source_audit_id IS DISTINCT FROM OLD.source_audit_id
      OR NEW.app_id IS DISTINCT FROM OLD.app_id
      OR NEW.event_name IS DISTINCT FROM OLD.event_name
      OR NEW.intelligence_category IS DISTINCT FROM OLD.intelligence_category
      OR NEW.risk_level IS DISTINCT FROM OLD.risk_level
      OR NEW.proposal_type IS DISTINCT FROM OLD.proposal_type
      OR NEW.proposal_title IS DISTINCT FROM OLD.proposal_title
      OR NEW.proposal_summary IS DISTINCT FROM OLD.proposal_summary
      OR NEW.confidence IS DISTINCT FROM OLD.confidence
      OR NEW.reason IS DISTINCT FROM OLD.reason
      OR NEW.safety_blocked IS DISTINCT FROM OLD.safety_blocked
      OR NEW.would_dispatch IS DISTINCT FROM OLD.would_dispatch
      OR NEW.dispatch_blocked IS DISTINCT FROM OLD.dispatch_blocked
      OR NEW.created_by_system IS DISTINCT FROM OLD.created_by_system
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
    THEN
      RAISE EXCEPTION 'immutable_column_modified';
    END IF;

    -- Status transitions: from 'proposed' → reviewed/dismissed/archived;
    -- from 'reviewed' → archived; from 'dismissed' → archived; no other moves.
    IF NEW.proposal_status IS DISTINCT FROM OLD.proposal_status THEN
      IF NOT (
        (OLD.proposal_status = 'proposed'  AND NEW.proposal_status IN ('reviewed','dismissed','archived'))
        OR (OLD.proposal_status = 'reviewed'  AND NEW.proposal_status = 'archived')
        OR (OLD.proposal_status = 'dismissed' AND NEW.proposal_status = 'archived')
      ) THEN
        RAISE EXCEPTION 'invalid_status_transition: % -> %', OLD.proposal_status, NEW.proposal_status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vos_proposal_queue_guard ON public.vos_proposal_queue;
CREATE TRIGGER trg_vos_proposal_queue_guard
  BEFORE INSERT OR UPDATE ON public.vos_proposal_queue
  FOR EACH ROW EXECUTE FUNCTION public.vos_proposal_queue_guard();
