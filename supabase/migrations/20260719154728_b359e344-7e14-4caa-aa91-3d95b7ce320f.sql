
CREATE TABLE IF NOT EXISTS public.vos_suite_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key TEXT NOT NULL,
  probed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok BOOLEAN NOT NULL,
  http_status INTEGER,
  latency_ms INTEGER,
  error TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_vos_suite_telemetry_app_time
  ON public.vos_suite_telemetry(app_key, probed_at DESC);

GRANT SELECT ON public.vos_suite_telemetry TO authenticated;
GRANT ALL ON public.vos_suite_telemetry TO service_role;
ALTER TABLE public.vos_suite_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read telemetry"
  ON public.vos_suite_telemetry FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.vos_spoke_lifecycle_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('register','activate','deactivate','rotate_marker','update_url')),
  actor_user_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.vos_spoke_lifecycle_log TO authenticated;
GRANT ALL ON public.vos_spoke_lifecycle_log TO service_role;
ALTER TABLE public.vos_spoke_lifecycle_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read lifecycle log"
  ON public.vos_spoke_lifecycle_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert lifecycle log"
  ON public.vos_spoke_lifecycle_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_user_id = auth.uid());
