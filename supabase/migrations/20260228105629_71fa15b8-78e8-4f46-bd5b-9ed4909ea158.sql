
-- ============================================================
-- PHASE 1: Executive AI Assistant — Full Schema
-- ============================================================

-- Helper: update_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  source TEXT DEFAULT 'manual',
  estimated_minutes INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_tasks_user_deleted ON public.tasks(user_id, deleted_at);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date) WHERE deleted_at IS NULL;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage own tasks" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- REMINDERS
-- ============================================================
CREATE TABLE public.reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  reminder_time TIMESTAMPTZ NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_reminders_user_deleted ON public.reminders(user_id, deleted_at);
CREATE INDEX idx_reminders_time ON public.reminders(reminder_time) WHERE deleted_at IS NULL;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage own reminders" ON public.reminders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- MEETINGS
-- ============================================================
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  attendees JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_meetings_user_deleted ON public.meetings(user_id, deleted_at);
CREATE INDEX idx_meetings_start ON public.meetings(start_time) WHERE deleted_at IS NULL;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage own meetings" ON public.meetings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- EXECUTIVE_CONTEXT
-- ============================================================
CREATE TABLE public.executive_context (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  context_key TEXT NOT NULL,
  context_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_exec_ctx_user_deleted ON public.executive_context(user_id, deleted_at);
ALTER TABLE public.executive_context ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_exec_ctx_updated_at BEFORE UPDATE ON public.executive_context FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage own context" ON public.executive_context FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_notif_user_deleted ON public.notifications(user_id, deleted_at);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_notif_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TAGS
-- ============================================================
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(user_id, name)
);
CREATE INDEX idx_tags_user_deleted ON public.tags(user_id, deleted_at);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage own tags" ON public.tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ENTITY_TAGS (polymorphic join)
-- ============================================================
CREATE TABLE public.entity_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- 'task', 'reminder', 'meeting'
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(entity_id, entity_type, tag_id)
);
CREATE INDEX idx_entity_tags_user_deleted ON public.entity_tags(user_id, deleted_at);
CREATE INDEX idx_entity_tags_entity ON public.entity_tags(entity_id, entity_type) WHERE deleted_at IS NULL;
ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_entity_tags_updated_at BEFORE UPDATE ON public.entity_tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage own entity_tags" ON public.entity_tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ATTACHMENTS
-- ============================================================
CREATE TABLE public.attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- 'task', 'reminder', 'meeting'
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_attach_user_deleted ON public.attachments(user_id, deleted_at);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_attach_updated_at BEFORE UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage own attachments" ON public.attachments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- USER_PREFERENCES
-- ============================================================
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(user_id, preference_key)
);
CREATE INDEX idx_prefs_user_deleted ON public.user_preferences(user_id, deleted_at);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_prefs_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage own preferences" ON public.user_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
