# Suite Bridge — Drop-in Install Guide (Spokes)

This is the **one-session install pack** for wiring the 4 sister apps to the VantoOS United Brain hub. Do all 4 in one sitting so signatures line up.

## What ships in Phase A

- **Hub (VantoOS)** — already deployed: `suite-bridge-hub`
- **Spoke (this bundle)** — identical file dropped into each of the 4 sister apps

Phase A does **bridge-only**: signed ping ↔ signed pong. No campaigns, no directives, no AI. That comes in Phase B.

---

## Per-app secret matrix

For each spoke, one strong random value is shared between VantoOS and that spoke.

| Spoke app          | `APP_KEY` (in spoke file) | Secret name on VantoOS (hub)         | Secret name on spoke   |
|--------------------|---------------------------|--------------------------------------|------------------------|
| GetWell Hub        | `getwell_hub`             | `SUITE_BRIDGE_SECRET_GETWELL_HUB`    | `SUITE_BRIDGE_SECRET`  |
| GetWell Grow       | `getwell_grow`            | `SUITE_BRIDGE_SECRET_GETWELL_GROW`   | `SUITE_BRIDGE_SECRET`  |
| GetWell Africa     | `getwell_africa`          | `SUITE_BRIDGE_SECRET_GETWELL_AFRICA` | `SUITE_BRIDGE_SECRET`  |
| Online Course MLM  | `mlm_course`              | `SUITE_BRIDGE_SECRET_MLM_COURSE`     | `SUITE_BRIDGE_SECRET`  |

> **Same value both sides.** Generate one strong random string per spoke (e.g. `openssl rand -hex 32`). Paste identical value into the hub slot and the spoke slot. Never reuse across spokes.

---

## Per spoke — install steps (10 minutes each)

1. **Create the edge function** in the spoke project:
   - Path: `supabase/functions/suite-bridge-spoke/index.ts`
   - Copy the file from `docs/suite-bridge/spoke/index.ts` (this bundle).
   - **Change line 17:** set `APP_KEY` to the value from the matrix above.

2. **Register the function** in the spoke's `supabase/config.toml`:
   ```toml
   [functions.suite-bridge-spoke]
   verify_jwt = false
   ```

3. **Add the shared secret** in the spoke project:
   - Name: `SUITE_BRIDGE_SECRET`
   - Value: the strong random string for this spoke (same one added to VantoOS).

4. Deploy the function.

---

## Verification (from VantoOS)

For each spoke, from the VantoOS hub project shell:

```bash
curl -X POST "https://<VANTOOS_SUPABASE_URL>/functions/v1/suite-bridge-hub" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <VANTOOS_ANON_KEY>" \
  -d '{"action":"ping","app_key":"getwell_hub"}'
```

**Expected:**
```json
{ "ok": true, "spoke_status": 200, "spoke_body": { "ok": true, "app": "getwell_hub", "kind": "pong" } }
```

Also verify a receipt appears in VantoOS `vos_outbound_log` for that spoke with `status = "delivered"`.

Repeat for `getwell_grow`, `getwell_africa`, `mlm_course`. All four green = Phase A CLEAN.

---

## Troubleshooting

| Symptom                              | Cause                                                              |
|--------------------------------------|--------------------------------------------------------------------|
| `bad_signature`                      | Secret on spoke ≠ secret on hub, OR `APP_KEY` in spoke file wrong. |
| `stale_timestamp`                    | Spoke and hub clocks drift > 5 min. Very rare on Supabase.         |
| `spoke_missing_secret`               | Forgot to add `SUITE_BRIDGE_SECRET` on the spoke.                  |
| `spoke_unreachable`                  | Function not deployed on spoke, or wrong URL in `vos_suite_apps`.  |
| `unknown_app` (hub)                  | `app_key` in request doesn't match a row in `vos_suite_apps`.      |

---

## Out of scope for Phase A (do NOT build yet)

- Campaign Engine, three-layer knowledge sync, Strategy Room UI
- Spoke-side AI proposals
- Any writes to Step 5D governance state (stays PROVEN / RED / LOCKED)

---

## Phase B — Strategy Engine addendum

Phase A = signed ping/pong. Phase B adds a small **payload vocabulary** on top of the same signed transport. No new endpoint, no new secret — the existing `suite-bridge-spoke` function receives everything.

### Inbound to the spoke (from VantoOS Hub)

`body.kind = "directive"` — the CEO issued a suite-wide goal.

```json
{
  "kind": "directive",
  "directive_id": "uuid",
  "title": "Q3 growth push",
  "goal_text": "Add 500 new paying users across the suite in 90 days.",
  "kpi_target": { "metric": "new_paying_users", "target": 500 },
  "horizon_days": 90,
  "issued_at": 1784500000000
}
```

Spoke should: acknowledge with 200, store locally, and (optionally) trigger its own internal work. Replies are optional but if sent must be signed back to the hub as `snapshot`, `proposal`, or `status`.

### Outbound from the spoke (to VantoOS Hub `receive`)

Sign with the same `SUITE_BRIDGE_SECRET`. Target URL: `https://<vantoos>.supabase.co/functions/v1/suite-bridge-hub` with request body `{ "action": "receive", "body": <your body> }`.

`snapshot` — periodic KPI heartbeat:

```json
{ "kind": "snapshot", "directive_id": null, "metrics": { "active_users": 1240, "mrr_zar": 87400 } }
```

`proposal` — spoke suggests how it will help hit a directive (promoted into CEO review queue):

```json
{
  "kind": "proposal",
  "directive_id": "uuid-of-directive",
  "summary": "Launch African-market landing campaign",
  "detail": { "channels": ["email","whatsapp"], "budget_zar": 12000, "eta_days": 14 }
}
```

`status` — progress update on a directive:

```json
{ "kind": "status", "directive_id": "uuid-of-directive", "progress": 0.42, "note": "Ahead of plan" }
```

### Signing (unchanged)

HMAC-SHA256 over `` `${ts}.${nonce}.${app_key}.${bodyStr}` `` where `app_key` is *this spoke's* key (not `vantoos`). Send:

- `x-bridge-app: <your app_key>`
- `x-bridge-timestamp: <unix seconds>`
- `x-bridge-nonce: <uuid>`
- `x-bridge-signature: <hex>`

Timestamp window: ±300s. Nonces are recorded — replays are rejected.
