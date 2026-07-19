# Phase B — Strategy Engine

Governance-level orchestrator that lets the CEO issue signed strategic directives to all 5 spokes and receive signed snapshots back. **Not** marketing sends — that stays inside each spoke.

Named **Strategy Engine** throughout (UI, tables, functions) to avoid overlap with GetWell Hub's own Campaign Engine.

---

## Scope (what Phase B ships)

1. **Data model** — directives, snapshots, spoke proposals, approvals.
2. **Hub outbound** — CEO creates a directive in VantoOS → signed broadcast to selected spokes via existing `suite-bridge-hub`.
3. **Hub inbound** — spokes reply with signed snapshots/proposals → verified → stored → surfaced.
4. **Strategy Room UI** — new page under Governance to draft directives, see spoke responses, approve/reject proposals.
5. **Spoke contract doc** — updated `docs/suite-bridge/` guide so each of the 5 spokes knows exactly which payload shapes to accept and reply with. No spoke code changes required for Phase B — the existing `suite-bridge-spoke` template already routes on `body.kind`.

Out of scope (Phase C+): AI auto-drafting of proposals inside spokes, weekly auto-briefing digest, RAG over all spoke snapshots.

---

## Data model (new tables, RLS + GRANTs)

- `vos_strategy_directives`
  - id, title, goal_text, kpi_target (jsonb), horizon_days, status (`draft|broadcast|closed`), created_by, created_at, closed_at
- `vos_strategy_targets`
  - id, directive_id, app_key, delivery_status (`pending|delivered|failed`), nonce, delivered_at, error
- `vos_strategy_snapshots` (inbound from spokes)
  - id, directive_id (nullable — spokes can push unsolicited), app_key, kind (`snapshot|proposal|status`), payload jsonb, signature, nonce, received_at, verified bool
- `vos_strategy_proposals` (CEO-visible, promoted from snapshots where kind='proposal')
  - id, directive_id, app_key, summary, detail jsonb, review_state (`pending|approved|rejected`), reviewed_by, reviewed_at

All tables: RLS on, admin-only via `has_role(auth.uid(),'admin')`, GRANTs to `authenticated` + `service_role`.

---

## Hub edge functions

**Extend `suite-bridge-hub`** — add two new actions on top of existing `ping|send|receive`:

- `action: "broadcast_directive"` → for each target app_key, sign+POST `{kind:"directive", directive_id, title, goal_text, kpi_target, horizon_days}` to that spoke's `suite-bridge-spoke`. Log per-target row in `vos_strategy_targets`.
- `action: "receive"` (existing) — extend to detect `body.kind in ("snapshot","proposal","status")` and route into `vos_strategy_snapshots` (+ promote proposals into `vos_strategy_proposals`). Signature verification is already in place.

No new function file needed. Keeps signing/replay-window logic in one place.

---

## UI — Strategy Room

New route `/app/governance/strategy` (linked from existing Governance sidebar section):

- **Directives list** — draft / active / closed tabs.
- **Draft form** — title, goal, KPI target (freeform jsonb helper), horizon, spoke checkboxes.
- **Broadcast button** — calls `suite-bridge-hub` with `broadcast_directive`, shows per-spoke delivery receipts.
- **Directive detail** — timeline of snapshots + proposals from each spoke; approve/reject buttons on proposals (write to `vos_strategy_proposals.review_state`).
- **Empty-state** — plain-English explainer: "Strategy Engine issues suite-wide goals. Spokes execute in their own way."

Executive copy conventions: "Directives" not "Campaigns", "Receipts" not "Logs", data sovereignty language preserved.

---

## Spoke contract (docs only, no spoke code change)

Update `docs/suite-bridge/README_SUITE_BRIDGE.md` with a **Phase B addendum**:

- Accepted inbound `body.kind`: `directive` (spoke should store + optionally trigger internal work; reply is optional but if sent must be signed back to hub's `receive`).
- Outbound `body.kind` a spoke may send unsolicited: `snapshot` (KPI heartbeat), `proposal` (spoke's suggestion to improve toward directive), `status` (progress).
- Signing rules unchanged (HMAC-SHA256 over `${ts}.${nonce}.${app_key}.${body}` with `SUITE_BRIDGE_SECRET`).
- Include one worked example per kind.

Each spoke team implements the branches inside their existing `suite-bridge-spoke/index.ts` at their own pace — Phase B works end-to-end from day one for any spoke that opts in, and stays silent for those that haven't yet.

---

## Verification steps (built into this ship)

1. Migration applied; tables + policies + grants in place (confirm via linter).
2. Draft a test directive in Strategy Room, broadcast to `getwell_hub` only.
3. Confirm receipt row in `vos_strategy_targets` = delivered.
4. Simulate a signed inbound proposal from `getwell_hub` (using existing self-test pattern) → row appears in `vos_strategy_snapshots` + promoted to `vos_strategy_proposals`.
5. Approve it in UI → `review_state='approved'`, `reviewed_by=admin`.
6. Baseline check: Step 5D governance state untouched (PROVEN / RED / LOCKED).

---

## Technical details (engineer section)

- Reuse existing `hmacSha256Hex` and timing-safe compare in `suite-bridge-hub/index.ts`.
- `broadcast_directive` loops sequentially with `Promise.allSettled` to keep one bad spoke from blocking others; each result written to `vos_strategy_targets` regardless.
- Proposal promotion done in a Postgres trigger on `vos_strategy_snapshots` (after insert where kind='proposal') to keep hub function thin.
- All new UI queries go through TanStack Query with 30s stale time; no direct realtime channels this phase (add in C if needed).
- Sidebar item guarded by `has_role('admin')` — same pattern as existing Governance tabs.

---

## Ready to build

Say **GO** and I ship all four pieces (migration, hub extension, Strategy Room UI, docs addendum) in one pass, then run the verification steps above.
