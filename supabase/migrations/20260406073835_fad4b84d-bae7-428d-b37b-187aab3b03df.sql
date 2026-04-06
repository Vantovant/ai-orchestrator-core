
-- 1. portfolio_partner_threads: rename is_pinned→pinned, drop deleted_at, add archived
ALTER TABLE public.portfolio_partner_threads RENAME COLUMN is_pinned TO pinned;
ALTER TABLE public.portfolio_partner_threads DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.portfolio_partner_threads ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- 2. portfolio_partner_messages: rename context_tags→context_tags_json, structured_data→retrieval_meta_json, drop token_count, add attachments_json
ALTER TABLE public.portfolio_partner_messages RENAME COLUMN context_tags TO context_tags_json;
ALTER TABLE public.portfolio_partner_messages RENAME COLUMN structured_data TO retrieval_meta_json;
ALTER TABLE public.portfolio_partner_messages DROP COLUMN IF EXISTS token_count;
ALTER TABLE public.portfolio_partner_messages ADD COLUMN IF NOT EXISTS attachments_json jsonb DEFAULT '[]'::jsonb;

-- 3. partner_briefing_preferences: rename enabled→weekly_enabled, drop last_sent_at
ALTER TABLE public.partner_briefing_preferences RENAME COLUMN enabled TO weekly_enabled;
ALTER TABLE public.partner_briefing_preferences DROP COLUMN IF EXISTS last_sent_at;

-- 4. project_partner_score_history: rename recorded_at→captured_at, drop source
ALTER TABLE public.project_partner_score_history RENAME COLUMN recorded_at TO captured_at;
ALTER TABLE public.project_partner_score_history DROP COLUMN IF EXISTS source;
