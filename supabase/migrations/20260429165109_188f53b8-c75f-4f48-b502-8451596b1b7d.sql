-- ============================================================
-- VANTO OS CENTRAL BRAIN — PHASE 1 RAILS (DB ONLY)
-- Posture: NO TRAFFIC. All dispatch flags locked OFF.
-- All tables admin-only via has_role(auth.uid(), 'admin').
-- Audit logs are insert-only to preserve integrity.
-- ============================================================

-- 1. APP REGISTRY -------------------------------------------------
CREATE TABLE public.vos_app_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  owner_scope TEXT NOT NULL,
  public_key_ref TEXT,
  app_status TEXT NOT NULL DEFAULT 'design_only',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vos_app_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage vos_app_registry" ON public.vos_app_registry
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_vos_app_registry_updated
  BEFORE UPDATE ON public.vos_app_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 4 apps in design_only state
INSERT INTO public.vos_app_registry (app_key, display_name, role, owner_scope, app_status, notes) VALUES
  ('app_vantoos_host',  'VantoOS / Executive OS',     'brain_host',         'vanto_admin_ecosystem', 'design_only', 'Phase 1 Brain Host. No traffic.'),
  ('app_vanto_crm',     'Vanto CRM',                  'producer_consumer',  'vanto_admin_ecosystem', 'design_only', 'Phase 1 ratified with conditions.'),
  ('app_aplgo_mlm',     'APLGO / MLM Online Course',  'producer',           'vanto_admin_ecosystem', 'design_only', 'Phase 1 ratified with conditions.'),
  ('app_zazi_mail',     'Zazi Mail',                  'consumer',           'vanto_admin_ecosystem', 'design_only', 'Phase 1 ratified with conditions. Sequence engine.');

-- 2. PLATFORM FLAGS -----------------------------------------------
CREATE TABLE public.vos_platform_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flag_key TEXT NOT NULL UNIQUE,
  flag_value TEXT NOT NULL,
  description TEXT,
  locked BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vos_platform_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage vos_platform_flags" ON public.vos_platform_flags
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_vos_platform_flags_updated
  BEFORE UPDATE ON public.vos_platform_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 5 locked posture flags
INSERT INTO public.vos_platform_flags (flag_key, flag_value, description, locked) VALUES
  ('VANTO_OS_ENABLED',         'false',  'Master enable for Vanto OS Brain. Phase 1: locked off.', true),
  ('EMAIL_SEND_ENABLED',       'false',  'Zazi Mail dispatch gate. Phase 1: locked off.', true),
  ('WHATSAPP_SEND_ENABLED',    'false',  'WhatsApp dispatch gate. Phase 1: locked off.', true),
  ('MASTER_PROSPECTOR_STATE',  'ASLEEP', 'Autonomous prospecting agent state. Phase 1: ASLEEP.', true),
  ('PHASE_4A_STEP_3',          'OFF',    'Auto-enrolment step. Phase 1: OFF.', true);

-- 3. SIGNED INBOX -------------------------------------------------
CREATE TABLE public.vos_signed_inbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  signature TEXT NOT NULL,
  signature_version TEXT NOT NULL DEFAULT 'v1',
  source_app TEXT NOT NULL,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  redacted_payload JSONB,
  safe_summary TEXT,
  processing_state TEXT NOT NULL DEFAULT 'received',
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vos_signed_inbox_source_event ON public.vos_signed_inbox(source_app, event_name);
CREATE INDEX idx_vos_signed_inbox_state ON public.vos_signed_inbox(processing_state);
ALTER TABLE public.vos_signed_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage vos_signed_inbox" ON public.vos_signed_inbox
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_vos_signed_inbox_updated
  BEFORE UPDATE ON public.vos_signed_inbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. KILL SWITCHES ------------------------------------------------
CREATE TABLE public.vos_kill_switches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL,
  scope_target TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'engaged',
  reason TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_target)
);
ALTER TABLE public.vos_kill_switches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage vos_kill_switches" ON public.vos_kill_switches
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_vos_kill_switches_updated
  BEFORE UPDATE ON public.vos_kill_switches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default global kill switch (engaged = off)
INSERT INTO public.vos_kill_switches (scope, scope_target, state, reason) VALUES
  ('global', '*',                 'engaged', 'Phase 1 default. Brain is rails-only.'),
  ('app',    'app_vanto_crm',     'engaged', 'Phase 1 default.'),
  ('app',    'app_aplgo_mlm',     'engaged', 'Phase 1 default.'),
  ('app',    'app_zazi_mail',     'engaged', 'Phase 1 default. Email send blocked.');

-- 5. AUDIT LOGS (insert-only) -------------------------------------
CREATE TABLE public.vos_inbound_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_app TEXT NOT NULL,
  event_name TEXT NOT NULL,
  idempotency_key TEXT,
  signature_valid BOOLEAN,
  outcome TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vos_inbound_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vos_inbound_log" ON public.vos_inbound_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert vos_inbound_log" ON public.vos_inbound_log
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE public.vos_outbound_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_app TEXT NOT NULL,
  event_name TEXT NOT NULL,
  idempotency_key TEXT,
  outcome TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vos_outbound_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vos_outbound_log" ON public.vos_outbound_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert vos_outbound_log" ON public.vos_outbound_log
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE public.vos_decision_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inbox_id UUID,
  decision TEXT NOT NULL,
  reason TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vos_decision_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vos_decision_log" ON public.vos_decision_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert vos_decision_log" ON public.vos_decision_log
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE public.vos_killswitch_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL,
  scope_target TEXT NOT NULL,
  prev_state TEXT,
  new_state TEXT NOT NULL,
  reason TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vos_killswitch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vos_killswitch_log" ON public.vos_killswitch_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert vos_killswitch_log" ON public.vos_killswitch_log
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));