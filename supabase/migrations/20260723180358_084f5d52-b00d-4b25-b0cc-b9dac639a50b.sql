CREATE TABLE IF NOT EXISTS public.suite_maytapi_quota (
  scope_key text PRIMARY KEY,
  channel text NOT NULL DEFAULT 'whatsapp',
  daily_limit integer NOT NULL CHECK (daily_limit > 0),
  member_app_keys text[] NOT NULL,
  window_hours integer NOT NULL DEFAULT 24,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.suite_maytapi_quota TO authenticated;
GRANT ALL ON public.suite_maytapi_quota TO service_role;

ALTER TABLE public.suite_maytapi_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quota admin read"
ON public.suite_maytapi_quota
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.suite_maytapi_quota (scope_key, channel, daily_limit, member_app_keys, window_hours, enabled, notes)
VALUES ('getwell_whatsapp_suite', 'whatsapp', 40, ARRAY['getwell_hub','getwell_grow'], 24, true, 'Combined WhatsApp cap after Maytapi 24h restriction 2026-07-23')
ON CONFLICT (scope_key) DO UPDATE
  SET daily_limit = EXCLUDED.daily_limit,
      member_app_keys = EXCLUDED.member_app_keys,
      window_hours = EXCLUDED.window_hours,
      enabled = EXCLUDED.enabled,
      notes = EXCLUDED.notes,
      updated_at = now();