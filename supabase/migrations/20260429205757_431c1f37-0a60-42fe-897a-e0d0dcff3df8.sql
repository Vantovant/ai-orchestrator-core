-- Step 4K: Reference-based cutover rails for app_vantoos_host
-- Creates pointer table so future rotations move REFERENCES, never secret values.

CREATE TABLE public.vos_secret_slot_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key text NOT NULL UNIQUE,
  active_secret_ref text NOT NULL,
  next_secret_ref text,
  previous_secret_ref text,
  previous_grace_expires_at timestamptz,
  rotation_correlation_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT vos_secret_slot_state_active_ref_format
    CHECK (active_secret_ref ~ '^VOS_HMAC_[A-Z0-9_]+$'),
  CONSTRAINT vos_secret_slot_state_next_ref_format
    CHECK (next_secret_ref IS NULL OR next_secret_ref ~ '^VOS_HMAC_[A-Z0-9_]+$'),
  CONSTRAINT vos_secret_slot_state_previous_ref_format
    CHECK (previous_secret_ref IS NULL OR previous_secret_ref ~ '^VOS_HMAC_[A-Z0-9_]+$'),
  CONSTRAINT vos_secret_slot_state_app_key_format
    CHECK (app_key ~ '^app_[a-z0-9_]+$')
);

CREATE UNIQUE INDEX vos_secret_slot_state_app_key_uidx
  ON public.vos_secret_slot_state (app_key);
CREATE INDEX vos_secret_slot_state_correlation_idx
  ON public.vos_secret_slot_state (rotation_correlation_id)
  WHERE rotation_correlation_id IS NOT NULL;
CREATE INDEX vos_secret_slot_state_grace_idx
  ON public.vos_secret_slot_state (previous_grace_expires_at)
  WHERE previous_grace_expires_at IS NOT NULL;

ALTER TABLE public.vos_secret_slot_state ENABLE ROW LEVEL SECURITY;

-- Admin SELECT only. No INSERT/UPDATE/DELETE policies for users -> service-role only.
CREATE POLICY "Admins read vos_secret_slot_state"
  ON public.vos_secret_slot_state
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER vos_secret_slot_state_set_updated_at
  BEFORE UPDATE ON public.vos_secret_slot_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed app_vantoos_host only. No CRM/APLGO/Zazi.
INSERT INTO public.vos_secret_slot_state
  (app_key, active_secret_ref, next_secret_ref, previous_secret_ref,
   previous_grace_expires_at, rotation_correlation_id)
VALUES
  ('app_vantoos_host',
   'VOS_HMAC_VANTO_OS_INTERNAL_ACTIVE',
   'VOS_HMAC_VANTO_OS_INTERNAL_NEXT',
   NULL, NULL, NULL);

COMMENT ON TABLE public.vos_secret_slot_state IS
  'Reference-based rotation pointer table. Stores secret REF NAMES only, never values. Rotation = atomic UPDATE of refs.';