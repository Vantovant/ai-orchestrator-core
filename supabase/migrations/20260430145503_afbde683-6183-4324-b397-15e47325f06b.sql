-- Step 4O — Second app inbox-only receive enablement (DESIGN-ONLY, OFF + engaged)
-- Generalises receive to app_vantoos_host with event vantoos.health.ping.
-- Axis B remains DISABLED. Receive kill-switch remains ENGAGED.

-- 1) Registry: enable inbox-only allow + permitted event for app_vantoos_host.
--    app_status MUST stay design_only. owner_scope already vanto_admin_ecosystem.
UPDATE public.vos_app_registry
SET inbox_only_allowed = true,
    inbox_allowed_events = ARRAY['vantoos.health.ping']::text[],
    updated_at = now()
WHERE app_key = 'app_vantoos_host';

-- 2) Per-app Axis B flag (locked OFF).
INSERT INTO public.vos_platform_flags (flag_key, flag_value, description, locked)
VALUES ('VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED', 'false',
        'Axis B per-app flag enabling inbox-only receive for app_vantoos_host. Phase 1: locked OFF.',
        true)
ON CONFLICT (flag_key) DO UPDATE SET
  flag_value = 'false',
  locked = true,
  updated_at = now();

-- 3) Per-app receive kill-switch (engaged).
INSERT INTO public.vos_kill_switches (scope, scope_target, state, reason)
VALUES ('inbox_receive', 'app_vantoos_host', 'engaged',
        'Step 4O default: inbox-only receive blocked until explicit enable.')
ON CONFLICT (scope, scope_target) DO UPDATE SET
  state = 'engaged',
  updated_at = now();