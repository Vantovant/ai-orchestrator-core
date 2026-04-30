-- Step 4S — Dry-Run Action Engine table
CREATE TABLE public.vos_dry_run_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source_proposal_id uuid NOT NULL REFERENCES public.vos_proposal_queue(id),
  app_id text NOT NULL,
  event_name text,
  dry_run_type text NOT NULL,
  dry_run_title text NOT NULL,
  dry_run_summary text NOT NULL,
  simulated_target text NOT NULL DEFAULT '<<simulated:none>>',
  simulated_payload_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  would_execute boolean NOT NULL DEFAULT false,
  execution_blocked boolean NOT NULL DEFAULT true,
  dispatch_blocked boolean NOT NULL DEFAULT true,
  safety_blocked boolean NOT NULL DEFAULT true,
  dry_run_status text NOT NULL DEFAULT 'generated',
  created_by_system text NOT NULL DEFAULT 'vos-dry-run-engine-v1',
  reviewed_by uuid,
  reviewed_at timestamptz,
  dedupe_key text NOT NULL UNIQUE,

  CONSTRAINT vos_dry_run_actions_type_chk CHECK (
    dry_run_type IN ('admin_note_preview','manual_review_preview','risk_review_preview','no_action_preview')
  ),
  CONSTRAINT vos_dry_run_actions_status_chk CHECK (
    dry_run_status IN ('generated','reviewed','dismissed','archived')
  ),
  CONSTRAINT vos_dry_run_actions_would_execute_chk CHECK (would_execute = false),
  CONSTRAINT vos_dry_run_actions_execution_blocked_chk CHECK (execution_blocked = true),
  CONSTRAINT vos_dry_run_actions_dispatch_blocked_chk CHECK (dispatch_blocked = true),
  CONSTRAINT vos_dry_run_actions_safety_blocked_chk CHECK (safety_blocked = true)
);

CREATE INDEX idx_vos_dry_run_actions_proposal ON public.vos_dry_run_actions(source_proposal_id);
CREATE INDEX idx_vos_dry_run_actions_app ON public.vos_dry_run_actions(app_id);
CREATE INDEX idx_vos_dry_run_actions_status ON public.vos_dry_run_actions(dry_run_status);
CREATE INDEX idx_vos_dry_run_actions_created_at ON public.vos_dry_run_actions(created_at DESC);

ALTER TABLE public.vos_dry_run_actions ENABLE ROW LEVEL SECURITY;

-- Admin SELECT only
CREATE POLICY "vos_dry_run_actions admin select"
  ON public.vos_dry_run_actions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin UPDATE only (column-level immutability enforced by trigger)
CREATE POLICY "vos_dry_run_actions admin update"
  ON public.vos_dry_run_actions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- No INSERT policy for any role → only service_role (which bypasses RLS) can insert.
-- No DELETE policy for any role → archive is terminal.

-- Guard trigger
CREATE OR REPLACE FUNCTION public.vos_dry_run_actions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  banned text[] := ARRAY[
    'send','reply','enrol','enroll','follow up','push','dispatch',
    'forward','contact','message','notify','automate','trigger','schedule'
  ];
  w text;
  combined text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    combined := lower(coalesce(NEW.dry_run_title,'') || ' ' || coalesce(NEW.dry_run_summary,''));
    FOREACH w IN ARRAY banned LOOP
      IF position(w IN combined) > 0 THEN
        RAISE EXCEPTION 'forbidden_dry_run_wording: token=%', w;
      END IF;
    END LOOP;

    IF NEW.would_execute IS DISTINCT FROM false
       OR NEW.execution_blocked IS DISTINCT FROM true
       OR NEW.dispatch_blocked IS DISTINCT FROM true
       OR NEW.safety_blocked IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'safety_flags_violated';
    END IF;

    IF NEW.dry_run_status NOT IN ('generated') THEN
      RAISE EXCEPTION 'invalid_initial_status: %', NEW.dry_run_status;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable columns
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.source_proposal_id IS DISTINCT FROM OLD.source_proposal_id
      OR NEW.app_id IS DISTINCT FROM OLD.app_id
      OR NEW.event_name IS DISTINCT FROM OLD.event_name
      OR NEW.dry_run_type IS DISTINCT FROM OLD.dry_run_type
      OR NEW.dry_run_title IS DISTINCT FROM OLD.dry_run_title
      OR NEW.dry_run_summary IS DISTINCT FROM OLD.dry_run_summary
      OR NEW.simulated_target IS DISTINCT FROM OLD.simulated_target
      OR NEW.simulated_payload_redacted::text IS DISTINCT FROM OLD.simulated_payload_redacted::text
      OR NEW.would_execute IS DISTINCT FROM OLD.would_execute
      OR NEW.execution_blocked IS DISTINCT FROM OLD.execution_blocked
      OR NEW.dispatch_blocked IS DISTINCT FROM OLD.dispatch_blocked
      OR NEW.safety_blocked IS DISTINCT FROM OLD.safety_blocked
      OR NEW.created_by_system IS DISTINCT FROM OLD.created_by_system
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
    THEN
      RAISE EXCEPTION 'immutable_column_modified';
    END IF;

    IF NEW.dry_run_status IS DISTINCT FROM OLD.dry_run_status THEN
      IF NOT (
        (OLD.dry_run_status = 'generated' AND NEW.dry_run_status IN ('reviewed','dismissed','archived'))
        OR (OLD.dry_run_status = 'reviewed'  AND NEW.dry_run_status = 'archived')
        OR (OLD.dry_run_status = 'dismissed' AND NEW.dry_run_status = 'archived')
      ) THEN
        RAISE EXCEPTION 'invalid_status_transition: % -> %', OLD.dry_run_status, NEW.dry_run_status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER vos_dry_run_actions_guard_trg
  BEFORE INSERT OR UPDATE ON public.vos_dry_run_actions
  FOR EACH ROW EXECUTE FUNCTION public.vos_dry_run_actions_guard();