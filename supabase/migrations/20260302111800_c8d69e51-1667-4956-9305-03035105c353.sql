
-- Upgrade 1: Partner Memory
CREATE TABLE public.project_partner_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  north_star text DEFAULT '',
  target_customer text DEFAULT '',
  business_model text DEFAULT '',
  stage text NOT NULL DEFAULT 'mvp',
  primary_constraint text DEFAULT '',
  weekly_focus text DEFAULT '',
  key_assumptions jsonb DEFAULT '[]'::jsonb,
  key_risks jsonb DEFAULT '[]'::jsonb,
  last_partner_summary text DEFAULT '',
  auto_update_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id)
);

ALTER TABLE public.project_partner_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own project_partner_memory"
  ON public.project_partner_memory FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Upgrade 2: Funding Cache
CREATE TABLE public.funding_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  region text NOT NULL DEFAULT 'South Africa',
  org_name text NOT NULL,
  program_name text NOT NULL,
  funding_type text NOT NULL DEFAULT 'grant',
  ticket_size_range text,
  eligibility text,
  summary text NOT NULL DEFAULT '',
  source_url text NOT NULL,
  source_name text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funding_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own funding_cache"
  ON public.funding_cache FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_funding_cache_user_region ON public.funding_cache(user_id, region);
CREATE INDEX idx_funding_cache_project ON public.funding_cache(project_id);
CREATE INDEX idx_funding_cache_type ON public.funding_cache(funding_type);

-- Upgrade 3: Partner Scores
CREATE TABLE public.project_partner_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sell_readiness_score int DEFAULT 0,
  risk_level text DEFAULT 'low',
  momentum_score int DEFAULT 0,
  last_audit_at timestamptz,
  last_brief_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id)
);

ALTER TABLE public.project_partner_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own project_partner_scores"
  ON public.project_partner_scores FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
