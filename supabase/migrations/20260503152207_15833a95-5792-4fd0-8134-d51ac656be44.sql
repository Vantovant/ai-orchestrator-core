UPDATE public.vos_platform_flags
   SET flag_value = 'false', locked = true, updated_at = now()
 WHERE flag_key = 'REHEARSAL_RETRY_ARMED';

UPDATE public.vos_platform_flags
   SET flag_value = 'false', locked = true, updated_at = now()
 WHERE flag_key = 'REHEARSAL_HELPER_ENABLED';