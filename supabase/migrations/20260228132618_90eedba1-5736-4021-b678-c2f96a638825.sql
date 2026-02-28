
-- =============================================
-- SPRINT 2: Finance Module Tables
-- =============================================

-- 1) finance_profiles
CREATE TABLE public.finance_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  role_profile text NOT NULL DEFAULT 'Business only',
  vat_registered boolean NOT NULL DEFAULT false,
  provisional_tax boolean NOT NULL DEFAULT false,
  payroll_employer boolean NOT NULL DEFAULT false,
  bankability text NOT NULL DEFAULT 'bankable',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.finance_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own finance_profiles" ON public.finance_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_finance_profiles_user ON public.finance_profiles(user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER update_finance_profiles_updated_at BEFORE UPDATE ON public.finance_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) finance_entries (unified ledger)
CREATE TABLE public.finance_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'expense',
  category text NOT NULL DEFAULT 'general',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  source text NOT NULL DEFAULT 'other',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own finance_entries" ON public.finance_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_finance_entries_user_date ON public.finance_entries(user_id, entry_date DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER update_finance_entries_updated_at BEFORE UPDATE ON public.finance_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) debts
CREATE TABLE public.debts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  lender_name text NOT NULL,
  principal numeric(12,2) NOT NULL DEFAULT 0,
  interest_rate numeric(5,2),
  repayment_amount numeric(12,2),
  due_day integer,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own debts" ON public.debts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_debts_user ON public.debts(user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER update_debts_updated_at BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) income_streams
CREATE TABLE public.income_streams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  stream_type text NOT NULL DEFAULT 'salary',
  label text NOT NULL DEFAULT '',
  monthly_target numeric(12,2) NOT NULL DEFAULT 0,
  current_month_income numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.income_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own income_streams" ON public.income_streams FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_income_streams_user ON public.income_streams(user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER update_income_streams_updated_at BEFORE UPDATE ON public.income_streams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) opportunities
CREATE TABLE public.opportunities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'savings',
  estimated_value numeric(12,2),
  difficulty text NOT NULL DEFAULT 'medium',
  notes text,
  status text NOT NULL DEFAULT 'open',
  ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own opportunities" ON public.opportunities FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_opportunities_user ON public.opportunities(user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER update_opportunities_updated_at BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
