# Maytapi Hub Contract v2 — Fan-out Prep

GetWell Grow proposed extending `maytapi-hub-bridge` so every `send_recorded` for a WhatsApp campaign can trigger a follow-up email dispatch to a sister spoke (email spoke, e.g. `getwell_africa_email`). This is retention-loop plumbing: WhatsApp touch → email touch, same contact, no manual work.

Below is exactly what I'll ship on the VantoOS hub side. Nothing here breaks v1 — all new fields are optional and fan-out is default OFF (shadow first).

## What I'll build

### 1. Schema (one migration)

- `suite_maytapi_fanout_policy` — hub-owned config table
  - `campaign_type` (pk), `email_spoke_app_key`, `template_hint`, `delay_minutes`, `suppress_if` (jsonb: `["no_email","dnc_email"]`), `enabled` (bool, default false).
  - Seeded rows: `activation`, `birthday`, `zoom` → `getwell_africa_email` (matches their table §2.3).
- `suite_maytapi_events`: add `channel text default 'whatsapp'`, `fanout_state text` (`none|shadow_logged|dispatched|suppressed|failed`), `fanout_email_send_id text`, `fanout_decided_at timestamptz`.
- `suite_maytapi_dnc`: add `channel text default 'whatsapp' check (channel in ('whatsapp','email','all'))`, drop-and-recreate unique on `(phone_hash, channel)`.

### 2. `maytapi-hub-bridge` edits

- `send_recorded` accepts new optional `metadata` fields: `activation_campaign_recipients[]`, `contact{}`, `body_preview`, `template_hint`, `tone`. Stored verbatim in `metadata` jsonb — no schema change needed for those.
- After a successful `send_recorded` insert, look up `suite_maytapi_fanout_policy` by `campaign_type`.
  - If no row / `enabled=false` → set `fanout_state='none'`, return as today.
  - If enabled → evaluate `suppress_if` against contact email presence + email-channel DNC. Log decision (`shadow_logged` or `suppressed`).
  - Kill switch `MAYTAPI_FANOUT_ENFORCE` (secret, default `false`). When `false`: log intent only. When `true`: POST to configured email spoke `/functions/v1/hub-email-dispatch` with the v2 body shape and standard HMAC headers signed with that spoke's `bridge_secret_slot`.
  - Idempotency key = `${spoke_app_key}:${spoke_event_id}:email` so replays dedupe.
- `dnc_check` accepts optional `channel` (default `whatsapp`), scoped lookup on `suite_maytapi_dnc.channel in (channel,'all')`.
- `inbound_stop` accepts optional `channel` (default `whatsapp`). Email unsubscribe events from an email spoke can post `channel:'email'`.

### 3. Admin UI (`/admin/maytapi`)

- New **Fan-out policy** tab: edit `enabled`, `delay_minutes`, `suppress_if`, `template_hint` per `campaign_type`. Read-only view of last 50 fan-out decisions with state chip.
- Extend events ledger with `channel` + `fanout_state` columns.

### 4. Reply pack for GetWell Grow

After ship, I'll produce a short "v2 accepted — here's what changed on our side" note covering:
- Endpoint unchanged.
- Extra `metadata` fields are accepted and stored.
- Fan-out is live but `MAYTAPI_FANOUT_ENFORCE=false` (48h shadow window as they requested in §3).
- `dnc_check` now supports `channel`; existing v1 calls default to `whatsapp` — zero-break.
- Email spoke contract: they can either point us at their existing email spoke URL or use `getwell_africa_email` once its edge function is deployed.

## Open questions before I ship

1. **Email spoke target for now**: is `getwell_africa_email` already deployed with a `hub-email-dispatch` handler, or should the initial policy rows have `enabled=false` and we wait for it? (Default assumption: seed disabled, flip per-row from the admin UI.)
2. **Shadow window auto-flip**: keep manual (I flip `MAYTAPI_FANOUT_ENFORCE` after 48h review) or add a scheduled auto-flip once shadow logs are clean? (Default: manual.)

Say **go** and I ship all four sections in one pass with the defaults above. Or answer the two questions and I'll adjust.
