DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notes_daily'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notes_daily;
  END IF;
END $$;