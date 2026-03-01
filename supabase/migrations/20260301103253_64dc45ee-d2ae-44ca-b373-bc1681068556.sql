
-- Daily notes / diary table
CREATE TABLE public.notes_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  note_date date NOT NULL DEFAULT CURRENT_DATE,
  content text NOT NULL DEFAULT '',
  structured_mode boolean NOT NULL DEFAULT false,
  structure_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  links_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(user_id, note_date)
);

ALTER TABLE public.notes_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notes_daily"
  ON public.notes_daily FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_notes_daily_updated_at
  BEFORE UPDATE ON public.notes_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
