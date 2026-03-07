
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external ON public.tasks(user_id, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_dedupe ON public.tasks(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_external ON public.meetings(user_id, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_dedupe ON public.meetings(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_external ON public.reminders(user_id, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_dedupe ON public.reminders(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.notes_daily ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.notes_daily ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_daily_external ON public.notes_daily(user_id, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_daily_dedupe ON public.notes_daily(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.project_notes ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.project_notes ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_notes_external ON public.project_notes(user_id, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_notes_dedupe ON public.project_notes(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL;
