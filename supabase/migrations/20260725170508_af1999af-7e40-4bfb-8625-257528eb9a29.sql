
CREATE TABLE public.google_contacts_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  scopes TEXT[] NOT NULL DEFAULT '{}',
  token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  last_pull_at TIMESTAMPTZ,
  last_push_at TIMESTAMPTZ,
  next_sync_token TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_address)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_contacts_accounts TO authenticated;
GRANT ALL ON public.google_contacts_accounts TO service_role;

ALTER TABLE public.google_contacts_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own google contacts accounts"
  ON public.google_contacts_accounts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER google_contacts_accounts_touch
  BEFORE UPDATE ON public.google_contacts_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
