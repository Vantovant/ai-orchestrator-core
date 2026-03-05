
CREATE TABLE public.email_extracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email_id UUID NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  detected_type TEXT NOT NULL DEFAULT 'other',
  confidence NUMERIC NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  entities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_routes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_user_confirmation BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  UNIQUE(email_id, user_id)
);

ALTER TABLE public.email_extracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email_extracts"
  ON public.email_extracts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
