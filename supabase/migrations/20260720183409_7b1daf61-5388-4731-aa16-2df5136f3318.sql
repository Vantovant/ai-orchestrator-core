
ALTER TABLE public.vos_suite_apps
  ADD COLUMN IF NOT EXISTS allowed_contact_types text[] NOT NULL DEFAULT '{}';

INSERT INTO public.vos_suite_apps
  (app_key, name, url, persona, room, role, bridge_secret_slot, is_active, allowed_contact_types)
VALUES
  ('vanto_crm',  'Vanto CRM',  'https://vantocrm.placeholder',
     'MLM Pipeline Partner', 'contacts', 'spoke',
     'SUITE_BRIDGE_SECRET_VANTO_CRM',  false, ARRAY['mlm','mixed']),
  ('zazi_email', 'Zazi Email', 'https://zaziemail.placeholder',
     'Email Marketing Partner', 'contacts', 'spoke',
     'SUITE_BRIDGE_SECRET_ZAZI_EMAIL', false, ARRAY['email_marketing','mixed'])
ON CONFLICT (app_key) DO UPDATE
  SET allowed_contact_types = EXCLUDED.allowed_contact_types,
      bridge_secret_slot    = EXCLUDED.bridge_secret_slot,
      role                  = 'spoke';

CREATE TABLE IF NOT EXISTS public.hub_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone_e164 text,
  email text,
  contact_type text NOT NULL CHECK (contact_type IN ('mlm','email_marketing','personal','mixed')),
  tags text[] NOT NULL DEFAULT '{}',
  consent_whatsapp boolean NOT NULL DEFAULT false,
  consent_email boolean NOT NULL DEFAULT false,
  consent_sms boolean NOT NULL DEFAULT false,
  unsubscribed_channels text[] NOT NULL DEFAULT '{}',
  source_app text NOT NULL,
  source_id text,
  version int NOT NULL DEFAULT 1,
  last_synced_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hub_contacts_phone_uniq
  ON public.hub_contacts (phone_e164) WHERE phone_e164 IS NOT NULL AND is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS hub_contacts_email_uniq
  ON public.hub_contacts (lower(email)) WHERE email IS NOT NULL AND is_deleted = false;
CREATE INDEX IF NOT EXISTS hub_contacts_updated_at_idx ON public.hub_contacts (updated_at);
CREATE INDEX IF NOT EXISTS hub_contacts_type_idx ON public.hub_contacts (contact_type);

GRANT SELECT ON public.hub_contacts TO authenticated;
GRANT ALL ON public.hub_contacts TO service_role;
ALTER TABLE public.hub_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read hub_contacts" ON public.hub_contacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.hub_contact_links (
  hub_contact_id uuid NOT NULL REFERENCES public.hub_contacts(id) ON DELETE CASCADE,
  app_key text NOT NULL,
  remote_id text NOT NULL,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hub_contact_id, app_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS hub_contact_links_app_remote_uniq
  ON public.hub_contact_links (app_key, remote_id);

GRANT SELECT ON public.hub_contact_links TO authenticated;
GRANT ALL ON public.hub_contact_links TO service_role;
ALTER TABLE public.hub_contact_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read hub_contact_links" ON public.hub_contact_links
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.hub_contacts_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS hub_contacts_touch ON public.hub_contacts;
CREATE TRIGGER hub_contacts_touch BEFORE UPDATE ON public.hub_contacts
  FOR EACH ROW EXECUTE FUNCTION public.hub_contacts_touch();
