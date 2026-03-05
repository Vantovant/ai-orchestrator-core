CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_entries_source_email
ON public.finance_entries (user_id, source_email_id)
WHERE source_email_id IS NOT NULL AND deleted_at IS NULL;