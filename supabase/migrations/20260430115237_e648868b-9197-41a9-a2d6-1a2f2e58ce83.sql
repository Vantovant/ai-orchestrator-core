
-- 1. Registry Level 2 fields
ALTER TABLE public.vos_app_registry
  ADD COLUMN IF NOT EXISTS inbox_only_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inbox_allowed_events text[] NOT NULL DEFAULT '{}';

UPDATE public.vos_app_registry
  SET inbox_only_allowed = true,
      inbox_allowed_events = ARRAY['aplgo.lead_magnet.downloaded']::text[]
  WHERE app_key = 'app_aplgo_mlm';

-- 2. Axis B flags (default OFF, locked)
INSERT INTO public.vos_platform_flags (flag_key, flag_value, locked, description)
VALUES
  ('VOS_INBOX_RECEIVE_ENABLED', 'false', true, 'Axis B global master flag for inbox-only receive. NOT for dispatch.'),
  ('VOS_INBOX_RECEIVE_APP_APLGO_ENABLED', 'false', true, 'Axis B per-app flag enabling inbox-only receive for app_aplgo_mlm.'),
  ('VOS_ALLOWED_INBOX_EVENT', 'aplgo.lead_magnet.downloaded', true, 'The single permitted Level 2 event name for app_aplgo_mlm.')
ON CONFLICT (flag_key) DO NOTHING;

-- 3. Axis B kill-switch (engaged by default)
INSERT INTO public.vos_kill_switches (scope, scope_target, state, reason)
VALUES ('inbox_receive', 'app_aplgo_mlm', 'engaged', 'Step 4L default — Axis B receive blocked until explicit enable.')
ON CONFLICT DO NOTHING;

-- 4. vos_signed_inbox Level 2 columns
ALTER TABLE public.vos_signed_inbox
  ADD COLUMN IF NOT EXISTS app_id text,
  ADD COLUMN IF NOT EXISTS ts bigint,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS fingerprint_prefix text,
  ADD COLUMN IF NOT EXISTS signature_header text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vos_signed_inbox_app_id_dedupe_key_unique'
  ) THEN
    ALTER TABLE public.vos_signed_inbox
      ADD CONSTRAINT vos_signed_inbox_app_id_dedupe_key_unique UNIQUE (app_id, dedupe_key);
  END IF;
END$$;

-- 5. Durable rate limit counters
CREATE TABLE IF NOT EXISTS public.vos_rate_limit_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL,
  bucket_type text NOT NULL,
  scope_target text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vos_rate_limit_counters_unique UNIQUE (bucket_type, scope_target, window_start)
);

ALTER TABLE public.vos_rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read vos_rate_limit_counters"
  ON public.vos_rate_limit_counters
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No INSERT/UPDATE/DELETE policies for non-service roles. Service role bypasses RLS.

-- 6. Inbox receive audit
CREATE TABLE IF NOT EXISTS public.vos_inbox_receive_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  app_id text,
  event_name text,
  fingerprint_prefix text,
  signature_valid boolean,
  kill_switch_clear boolean,
  flag_gate_clear boolean,
  event_allowed boolean,
  dedupe_key text,
  outcome text,
  reason text,
  ip_hash text
);

ALTER TABLE public.vos_inbox_receive_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read vos_inbox_receive_audit"
  ON public.vos_inbox_receive_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No INSERT/UPDATE/DELETE policies for non-service roles. Service role bypasses RLS.
