-- Unique constraint on email_extracts for reliable upsert
ALTER TABLE public.email_extracts
  ADD CONSTRAINT email_extracts_user_email_unique UNIQUE (user_id, email_id);

-- Add source_email_id to finance_entries for receipt linking
ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS source_email_id uuid DEFAULT NULL;