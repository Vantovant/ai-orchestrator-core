
-- Knowledge chunks table for RAG retrieval (embeddings stored via external provider)
CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.knowledge_docs(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL DEFAULT 0,
  content text NOT NULL DEFAULT '',
  token_count integer NOT NULL DEFAULT 0,
  content_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_chunks_doc_id ON public.knowledge_chunks(doc_id);
CREATE INDEX idx_knowledge_chunks_content_hash ON public.knowledge_chunks(content_hash);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own knowledge_chunks" ON public.knowledge_chunks
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.knowledge_docs kd WHERE kd.id = doc_id AND kd.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.knowledge_docs kd WHERE kd.id = doc_id AND kd.user_id = auth.uid())
  );

CREATE TRIGGER set_knowledge_chunks_updated_at
  BEFORE UPDATE ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_project_id ON public.knowledge_docs(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_user_project ON public.knowledge_docs(user_id, project_id) WHERE deleted_at IS NULL;
