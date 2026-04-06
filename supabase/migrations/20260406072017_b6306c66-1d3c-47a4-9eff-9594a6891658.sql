
-- 1. Portfolio Partner Threads (conversation containers)
CREATE TABLE public.portfolio_partner_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.portfolio_partner_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own portfolio_partner_threads"
  ON public.portfolio_partner_threads FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_portfolio_partner_threads_user ON public.portfolio_partner_threads(user_id, last_message_at DESC);

-- 2. Portfolio Partner Messages (chat messages within threads)
CREATE TABLE public.portfolio_partner_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.portfolio_partner_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL DEFAULT '',
  context_tags TEXT[] NOT NULL DEFAULT '{}',
  structured_data JSONB,
  token_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_partner_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own portfolio_partner_messages"
  ON public.portfolio_partner_messages FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_portfolio_partner_messages_thread ON public.portfolio_partner_messages(thread_id, created_at ASC);

-- 3. Partner Briefing Preferences
CREATE TABLE public.partner_briefing_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  delivery_channel TEXT NOT NULL DEFAULT 'in_app',
  weekday INTEGER NOT NULL DEFAULT 1,
  send_hour INTEGER NOT NULL DEFAULT 8,
  timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  last_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_briefing_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own partner_briefing_preferences"
  ON public.partner_briefing_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Project Partner Score History (trend tracking)
CREATE TABLE public.project_partner_score_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  momentum_score INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'low',
  sell_readiness_score INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'analysis',
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_partner_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own project_partner_score_history"
  ON public.project_partner_score_history FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_score_history_project ON public.project_partner_score_history(project_id, recorded_at DESC);
CREATE INDEX idx_score_history_user ON public.project_partner_score_history(user_id, recorded_at DESC);

-- Auto-update updated_at triggers
CREATE TRIGGER update_portfolio_partner_threads_updated_at
  BEFORE UPDATE ON public.portfolio_partner_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_partner_briefing_preferences_updated_at
  BEFORE UPDATE ON public.partner_briefing_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
