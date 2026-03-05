ALTER TABLE public.email_extracts
  ADD COLUMN IF NOT EXISTS prompt_version text NOT NULL DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS selected_account_last4 text;