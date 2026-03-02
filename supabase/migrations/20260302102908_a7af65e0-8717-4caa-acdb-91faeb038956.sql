
-- Projects table
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  progress_manual integer NOT NULL DEFAULT 0,
  progress_mode text NOT NULL DEFAULT 'tasks_based',
  tags text[] DEFAULT '{}',
  is_blocked boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own projects" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Project notes table
CREATE TABLE public.project_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  note_date date NOT NULL DEFAULT CURRENT_DATE,
  content text NOT NULL DEFAULT '',
  structured_json jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own project_notes" ON public.project_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_project_notes_updated_at BEFORE UPDATE ON public.project_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Project links table
CREATE TABLE public.project_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.project_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own project_links" ON public.project_links FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add project_id to tasks, meetings, reminders
ALTER TABLE public.tasks ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.meetings ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.reminders ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_projects_user_status ON public.projects(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_notes_project ON public.project_notes(project_id, note_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_links_project ON public.project_links(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_project ON public.tasks(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meetings_project ON public.meetings(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reminders_project ON public.reminders(project_id) WHERE deleted_at IS NULL;
