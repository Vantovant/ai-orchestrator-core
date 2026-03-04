CREATE OR REPLACE FUNCTION public.priority_rank(p text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p
    WHEN 'critical' THEN 4
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 0
  END
$$;