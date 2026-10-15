CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p text, default_cc text DEFAULT '27')
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  d := regexp_replace(p, '[^0-9+]', '', 'g');
  IF left(d,1) = '+' THEN d := '+' || regexp_replace(substr(d,2), '[^0-9]', '', 'g');
  ELSIF left(d,2) = '00' THEN d := '+' || substr(d,3);
  ELSIF left(d,1) = '0' THEN d := '+' || default_cc || substr(d,2);
  ELSE d := '+' || d; END IF;
  IF d !~ '^\+[1-9][0-9]{6,14}$' THEN RAISE EXCEPTION 'Invalid phone number: %', p; END IF;
  RETURN d;
END $$;

CREATE TABLE public.personal_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  full_name text NOT NULL CHECK (btrim(full_name) <> ''),
  business_name text,
  branch text,
  category text NOT NULL DEFAULT 'personal' CHECK (category IN ('personal','business','service')),
  primary_phone_e164 text,
  phones text[] NOT NULL DEFAULT '{}',
  email text,
  notes text,
  linked_task_ids uuid[] NOT NULL DEFAULT '{}',
  google_account_id uuid,
  google_resource_name text,
  google_etag text,
  google_sync_status text NOT NULL DEFAULT 'not_synced' CHECK (google_sync_status IN ('not_synced','pending','synced','error')),
  google_sync_error text,
  google_last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_contacts TO authenticated;
GRANT ALL ON public.personal_contacts TO service_role;
ALTER TABLE public.personal_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their personal contacts" ON public.personal_contacts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX personal_contacts_owner_phone_uniq ON public.personal_contacts (user_id, primary_phone_e164)
  WHERE primary_phone_e164 IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX personal_contacts_owner_idx ON public.personal_contacts (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.personal_contacts_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE x text; arr text[] := '{}';
BEGIN
  NEW.primary_phone_e164 := public.normalize_phone_e164(NEW.primary_phone_e164);
  FOREACH x IN ARRAY coalesce(NEW.phones,'{}') LOOP
    x := public.normalize_phone_e164(x);
    IF x IS NOT NULL AND NOT x = ANY(arr) THEN arr := arr || x; END IF;
  END LOOP;
  IF NEW.primary_phone_e164 IS NULL AND array_length(arr,1) > 0 THEN NEW.primary_phone_e164 := arr[1]; END IF;
  IF NEW.primary_phone_e164 IS NOT NULL AND NOT NEW.primary_phone_e164 = ANY(arr) THEN arr := NEW.primary_phone_e164 || arr; END IF;
  NEW.phones := arr;
  NEW.email := nullif(lower(btrim(coalesce(NEW.email,''))),'');
  NEW.full_name := btrim(NEW.full_name);
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'Owner cannot change'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_personal_contacts_normalize BEFORE INSERT OR UPDATE ON public.personal_contacts
  FOR EACH ROW EXECUTE FUNCTION public.personal_contacts_normalize();

-- Idempotent create: same owner + same normalized phone returns/updates the existing row.
CREATE OR REPLACE FUNCTION public.upsert_personal_contact(p jsonb)
RETURNS public.personal_contacts LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); ph text; r public.personal_contacts; created boolean := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  ph := public.normalize_phone_e164(coalesce(p->>'phone', p->'phones'->>0));
  IF ph IS NOT NULL THEN
    SELECT * INTO r FROM personal_contacts WHERE user_id = uid AND primary_phone_e164 = ph AND deleted_at IS NULL;
  ELSIF nullif(p->>'email','') IS NOT NULL THEN
    SELECT * INTO r FROM personal_contacts WHERE user_id = uid AND email = lower(btrim(p->>'email')) AND deleted_at IS NULL LIMIT 1;
  END IF;
  IF r.id IS NULL THEN
    INSERT INTO personal_contacts (user_id, full_name, business_name, branch, category, primary_phone_e164, phones, email, notes, linked_task_ids)
    VALUES (uid, p->>'full_name', p->>'business_name', p->>'branch', coalesce(p->>'category','personal'), ph,
      coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'phones')), '{}'), p->>'email', p->>'notes',
      coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'linked_task_ids'))::uuid[], '{}'))
    RETURNING * INTO r;
  ELSE
    UPDATE personal_contacts SET
      full_name = coalesce(nullif(p->>'full_name',''), full_name),
      business_name = coalesce(p->>'business_name', business_name),
      branch = coalesce(p->>'branch', branch),
      category = coalesce(p->>'category', category),
      phones = phones || coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'phones')), '{}'),
      email = coalesce(nullif(p->>'email',''), email),
      notes = CASE WHEN nullif(p->>'notes','') IS NULL OR coalesce(notes,'') LIKE '%' || (p->>'notes') || '%' THEN notes
                   ELSE concat_ws(E'\n', notes, p->>'notes') END,
      linked_task_ids = ARRAY(SELECT DISTINCT unnest(linked_task_ids || coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'linked_task_ids'))::uuid[], '{}')))
    WHERE id = r.id RETURNING * INTO r;
  END IF;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.upsert_personal_contact(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone_e164(text, text) TO authenticated, service_role;