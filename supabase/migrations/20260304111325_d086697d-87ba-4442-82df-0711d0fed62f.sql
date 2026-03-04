
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS note_id text;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_user_project_dedupe_key_unique 
ON public.tasks (user_id, project_id, dedupe_key) 
WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL;
