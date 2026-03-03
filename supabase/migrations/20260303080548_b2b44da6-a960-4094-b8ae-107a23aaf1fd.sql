
-- 1. User roles enum + table + security definer
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Invites table
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  label text NOT NULL DEFAULT '',
  cohort text DEFAULT NULL,
  is_used boolean NOT NULL DEFAULT false,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  max_uses int NOT NULL DEFAULT 1,
  uses_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invites"
  ON public.invites FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow anon/authenticated to read for invite validation
CREATE POLICY "Anyone can validate invites"
  ON public.invites FOR SELECT
  USING (true);

-- 3. User activity table
CREATE TABLE public.user_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own activity"
  ON public.user_activity FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all activity"
  ON public.user_activity FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

CREATE INDEX idx_user_activity_user ON public.user_activity(user_id);
CREATE INDEX idx_user_activity_action ON public.user_activity(action);
CREATE INDEX idx_user_activity_created ON public.user_activity(created_at DESC);

-- 4. User AI keys table (BYOK)
CREATE TABLE public.user_ai_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  use_own_keys boolean NOT NULL DEFAULT false,
  openai_key_encrypted text,
  gemini_key_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_ai_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai keys"
  ON public.user_ai_keys FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
