
-- Email accounts (multi-Gmail support)
CREATE TABLE public.email_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gmail',
  email_address TEXT NOT NULL,
  display_name TEXT,
  label TEXT DEFAULT 'Personal',
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email_accounts" ON public.email_accounts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- OAuth tokens (server-side only, RLS restricted)
CREATE TABLE public.email_oauth_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  access_token TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL DEFAULT '',
  token_expiry TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for frontend - tokens only accessed via edge functions using service role
-- Only allow user to see their own token metadata (not values) via edge functions
CREATE POLICY "Users manage own email_oauth_tokens" ON public.email_oauth_tokens
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_email_oauth_tokens_updated_at
  BEFORE UPDATE ON public.email_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Email messages (metadata cache)
CREATE TABLE public.email_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  sender TEXT NOT NULL DEFAULT '',
  recipients TEXT[] DEFAULT '{}',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT DEFAULT '',
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  labels TEXT[] DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  category TEXT,
  urgency TEXT,
  intent TEXT,
  snoozed_until TIMESTAMPTZ,
  waiting_on BOOLEAN NOT NULL DEFAULT false,
  followup_due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(account_id, message_id)
);

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email_messages" ON public.email_messages
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_email_messages_updated_at
  BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_email_messages_account ON public.email_messages(account_id, date DESC);
CREATE INDEX idx_email_messages_snoozed ON public.email_messages(user_id, snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX idx_email_messages_waiting ON public.email_messages(user_id) WHERE waiting_on = true;
