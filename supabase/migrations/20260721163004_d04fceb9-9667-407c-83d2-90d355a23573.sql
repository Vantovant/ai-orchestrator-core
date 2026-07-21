
-- 1. Event ledger: every send from every spoke
CREATE TABLE public.suite_maytapi_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spoke_app_key TEXT NOT NULL,
  spoke_event_id TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  phone_last4 TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  campaign_type TEXT,
  maytapi_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','read','failed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (spoke_app_key, spoke_event_id)
);

GRANT SELECT ON public.suite_maytapi_events TO authenticated;
GRANT ALL ON public.suite_maytapi_events TO service_role;

ALTER TABLE public.suite_maytapi_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view maytapi events"
  ON public.suite_maytapi_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_suite_maytapi_events_phone_sent
  ON public.suite_maytapi_events(phone_hash, sent_at DESC);
CREATE INDEX idx_suite_maytapi_events_spoke_sent
  ON public.suite_maytapi_events(spoke_app_key, sent_at DESC);

CREATE TRIGGER trg_suite_maytapi_events_updated_at
  BEFORE UPDATE ON public.suite_maytapi_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Do-Not-Contact list
CREATE TABLE public.suite_maytapi_dnc (
  phone_hash TEXT PRIMARY KEY,
  phone_last4 TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('stop_keyword','manual','complaint','bounce')),
  source_spoke TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.suite_maytapi_dnc TO authenticated;
GRANT ALL ON public.suite_maytapi_dnc TO service_role;

ALTER TABLE public.suite_maytapi_dnc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view maytapi dnc"
  ON public.suite_maytapi_dnc FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_suite_maytapi_dnc_updated_at
  BEFORE UPDATE ON public.suite_maytapi_dnc
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Cooldown lookup (tunable per event class)
CREATE TABLE public.suite_maytapi_cooldowns (
  event_class TEXT PRIMARY KEY,
  cooldown_seconds INT NOT NULL CHECK (cooldown_seconds >= 0),
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.suite_maytapi_cooldowns TO authenticated;
GRANT ALL ON public.suite_maytapi_cooldowns TO service_role;

ALTER TABLE public.suite_maytapi_cooldowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view maytapi cooldowns"
  ON public.suite_maytapi_cooldowns FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage maytapi cooldowns"
  ON public.suite_maytapi_cooldowns FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_suite_maytapi_cooldowns_updated_at
  BEFORE UPDATE ON public.suite_maytapi_cooldowns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default cooldowns
INSERT INTO public.suite_maytapi_cooldowns (event_class, cooldown_seconds, notes) VALUES
  ('default',       21600, 'Fallback when class is missing or unknown (6h)'),
  ('birthday',      21600, 'Marketing — birthday greeting'),
  ('activation',    21600, 'Marketing — activation nudge'),
  ('zoom',          21600, 'Marketing — zoom/event invite'),
  ('reactivation',  21600, 'Marketing — reactivation'),
  ('monthly_activity', 21600, 'Marketing — monthly touch'),
  ('adhoc',         21600, 'Marketing — ad-hoc'),
  ('transactional',  3600, 'Transactional — order/OTP/receipt (1h)'),
  ('otp',            3600, 'Transactional — OTP (1h)'),
  ('order_confirmation', 3600, 'Transactional — order confirmation (1h)'),
  ('receipt',        3600, 'Transactional — receipt (1h)'),
  ('broadcast',     86400, 'Broadcast/promo (24h)'),
  ('promo',         86400, 'Broadcast/promo (24h)');
