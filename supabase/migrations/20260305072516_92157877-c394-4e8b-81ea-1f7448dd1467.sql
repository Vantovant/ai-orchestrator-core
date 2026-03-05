
-- Beta testers tracking table for Beta Assist Mode
CREATE TABLE public.beta_testers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  cohort_tag text NOT NULL DEFAULT 'beta20',
  is_active boolean NOT NULL DEFAULT true,
  assisted_ai_remaining integer NOT NULL DEFAULT 10,
  assisted_ai_used integer NOT NULL DEFAULT 0,
  assisted_ai_expires_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;

-- Users can read their own record
CREATE POLICY "Users read own beta_testers"
  ON public.beta_testers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update only their own counters
CREATE POLICY "Users update own beta_testers"
  ON public.beta_testers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can manage all records (seed testers)
CREATE POLICY "Admins manage beta_testers"
  ON public.beta_testers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
