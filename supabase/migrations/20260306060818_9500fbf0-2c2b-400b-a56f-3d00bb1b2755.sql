
-- WhatsApp action log table
CREATE TABLE public.whatsapp_action_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  chat_key TEXT NOT NULL,
  chat_title TEXT,
  action_type TEXT NOT NULL,
  related_id TEXT,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- RLS
ALTER TABLE public.whatsapp_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own whatsapp_action_log"
  ON public.whatsapp_action_log
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookup by chat_key
CREATE INDEX idx_whatsapp_action_log_chat_key ON public.whatsapp_action_log (user_id, chat_key) WHERE deleted_at IS NULL;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_action_log;
