-- Add unique partial index for task deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_dedupe_key_unique
ON public.tasks (user_id, project_id, dedupe_key)
WHERE deleted_at IS NULL AND dedupe_key IS NOT NULL;