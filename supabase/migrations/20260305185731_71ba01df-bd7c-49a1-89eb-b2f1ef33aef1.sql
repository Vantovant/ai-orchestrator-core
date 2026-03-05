
CREATE TABLE public.email_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_id uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  related_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

ALTER TABLE public.email_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email_action_log"
  ON public.email_action_log FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_email_action_log_email ON public.email_action_log (email_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_email_action_log_user ON public.email_action_log (user_id) WHERE deleted_at IS NULL;
