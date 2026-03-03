
-- 1) Add require_byok to invites
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS require_byok boolean NOT NULL DEFAULT false;

-- 2) Update user_ai_keys: add openai_key_last4, gemini_key_last4
ALTER TABLE public.user_ai_keys ADD COLUMN IF NOT EXISTS openai_key_last4 text DEFAULT NULL;
ALTER TABLE public.user_ai_keys ADD COLUMN IF NOT EXISTS gemini_key_last4 text DEFAULT NULL;

-- 3) Create ai_call_log table for audit trail
CREATE TABLE IF NOT EXISTS public.ai_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  calling_function text NOT NULL DEFAULT '',
  primary_provider text NOT NULL DEFAULT '',
  fallback_provider text DEFAULT NULL,
  used_provider text NOT NULL DEFAULT '',
  error_code text DEFAULT NULL,
  was_truncated boolean NOT NULL DEFAULT false,
  snapshot_len integer NOT NULL DEFAULT 0,
  byok_user boolean NOT NULL DEFAULT false,
  duration_ms integer DEFAULT NULL
);

ALTER TABLE public.ai_call_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all logs, users can read their own
CREATE POLICY "Users read own ai_call_log"
  ON public.ai_call_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service insert ai_call_log"
  ON public.ai_call_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 4) Set require_byok for Prominent SA Beta cohort invites
UPDATE public.invites SET require_byok = true WHERE cohort = 'Prominent SA Beta';
