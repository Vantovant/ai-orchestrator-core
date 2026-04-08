
CREATE TABLE public.voice_diary_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  title TEXT,
  source_type TEXT NOT NULL DEFAULT 'voice',
  mood TEXT,
  linked_project_ids UUID[] DEFAULT '{}',
  extracted_intents JSONB DEFAULT '[]'::jsonb,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.voice_diary_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own voice_diary_entries"
  ON public.voice_diary_entries
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_voice_diary_user_created ON public.voice_diary_entries (user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER update_voice_diary_entries_updated_at
  BEFORE UPDATE ON public.voice_diary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
