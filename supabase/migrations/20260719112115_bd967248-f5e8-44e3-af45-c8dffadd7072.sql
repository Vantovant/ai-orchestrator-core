
-- 1. TABLE
CREATE TABLE IF NOT EXISTS public.vos_suite_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key text NOT NULL UNIQUE,
  name text NOT NULL,
  url text NOT NULL,
  persona text NOT NULL,
  room text NOT NULL,
  role text NOT NULL DEFAULT 'spoke' CHECK (role IN ('hub','spoke')),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  bridge_secret_slot text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. GRANTS (admin-only via RLS; service_role for edge functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vos_suite_apps TO authenticated;
GRANT ALL ON public.vos_suite_apps TO service_role;

-- 3. RLS
ALTER TABLE public.vos_suite_apps ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES — admin only
CREATE POLICY "Admins can view suite apps"
  ON public.vos_suite_apps FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert suite apps"
  ON public.vos_suite_apps FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update suite apps"
  ON public.vos_suite_apps FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete suite apps"
  ON public.vos_suite_apps FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.vos_suite_apps_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vos_suite_apps_touch ON public.vos_suite_apps;
CREATE TRIGGER trg_vos_suite_apps_touch
  BEFORE UPDATE ON public.vos_suite_apps
  FOR EACH ROW EXECUTE FUNCTION public.vos_suite_apps_touch();

-- 6. SEED — 5 spokes + 1 hub
INSERT INTO public.vos_suite_apps (app_key, name, url, persona, room, role, capabilities, bridge_secret_slot, notes) VALUES
  ('vantoos',       'VantoOS',              'https://vantoos.com',                        'Central Brain / Governance Hub',          'Governance',   'hub',   '["orchestrate","approve","broadcast","receipt"]'::jsonb, 'SUITE_BRIDGE_SECRET_VANTOOS',       'Hub — signs outbound, verifies inbound.'),
  ('getwell_hub',   'GetWell Hub',          'https://getwellhub.dev',                     'Clinical Operations Partner',             'Clinical',     'spoke', '["snapshot","propose","execute_directive"]'::jsonb,       'SUITE_BRIDGE_SECRET_GETWELL_HUB',   'Distinct codebase and auth.'),
  ('getwell_grow',  'GetWell Grow',         'https://getwellgrow.app',                    'Growth & Acquisition Partner',            'Growth',       'spoke', '["snapshot","propose","execute_directive"]'::jsonb,       'SUITE_BRIDGE_SECRET_GETWELL_GROW',  'Distinct codebase and auth.'),
  ('getwell_africa','GetWell Africa',       'https://getwellafrica.com',                  'Community & Field Partner',               'Community',    'spoke', '["snapshot","propose","execute_directive"]'::jsonb,       'SUITE_BRIDGE_SECRET_GETWELL_AFRICA','Shares auth/logs with MLM app; treated as its own room.'),
  ('mlm_course',    'Online Course for MLM','https://dashboard.onlinecourseformlm.com',   'Education & Enablement Partner',          'Education',    'spoke', '["snapshot","propose","execute_directive"]'::jsonb,       'SUITE_BRIDGE_SECRET_MLM_COURSE',    'Holds original historical logs for GetWell Africa; distinct persona and room.')
ON CONFLICT (app_key) DO NOTHING;
