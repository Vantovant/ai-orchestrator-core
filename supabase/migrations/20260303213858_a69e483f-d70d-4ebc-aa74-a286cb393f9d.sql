
-- 1) Add solution_type to projects
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS solution_type text NOT NULL DEFAULT 'standard';

-- 2) project_documents
CREATE TABLE public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'general',
  url text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  label text NOT NULL DEFAULT '',
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own project_documents" ON public.project_documents FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) project_milestones
CREATE TABLE public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'pending',
  evidence_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own project_milestones" ON public.project_milestones FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) financial_models
CREATE TABLE public.financial_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'ZAR',
  startup_costs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  monthly_costs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  cashflow_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  runway_months integer,
  funding_target_amount numeric DEFAULT 0,
  assumptions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.financial_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own financial_models" ON public.financial_models FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5) funding_packs
CREATE TABLE public.funding_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  use_of_funds_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  milestones_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ask_amount numeric DEFAULT 0,
  deadline date,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.funding_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own funding_packs" ON public.funding_packs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6) business_cases
CREATE TABLE public.business_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  problem text NOT NULL DEFAULT '',
  customer text NOT NULL DEFAULT '',
  offer text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  risks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.business_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own business_cases" ON public.business_cases FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7) tenders
CREATE TABLE public.tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity text NOT NULL DEFAULT '',
  ref_no text NOT NULL DEFAULT '',
  closing_at timestamp with time zone,
  briefing_required boolean NOT NULL DEFAULT false,
  submission_method text NOT NULL DEFAULT 'portal',
  contact text,
  status text NOT NULL DEFAULT 'identified',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tenders" ON public.tenders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8) tender_requirements
CREATE TABLE public.tender_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  requirement text NOT NULL,
  mandatory boolean NOT NULL DEFAULT true,
  source_section text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.tender_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tender_requirements" ON public.tender_requirements FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9) tender_compliance_items
CREATE TABLE public.tender_compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  doc_id uuid,
  expires_at timestamp with time zone,
  status text NOT NULL DEFAULT 'missing',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.tender_compliance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tender_compliance_items" ON public.tender_compliance_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 10) tender_pricing
CREATE TABLE public.tender_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  pricing_csv_url text,
  assumptions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  margin_pct numeric DEFAULT 0,
  cashflow_impact_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.tender_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tender_pricing" ON public.tender_pricing FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 11) tender_submissions
CREATE TABLE public.tender_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'portal',
  proof_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.tender_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tender_submissions" ON public.tender_submissions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 12) tender_proposals
CREATE TABLE public.tender_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  exec_summary text NOT NULL DEFAULT '',
  methodology text NOT NULL DEFAULT '',
  team text NOT NULL DEFAULT '',
  experience text NOT NULL DEFAULT '',
  qa_plan text NOT NULL DEFAULT '',
  risk_mitigation text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.tender_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tender_proposals" ON public.tender_proposals FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_project_documents_project ON public.project_documents(project_id);
CREATE INDEX idx_project_milestones_project ON public.project_milestones(project_id);
CREATE INDEX idx_financial_models_project ON public.financial_models(project_id);
CREATE INDEX idx_funding_packs_project ON public.funding_packs(project_id);
CREATE INDEX idx_business_cases_project ON public.business_cases(project_id);
CREATE INDEX idx_tenders_project ON public.tenders(project_id);
CREATE INDEX idx_tender_requirements_tender ON public.tender_requirements(tender_id);
CREATE INDEX idx_tender_compliance_tender ON public.tender_compliance_items(tender_id);
CREATE INDEX idx_tender_pricing_tender ON public.tender_pricing(tender_id);
CREATE INDEX idx_tender_submissions_tender ON public.tender_submissions(tender_id);
CREATE INDEX idx_tender_proposals_tender ON public.tender_proposals(tender_id);
