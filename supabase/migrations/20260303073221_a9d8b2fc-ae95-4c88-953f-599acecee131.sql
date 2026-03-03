
-- =====================================================
-- EXECUTIVE PROJECTS UPGRADE: Schema Changes
-- =====================================================

-- 1) Add columns to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS start_date date NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

-- Update existing tasks: set completed_at for done tasks
UPDATE public.tasks SET completed_at = updated_at WHERE status = 'done' AND completed_at IS NULL;

-- 2) Add columns to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS health text NOT NULL DEFAULT 'on_track',
  ADD COLUMN IF NOT EXISTS blocked_reason text NULL,
  ADD COLUMN IF NOT EXISTS blocked_by uuid NULL,
  ADD COLUMN IF NOT EXISTS unblock_eta date NULL;

-- Backfill health from is_blocked
UPDATE public.projects SET health = 'blocked' WHERE is_blocked = true;

-- 3) Create project_accomplishments table
CREATE TABLE IF NOT EXISTS public.project_accomplishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'milestone',
  details text NULL,
  happened_at timestamptz NOT NULL DEFAULT now(),
  link_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_accomplishments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own project_accomplishments"
  ON public.project_accomplishments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) Create activity_log table
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own activity_log"
  ON public.activity_log FOR ALL
  USING (auth.uid() = actor_id)
  WITH CHECK (auth.uid() = actor_id);

-- Index for activity_log lookups
CREATE INDEX IF NOT EXISTS idx_activity_log_project ON public.activity_log(project_id, created_at DESC);

-- Index for task ordering
CREATE INDEX IF NOT EXISTS idx_tasks_order ON public.tasks(project_id, order_index);
