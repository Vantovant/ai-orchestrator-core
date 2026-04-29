-- Step 4C: Populate per-app HMAC secret references in vos_app_registry.
-- Stores ONLY the secret reference name (string). NO secret values are stored in the database.
-- Field naming debt: registry uses `public_key_ref` for the symmetric HMAC secret name.
-- Rename to `hmac_secret_ref` is recommended in a future migration but is non-blocking.

UPDATE public.vos_app_registry SET public_key_ref = 'VOS_HMAC_VANTO_OS_INTERNAL_ACTIVE'
  WHERE app_key = 'app_vantoos_host';

UPDATE public.vos_app_registry SET public_key_ref = 'VOS_HMAC_VANTO_CRM_ACTIVE'
  WHERE app_key = 'app_vanto_crm';

UPDATE public.vos_app_registry SET public_key_ref = 'VOS_HMAC_APLGO_ACTIVE'
  WHERE app_key = 'app_aplgo_mlm';

UPDATE public.vos_app_registry SET public_key_ref = 'VOS_HMAC_ZAZI_MAIL_ACTIVE'
  WHERE app_key = 'app_zazi_mail';