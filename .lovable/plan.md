# GPS Trip Logger (additive)

## Verified facts (live database + code)
- `trips`: uuid id, user_id, destination, start_date/end_date (date, NOT NULL), status, spend_type, need_vs_want, justification, budgeted_amount, notes, created/updated/deleted_at. RLS: one ALL policy `auth.uid() = user_id`.
- `trip_expenses`: uuid id, user_id, trip_id, label, amount, expense_date, trusted_source_id, finance_entry_id, timestamps, deleted_at. Same ALL policy.
- Neither table is in repo migrations. They will only be referenced; no `CREATE ... IF NOT EXISTS` copy is added (a partial copy could drift from the live schema).
- **No trip detail page exists** — `/travel` renders cards only. A new `/travel/:tripId` page is needed (cards get an "Open" link). Existing card behaviour stays the same.
- **No map library installed.** Plan: add `leaflet` + `react-leaflet` with OpenStreetMap tiles (no key).
- MCP lives in `src/lib/mcp` (OAuth, caller token, RLS); `travel.ts` style is followed. Generated `supabase/functions/mcp` is never hand-edited.

## 1. Database — one migration `gps_trip_logger`
Tables (all `user_id uuid NOT NULL`, no FK to auth.users, RLS on, GRANTs to authenticated + service_role):
- `location_devices` (token_hash sha-256 only, source enum-check, enabled, paused, last_seen_at, revoked_at).
- `trip_location_points` (columns as specified + `dedupe_fingerprint`; UNIQUE(device_id, source_event_id), UNIQUE(device_id, dedupe_fingerprint); the 3 indexes; lat/lon/accuracy/speed CHECKs).
- `trip_stops`, `trip_legs` (columns as specified; `departure_at` nullable, `arrival_uncertainty_seconds` / `departure_uncertainty_seconds` for gaps).
- `trip_expense_stop_links` (PK expense+stop). No trigger, no finance write.
- `location_processing_runs`.
- `trip_tracking_sessions` (trip_id, device_id, actual_started_at, actual_ended_at, status active/paused/ended) — `trips.end_date` is never written.
- `location_settings` (user_id PK, raw_point_retention_days default 90, auto_delete_enabled default false).
- Policies: SELECT/UPDATE/DELETE own rows; **no INSERT policy on points** (service-role only from the ingest function). Devices insert own rows (via app, token hash generated server-side by function).

## 2. Edge function `location-ingest` (verify_jwt = false)
- POST only; body ≤ 256 KB; batch ≤ 500 events. Accepts OwnTracks `_type:"location"` (single or array) and normalized `{schema_version, events:[...]}`; non-location OwnTracks types ignored.
- Auth: Basic password or `x-device-token`; query-string tokens refused. SHA-256 then timing-safe compare; missing/revoked/disabled → 401.
- Rate limit: per device, reuse existing `vos_rate_limit_counters` pattern if compatible, else in-table counter (120 requests/min).
- Clock skew: reject recorded_at > now+10 min or < now−30 days (documented in code).
- Upsert with `ON CONFLICT DO NOTHING` → replay creates zero rows. Trip match only when exactly one active session for that user+device. Returns `[]` (OwnTracks) or `{accepted, rejected}` (normalized). No token/coordinate logging.
- Companion `location-device-register` (JWT-checked): creates device, returns token once.

## 3. Processor `location-process` (JWT or invoked after ingest)
- Pure TS module `src/lib/location/detect.ts` (shared copy in `supabase/functions/_shared/`) so tests run in Vitest.
- Quality flags (acc > 100 m → low_accuracy; implied speed > 250 km/h → suspect), gaps > 10 min marked missing.
- Stops: ≥ 5 min within ~100 m (accuracy-aware), confidence lowered at gap boundaries, departure null when unknown. Recompute replaces stops for the trip but carries `label_override` over by spatial/time match.
- Reverse geocode via OpenStreetMap Nominatim (no key, throttled) as candidate place.
- Legs: haversine, coverage_ratio, flight detection (> 300 km/h avg → mode "flight", no car comparison). TomTom only if secret `TOMTOM_API_KEY` exists; basis `current_traffic`/`static_route`, else `none`; delay only when comparable.

## 4. MCP — `src/lib/mcp/tools/location.ts`
The 10 tools requested, logic added to `core.ts` running under the caller's RLS. `delete_trip_location_data` requires `confirm: true`. No tool returns or creates device tokens. "No GPS recorded" when empty.

## 5. UI — new trip detail page
Tabs Timeline / Map / Tracking using existing shadcn components and tokens. SAST display with ISO in details. Tracking: register (token once + copy + OwnTracks settings), pause/resume, last fix, revoke, assign unassigned points, relabel stop, export JSON, delete with confirm.

## 6. Tests (Vitest)
Detection/parsing/formatting tests as pure functions; ingest-auth, idempotency, revoked-token and cross-user RLS checks as a live script run once against the deployed function with a throwaway device, then cleaned up.

## Secrets
Optional `TOMTOM_API_KEY` (you add it). Nothing else.

## Not touched
mcp-bridge, suite-bridge-hub, contacts code, existing trips/expenses/finance behaviour, WhatsApp.

## Rollback
New tables can be dropped (no existing table altered); remove the 3 new functions and the `/travel/:tripId` route.

## OwnTracks (after deploy)
Mode HTTP, URL `https://<backend>/functions/v1/location-ingest`, Authentication on, username = device name, password = the one-time token.
