# Suite Bridge — Spoke Install Pack for **getwellgrow.app**

This is the drop-in prep to wire `https://getwellgrow.app/` into the VantoOS United Brain as a contact-sync spoke, matching the pattern already live on **Vanto CRM** and **Zazi Email** (`onlinecourseformlm.com`).

App identity in the hub registry:

| Field                   | Value                                          |
|-------------------------|------------------------------------------------|
| `app_key`               | `getwell_grow`                                 |
| Display name            | GetWell Grow                                   |
| Role                    | `spoke`                                        |
| Spoke URL               | `https://getwellgrow.app` (its Supabase project) |
| Hub URL (VantoOS)       | `https://zsvaqtlomgofwqkpwxeh.supabase.co`     |
| Shared secret slot (hub)| `SUITE_BRIDGE_SECRET_GETWELL_GROW`             |
| Shared secret name (spoke) | `SUITE_BRIDGE_SECRET`                       |
| Signing identity        | **Its own** (no alias — unlike getwell_hub)   |

> The same strong random value goes into **both** sides. Generate once with `openssl rand -hex 32`, paste identical value into the VantoOS hub slot and the spoke slot. Do **not** reuse the value from another spoke.

---

## What the GetWell Grow team needs to do (≈15 min)

### 1. Create the edge function
Path in their Supabase project:
```
supabase/functions/suite-bridge-spoke/index.ts
```
Copy the reference file at `docs/suite-bridge/getwell_grow/spoke_index.ts` from this pack **as-is** — `APP_KEY` is already set to `"getwell_grow"`.

### 2. Register the function
Add to their `supabase/config.toml`:
```toml
[functions.suite-bridge-spoke]
verify_jwt = false
```

### 3. Add the two secrets in their Supabase project
| Secret name             | Value                                                                 |
|-------------------------|-----------------------------------------------------------------------|
| `SUITE_BRIDGE_SECRET`   | The strong random hex string we will send them privately.             |
| `VANTOOS_HUB_URL`       | `https://zsvaqtlomgofwqkpwxeh.supabase.co`                            |

### 4. Create the contacts mirror table
Run this migration on their Supabase project. This is the local mirror the hub pushes clean, merged contacts into:

```sql
create table if not exists public.hub_contacts_mirror (
  id uuid primary key,                       -- hub_contact_id (source of truth)
  full_name text,
  first_name text,
  last_name text,
  whatsapp_display_name text,
  phone_e164 text,
  email text,
  contact_type text,
  lead_type text,
  temperature text,
  tags text[] default '{}',
  consent_whatsapp boolean default false,
  consent_email boolean default false,
  consent_sms boolean default false,
  notes text,
  version int not null default 1,
  is_deleted boolean not null default false,
  hub_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists hub_contacts_mirror_email_idx on public.hub_contacts_mirror(email);
create index if not exists hub_contacts_mirror_phone_idx on public.hub_contacts_mirror(phone_e164);

grant select on public.hub_contacts_mirror to authenticated;
grant all    on public.hub_contacts_mirror to service_role;

alter table public.hub_contacts_mirror enable row level security;
create policy "authenticated read hub mirror"
  on public.hub_contacts_mirror for select
  to authenticated using (true);
```

### 5. Deploy the function
Standard Supabase deploy — no other config needed.

### 6. (Recommended) Schedule the pull cron — every 15 min
So corrections we make in VantoOS reach GetWell Grow automatically:
```sql
select cron.schedule(
  'suite-bridge-contacts-pull',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://<their-supabase-ref>.supabase.co/functions/v1/suite-bridge-spoke-pull-tick',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
```
(Or wire the equivalent in their own scheduler — the pull mechanism is triggered by them calling the hub's `contacts_pull` action; the reference spoke file includes the caller.)

---

## What we (VantoOS) will do on our side

Nothing new — the hub already knows this app. We only need to:

1. Save the fresh shared secret into the hub slot `SUITE_BRIDGE_SECRET_GETWELL_GROW`.
2. Activate the registry row (`update vos_suite_apps set is_active = true where app_key = 'getwell_grow'`) once they confirm the function is deployed and their `hub_contacts_mirror` table exists.
3. Run a ping to verify:

```bash
curl -X POST "https://zsvaqtlomgofwqkpwxeh.supabase.co/functions/v1/suite-bridge-hub" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <VANTOOS_ANON_KEY>" \
  -d '{"action":"ping","app_key":"getwell_grow"}'
```

Expected:
```json
{ "ok": true, "spoke_status": 200, "spoke_body": { "ok": true, "app": "getwell_grow", "kind": "pong" } }
```

Then a first bulk **Sync now** from the Contacts page will populate their `hub_contacts_mirror`.

---

## Payloads their spoke must handle

The reference `spoke_index.ts` in this pack already handles all of these — listed for their engineer's awareness:

| `body.kind`         | Direction     | What to do                                                             |
|---------------------|---------------|------------------------------------------------------------------------|
| `ping`              | Hub → Spoke   | Reply `{ ok:true, app:"getwell_grow", kind:"pong" }`                   |
| `contacts_upsert`   | Hub → Spoke   | Upsert each item in `body.items` into `hub_contacts_mirror` by `id`. Respect `version` (only overwrite when incoming version ≥ local). |
| `contacts_delete`   | Hub → Spoke   | Set `is_deleted = true` for each `id` in `body.ids`.                   |
| `contacts_pull`     | Hub → Spoke   | Ack; then the spoke calls back to hub `action:"pull_contacts"` with its `since` cursor and applies returned batch. |
| `directive`         | Hub → Spoke   | Optional — store for later. Ack 200.                                   |
| `snapshot_request`  | Hub → Spoke   | Optional — reply with a signed snapshot.                               |

Signing on every request (both directions): HMAC-SHA256 over `` `${ts}.${nonce}.${app_key}.${body}` `` using the shared `SUITE_BRIDGE_SECRET`. `±300s` timestamp window. Nonces are one-shot.

---

## Troubleshooting matrix

| Symptom                | Cause                                                             |
|------------------------|-------------------------------------------------------------------|
| `bad_signature`        | `SUITE_BRIDGE_SECRET` on spoke ≠ value in hub slot, OR `APP_KEY` in spoke file isn't exactly `"getwell_grow"`. |
| `stale_timestamp`      | Clock drift > 5 min (rare on Supabase).                            |
| `spoke_missing_secret` | Forgot to add `SUITE_BRIDGE_SECRET` in their project.              |
| `spoke_unreachable`    | Function not deployed, or hub registry `url` is wrong.             |
| `unknown_app` (hub)    | Registry row for `getwell_grow` missing or inactive.               |

---

## Files in this pack

- `README_GETWELL_GROW.md` — this document (send to their engineer).
- `spoke_index.ts` — drop-in edge function, `APP_KEY` already set to `getwell_grow`.
