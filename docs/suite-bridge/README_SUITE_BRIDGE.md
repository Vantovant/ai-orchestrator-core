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
