CREATE UNIQUE INDEX IF NOT EXISTS idx_project_inbox_items_dedupe 
ON public.project_inbox_items (user_id, project_id, source_context_id) 
WHERE deleted_at IS NULL;