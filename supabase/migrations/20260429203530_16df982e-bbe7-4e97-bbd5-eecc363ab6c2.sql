-- Step 4I — Pre-cutover safety rail: append-only rotation receipts table

CREATE TABLE IF NOT EXISTS public.vos_rotation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  app_key text NOT NULL,
  event text NOT NULL,
  slot text NULL,
  secret_ref text NULL,
  fingerprint_prefix text NULL,
  actor_user_id uuid NULL,
  correlation_id uuid NOT NULL,
  notes jsonb NULL,
  reason_code text NULL,
  CONSTRAINT vos_rotation_log_event_chk CHECK (event IN (
    'rotation_cutover_started',
    'rotation_previous_created',
    'rotation_promoted',
    'rotation_verified',
    'rotation_rollback',
    'rotation_previous_expired'
  )),
  CONSTRAINT vos_rotation_log_slot_chk CHECK (slot IS NULL OR slot IN ('active','next','previous')),
  CONSTRAINT vos_rotation_log_fp_chk CHECK (
    fingerprint_prefix IS NULL OR fingerprint_prefix ~ '^[0-9a-f]{8}$'
  )
);

CREATE INDEX IF NOT EXISTS vos_rotation_log_app_created_idx
  ON public.vos_rotation_log (app_key, created_at DESC);
CREATE INDEX IF NOT EXISTS vos_rotation_log_correlation_idx
  ON public.vos_rotation_log (correlation_id);
CREATE INDEX IF NOT EXISTS vos_rotation_log_event_created_idx
  ON public.vos_rotation_log (event, created_at DESC);

ALTER TABLE public.vos_rotation_log ENABLE ROW LEVEL SECURITY;

-- Admin SELECT only. No INSERT/UPDATE/DELETE policies → only service role can write.
CREATE POLICY "Admins read vos_rotation_log"
  ON public.vos_rotation_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.vos_rotation_log FROM anon;
REVOKE ALL ON public.vos_rotation_log FROM authenticated;
GRANT SELECT ON public.vos_rotation_log TO authenticated;