-- Fix search_path on priority_rank
CREATE OR REPLACE FUNCTION public.priority_rank(p text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p
    WHEN 'critical' THEN 4
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 0
  END
$$;

-- RPC for priority-sorted tasks used by extension-tasks edge function
CREATE OR REPLACE FUNCTION public.get_tasks_by_priority(
  p_user_id uuid,
  p_project_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  title text,
  status text,
  priority text,
  due_date date,
  project_id uuid,
  created_at timestamptz,
  last_touched_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id, t.created_at, t.last_touched_at
  FROM public.tasks t
  WHERE t.user_id = p_user_id
    AND t.deleted_at IS NULL
    AND (p_project_id IS NULL OR t.project_id = p_project_id)
  ORDER BY public.priority_rank(t.priority) DESC, t.last_touched_at DESC
  LIMIT p_limit
$$;