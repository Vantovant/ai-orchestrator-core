
-- ══════════════════════════════════════════════════
-- Sprint 3: Bank Statement Import tables + storage
-- ══════════════════════════════════════════════════

-- 1. bank_accounts
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'ZAR',
  last4 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank_accounts" ON public.bank_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. bank_statement_imports
CREATE TABLE public.bank_statement_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'csv',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'uploaded',
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank_statement_imports" ON public.bank_statement_imports FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_bank_statement_imports_updated_at BEFORE UPDATE ON public.bank_statement_imports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. bank_transactions
CREATE TABLE public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  import_id UUID NOT NULL REFERENCES public.bank_statement_imports(id),
  txn_date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reference TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2),
  fingerprint_hash TEXT NOT NULL,
  category TEXT,
  merchant TEXT,
  finance_entry_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank_transactions" ON public.bank_transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_bank_transactions_updated_at BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_bank_txn_user_date ON public.bank_transactions(user_id, txn_date);
CREATE INDEX idx_bank_txn_user_deleted ON public.bank_transactions(user_id, deleted_at);
CREATE INDEX idx_bank_txn_account_date ON public.bank_transactions(bank_account_id, txn_date);
CREATE UNIQUE INDEX idx_bank_txn_fingerprint ON public.bank_transactions(user_id, fingerprint_hash);

-- 4. merchant_rules (user-learned categorization)
CREATE TABLE public.merchant_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own merchant_rules" ON public.merchant_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_merchant_rules_updated_at BEFORE UPDATE ON public.merchant_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Storage bucket for statements (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('statements', 'statements', false);

-- Storage policies: users can manage own files
CREATE POLICY "Users upload own statements" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users read own statements" ON storage.objects FOR SELECT USING (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own statements" ON storage.objects FOR DELETE USING (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
