ALTER TABLE public.suite_maytapi_quota
  ADD COLUMN IF NOT EXISTS freeze_until timestamptz,
  ADD COLUMN IF NOT EXISTS freeze_reason text;

UPDATE public.suite_maytapi_quota
SET freeze_until = now() + interval '24 hours',
    freeze_reason = 'maytapi_restriction_2026_07_23'
WHERE scope_key = 'getwell_whatsapp_suite';