
CREATE TABLE public.knowledge_docs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  tags TEXT[] DEFAULT '{}',
  raw_text TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  external_id TEXT,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.knowledge_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own knowledge_docs" ON public.knowledge_docs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_knowledge_docs_project ON public.knowledge_docs(user_id, project_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_knowledge_docs_dedupe ON public.knowledge_docs(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_knowledge_docs_external ON public.knowledge_docs(user_id, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL;
