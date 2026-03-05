-- Extend email_accounts with Gmail OAuth fields
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS history_id text;

-- Extend email_messages with Gmail-specific fields
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS cc text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS label_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS permalink text,
  ADD COLUMN IF NOT EXISTS has_body boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS body_preview text,
  ADD COLUMN IF NOT EXISTS internal_date bigint,
  ADD COLUMN IF NOT EXISTS raw_size integer;

-- Unique constraint to prevent duplicate Gmail messages per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_gmail_unique
  ON email_messages (user_id, account_id, gmail_message_id)
  WHERE gmail_message_id IS NOT NULL AND deleted_at IS NULL;

-- Email inbox items table (unified inbox across sources)
CREATE TABLE IF NOT EXISTS email_inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'gmail',
  source_id text NOT NULL,
  account_id uuid REFERENCES email_accounts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new',
  last_touched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_inbox_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email_inbox_items"
  ON email_inbox_items FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_inbox_items_source_unique
  ON email_inbox_items (user_id, source, source_id)
  WHERE TRUE;