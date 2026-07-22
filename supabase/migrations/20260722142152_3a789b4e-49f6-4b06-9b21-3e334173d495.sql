
-- Fan-out policy table
CREATE TABLE IF NOT EXISTS public.suite_maytapi_fanout_policy (
  campaign_type text PRIMARY KEY,
  email_spoke_app_key text NOT NULL,
  template_hint text,
  delay_minutes int NOT NULL DEFAULT 0,
  suppress_if jsonb NOT NULL DEFAULT '["no_email","dnc_email"]'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.suite_maytapi_fanout_policy TO authenticated;
GRANT ALL ON public.suite_maytapi_fanout_policy TO service_role;
ALTER TABLE public.suite_maytapi_fanout_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read fanout policy"
  ON public.suite_maytapi_fanout_policy FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins write fanout policy"
  ON public.suite_maytapi_fanout_policy FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed campaign_type rows (disabled by default; hub admin flips per-row)
INSERT INTO public.suite_maytapi_fanout_policy (campaign_type, email_spoke_app_key, template_hint, delay_minutes, suppress_if, enabled, notes)
VALUES
  ('activation', 'getwell_africa_email', 'monthly_activity_thankyou_{tier}', 0, '["no_email","dnc_email"]'::jsonb, false, 'Seeded per Contract Addendum v2 §2.3'),
  ('birthday',   'getwell_africa_email', 'birthday_wishes_{tone}',           30, '["no_email","dnc_email"]'::jsonb, false, 'Seeded per Contract Addendum v2 §2.3'),
  ('zoom',       'getwell_africa_email', 'zoom_invite_followup',            120, '["no_email","dnc_email"]'::jsonb, false, 'Seeded per Contract Addendum v2 §2.3')
ON CONFLICT (campaign_type) DO NOTHING;

-- Extend suite_maytapi_events with channel + fanout state
ALTER TABLE public.suite_maytapi_events
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS fanout_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS fanout_email_send_id text,
  ADD COLUMN IF NOT EXISTS fanout_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS fanout_reason text;

CREATE INDEX IF NOT EXISTS suite_maytapi_events_fanout_idx
  ON public.suite_maytapi_events (fanout_state, sent_at DESC);

-- Extend DNC with channel; unique per (phone_hash, channel)
ALTER TABLE public.suite_maytapi_dnc
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

ALTER TABLE public.suite_maytapi_dnc
  DROP CONSTRAINT IF EXISTS suite_maytapi_dnc_phone_hash_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'suite_maytapi_dnc_phone_channel_uk'
  ) THEN
    ALTER TABLE public.suite_maytapi_dnc
      ADD CONSTRAINT suite_maytapi_dnc_phone_channel_uk UNIQUE (phone_hash, channel);
  END IF;
END $$;

ALTER TABLE public.suite_maytapi_dnc
  DROP CONSTRAINT IF EXISTS suite_maytapi_dnc_channel_check;
ALTER TABLE public.suite_maytapi_dnc
  ADD CONSTRAINT suite_maytapi_dnc_channel_check
  CHECK (channel IN ('whatsapp','email','all'));
