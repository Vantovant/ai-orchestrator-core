
-- Add source columns to finance_entries for WhatsApp idempotency
ALTER TABLE public.finance_entries 
  ADD COLUMN IF NOT EXISTS source_chat_key text,
  ADD COLUMN IF NOT EXISTS source_message_hash text;

-- Create unique index for WhatsApp finance deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_wa_dedupe 
  ON public.finance_entries (user_id, source_chat_key, source_message_hash) 
  WHERE deleted_at IS NULL AND source_chat_key IS NOT NULL AND source_message_hash IS NOT NULL;
