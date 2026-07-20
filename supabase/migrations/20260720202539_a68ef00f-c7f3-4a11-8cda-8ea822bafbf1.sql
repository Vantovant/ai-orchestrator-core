
ALTER TABLE public.hub_contacts
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_display_name text,
  ADD COLUMN IF NOT EXISTS contact_source text,
  ADD COLUMN IF NOT EXISTS contact_confidence text,
  ADD COLUMN IF NOT EXISTS name_needs_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_type text,
  ADD COLUMN IF NOT EXISTS temperature text,
  ADD COLUMN IF NOT EXISTS stage_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS notes text;

-- Allow admins to update and (soft) delete hub contacts from the Vantoos UI
DROP POLICY IF EXISTS "Admins update hub_contacts" ON public.hub_contacts;
CREATE POLICY "Admins update hub_contacts"
  ON public.hub_contacts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Bump version on any UPDATE so spokes always see a newer hub_version on pull
CREATE OR REPLACE FUNCTION public.hub_contacts_bump_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.version IS NULL OR NEW.version = OLD.version THEN
    NEW.version := COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hub_contacts_bump_version ON public.hub_contacts;
CREATE TRIGGER hub_contacts_bump_version
  BEFORE UPDATE ON public.hub_contacts
  FOR EACH ROW EXECUTE FUNCTION public.hub_contacts_bump_version();
