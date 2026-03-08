
-- knowledge_files table to link uploads to knowledge_docs
CREATE TABLE public.knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NULL,
  doc_id uuid NOT NULL REFERENCES public.knowledge_docs(id) ON DELETE CASCADE,
  bucket text NOT NULL DEFAULT 'knowledge-uploads',
  path text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_files_user_project ON public.knowledge_files(user_id, project_id);
CREATE INDEX idx_knowledge_files_doc_id ON public.knowledge_files(doc_id);

ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own knowledge_files" ON public.knowledge_files
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create private storage bucket for knowledge uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-uploads', 'knowledge-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can only access their own folder prefix
CREATE POLICY "Users upload own knowledge files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'knowledge-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users read own knowledge files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'knowledge-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own knowledge files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'knowledge-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
