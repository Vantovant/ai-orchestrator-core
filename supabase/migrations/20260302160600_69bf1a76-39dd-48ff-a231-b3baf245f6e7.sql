
-- Knowledge Base Workspaces
CREATE TABLE public.kb_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  workspace_type text NOT NULL DEFAULT 'private' CHECK (workspace_type IN ('private','gov','nm')),
  default_provider text NOT NULL DEFAULT 'openai' CHECK (default_provider IN ('openai','vertex')),
  openai_vector_store_id text,
  vertex_corpus_resource text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.kb_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own kb_workspaces"
  ON public.kb_workspaces FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Knowledge Base Files
CREATE TABLE public.kb_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.kb_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai','vertex')),
  provider_file_id text NOT NULL,
  provider_container_id text NOT NULL,
  filename text,
  file_size_bytes bigint,
  tags jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.kb_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own kb_files"
  ON public.kb_files FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Verified Sources
CREATE TABLE public.verified_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.kb_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  type text,
  title text,
  source_url text,
  fetched_at timestamptz,
  verified boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.verified_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own verified_sources"
  ON public.verified_sources FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Knowledge Base Queries log (for admin health / PII audit)
CREATE TABLE public.kb_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.kb_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  query_redacted text NOT NULL,
  had_pii boolean DEFAULT false,
  pii_counts jsonb DEFAULT '{}'::jsonb,
  tokens_used integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own kb_query_log"
  ON public.kb_query_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Separate storage bucket for GOV knowledge files
INSERT INTO storage.buckets (id, name, public) VALUES ('kb-gov', 'kb-gov', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('kb-private', 'kb-private', false);

-- Storage RLS for kb-gov
CREATE POLICY "Users upload own kb-gov files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'kb-gov' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own kb-gov files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'kb-gov' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own kb-gov files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'kb-gov' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage RLS for kb-private
CREATE POLICY "Users upload own kb-private files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'kb-private' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own kb-private files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'kb-private' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own kb-private files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'kb-private' AND auth.uid()::text = (storage.foldername(name))[1]);
