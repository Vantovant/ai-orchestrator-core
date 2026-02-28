
-- Table to persist AI briefing results
CREATE TABLE public.assistant_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.assistant_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own assistant_runs"
  ON public.assistant_runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_assistant_runs_user_latest ON public.assistant_runs (user_id, created_at DESC);
