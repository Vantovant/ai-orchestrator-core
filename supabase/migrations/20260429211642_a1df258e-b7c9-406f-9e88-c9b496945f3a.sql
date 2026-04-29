CREATE TABLE IF NOT EXISTS public.lead_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'facebook_ad',
  source_campaign text,
  lead_name text,
  phone text,
  email text,
  raw_payload jsonb,
  status text NOT NULL DEFAULT 'new',
  tags text[] NOT NULL DEFAULT ARRAY['source:facebook_ad'],
  reviewed_by uuid,
  reviewed_at timestamptz
);

ALTER TABLE public.lead_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_inbox_admin_select"
ON public.lead_inbox FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "lead_inbox_admin_update"
ON public.lead_inbox FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_lead_inbox_status_created ON public.lead_inbox (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_inbox_source ON public.lead_inbox (source);

INSERT INTO public.vos_platform_flags (flag_key, flag_value, locked, description)
VALUES
  ('AD_LAUNCH_MODE', 'true', false, 'Path A: controlled FB ad inbound capture window'),
  ('INBOUND_LEAD_CAPTURE_ENABLED', 'true', false, 'Path A: facebook-lead-webhook accepts inbound only'),
  ('INBOUND_MONITORING_ENABLED', 'true', false, 'Path A: admin inbox monitoring active')
ON CONFLICT (flag_key) DO NOTHING;