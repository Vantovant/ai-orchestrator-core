# VantoOS Budget MCP — Architecture Proposal (v2)

Status: **plan only** — nothing in this document has been built yet. It's written to match the conventions already in `ai-orchestrator-core` (same table/RLS style as `FINANCE_SPEC.md`, same bridge/tool pattern as `mcp-bridge/index.ts` and `mcp-server/src/index.js`) so it can be implemented as a straight follow-on to the existing MCP, not a parallel system.

v2 changes from the first draft: Finance gets full edit + delete (not additive-only), a shared Trusted Sources feature is added, Shopping items and Trips both carry the buy-decision framework as real fields (need vs want + justification), and Shopping items get a business/personal split matching Trips.

## 1. What this connects

| Page | Route | Backend today | Gap |
|---|---|---|---|
| Finance | `/finance` | Fully built — `finance_entries`, `debts`, `income_streams`, `opportunities`, `finance_budget_items/events`, bank import, AI mentor edge functions | Rich data exists, but **zero MCP tools expose it** — Claude can't see or touch Finance at all right now |
| Shopping | `/shopping` | None — `ShoppingPage.tsx` holds items in local `useState`, lost on refresh | No table, no service, no MCP tools; page itself already has a "budget category linking coming soon" placeholder |
| Travel | `/travel` | None — `TravelPage.tsx` same local-state situation | No table, no service, no MCP tools; page has an "email-to-itinerary import coming soon" placeholder |

The existing MCP is `vantoos-mcp` (Railway) → `mcp-bridge` (Supabase Edge Function, service-role key, owner-scoped via `MCP_OWNER_USER_ID`) → the actual tables. It already covers contacts, projects, tasks, reminders, meetings, project notes, and the voice diary — all with real create/read tools, but only tasks/reminders/meetings currently have complete/delete tools too. This proposal brings Finance, Shopping, and Travel up to full read/write/edit/delete, and extends the same server and bridge — no second MCP, no different auth pattern.

## 2. Design decisions (confirmed)

- Upgrade `vantoos-mcp` / `mcp-bridge` directly — no separate connector.
- Shopping and Travel get real Supabase backends, not just MCP tools bolted onto local state.
- Finance, Shopping, and Travel all get full write **and** edit **and** delete from chat — no additive-only restriction.
- A shared Trusted Sources list (places/vendors you trust for good value) is a real feature in this build, not deferred.
- Shopping items and Trips both carry the buy-decision framework itself — need vs want, and a short justification — as data, not just something applied in conversation.
- Shopping items get a business/personal split, same as Trips.

On the delete question specifically: every table below that supports delete already has a `deleted_at` column and a soft-delete method in its existing service (`financeEntryService.softDelete`, `debtService.softDelete`, `budgetItemService.softDelete`, etc.) — so "full delete from chat" means the same recoverable soft-delete the Finance UI's own delete button already does, not a new, riskier hard-delete path. `reminders` and `meetings` are the exception (no `deleted_at` in the existing schema — their existing `delete_reminder`/`delete_meeting` tools are already hard deletes); nothing proposed here changes that.

## 3. New tables

RLS `auth.uid() = user_id` throughout, soft delete via `deleted_at`, auto `created_at`/`updated_at`.

### `trusted_sources` (shared — referenced by Shopping and Travel)

| Column | Type | Default | Notes |
|---|---|---|---|
| name | text | required | e.g. "Makro", "Takealot", a specific travel agent |
| category | text | 'general' | groceries / electronics / household / business_supplies / travel / general |
| notes | text | null | why it's trusted — price, quality, reliability |
| url | text | null | |
| is_preferred | boolean | false | your default go-to for that category |

### `shopping_items`

| Column | Type | Default | Notes |
|---|---|---|---|
| name | text | required | |
| quantity | integer | 1 | |
| category | text | 'other' | groceries / household / personal / other |
| spend_type | text | 'personal' | personal / business / mixed |
| need_vs_want | text | null | need / want |
| justification | text | null | why it's needed, or how it profits you — the buy-decision framework, captured at entry |
| unit_cost_estimate | numeric(12,2) | null | |
| actual_cost | numeric(12,2) | null | filled in when marked bought |
| is_recurring | boolean | false | |
| is_done | boolean | false | |
| purchased_at | timestamptz | null | |
| trusted_source_id | uuid | null | FK → trusted_sources, optional |
| finance_entry_id | uuid | null | set when a purchase is logged as a Finance expense |
| notes | text | null | |

### `trips`

| Column | Type | Default | Notes |
|---|---|---|---|
| destination | text | required | |
| start_date | date | required | |
| end_date | date | required | |
| status | text | 'upcoming' | upcoming / in-progress / completed / cancelled |
| spend_type | text | 'personal' | personal / business / mixed — your own mock data ("Client meeting + site visit", "Conference") is already business trips |
| need_vs_want | text | null | need / want |
| justification | text | null | purpose / expected return on this trip — buy-decision framework |
| budgeted_amount | numeric(12,2) | null | |
| notes | text | null | |

### `trip_expenses`

| Column | Type | Default | Notes |
|---|---|---|---|
| trip_id | uuid | FK → trips | |
| label | text | required | "flights", "hotel", "fuel"... |
| amount | numeric(12,2) | required | |
| expense_date | date | required | |
| trusted_source_id | uuid | null | FK → trusted_sources, optional — e.g. booked via a trusted agent/site |
| finance_entry_id | uuid | null | every trip expense also lands in `finance_entries` (category `travel`) so trip cost rolls into Finance totals automatically |

## 4. New `mcp-bridge` actions / `vantoos-mcp` tools

Same shape as every existing tool: a Zod-validated tool in `mcp-server/src/index.js` forwarding to a matching `case` in `mcp-bridge/index.ts`, owner-scoped, allow-listed fields only.

### Finance — full CRUD (currently has none at all)

| Tool | What it does |
|---|---|
| `get_finance_snapshot` | Wraps existing `finance-snapshot-build` — last-30-days income/expense/net, top categories, debt summary, income streams |
| `list_finance_entries` | Filter by type/category/date range |
| `create_finance_entry` / `update_finance_entry` / `delete_finance_entry` | Full CRUD on the ledger (delete = existing soft-delete) |
| `list_debts` / `create_debt` / `update_debt` / `delete_debt` | |
| `list_income_streams` / `create_income_stream` / `update_income_stream` / `delete_income_stream` | |
| `list_opportunities` / `create_opportunity` / `update_opportunity` / `delete_opportunity` | Savings/income/funding ideas, AI- or user-generated |
| `list_budget_items` / `create_budget_item` / `update_budget_item` / `delete_budget_item` | Recurring bills/subscriptions |
| `list_upcoming_budget_events` / `mark_budget_event_paid` / `update_budget_event_status` | Bill instances due in a date range |

### Shopping — full CRUD

| Tool | What it does |
|---|---|
| `list_shopping_items` | Filter by category / spend_type / done / recurring |
| `add_shopping_item` | Includes `need_vs_want` + `justification` up front |
| `update_shopping_item` | Edit any field, including re-categorizing or fixing a cost |
| `complete_shopping_item` | Mark bought; optional `actual_cost` + `log_to_finance: true` also creates the linked `finance_entries` expense |
| `delete_shopping_item` | Soft delete |

### Travel — full CRUD

| Tool | What it does |
|---|---|
| `list_trips` | Filter by status / spend_type |
| `create_trip` | Includes `need_vs_want` + `justification` up front |
| `update_trip` | Edit any field, including `update_trip_status` (upcoming → in-progress → completed / cancelled) |
| `delete_trip` | Soft delete |
| `add_trip_expense` / `update_trip_expense` / `delete_trip_expense` | Always also writes/updates/removes the linked `finance_entries` row so trip spend never drifts out of sync with Finance |
| `get_trip_budget_status` | `budgeted_amount` vs. sum of that trip's expenses |

### Trusted Sources — shared, full CRUD

| Tool | What it does |
|---|---|
| `list_trusted_sources` | Filter by category |
| `add_trusted_source` / `update_trusted_source` / `delete_trusted_source` | |

## 5. How this plugs into budgeting

Once built, Claude can open a weekly review by calling `get_finance_snapshot` + `list_upcoming_budget_events` + `list_shopping_items(is_done=false)` + `list_trips(status=upcoming)` in one pass — real numbers, not retyped ones. Every shopping item and trip now carries the actual buy-decision question (need or want, and why) at the moment it's created, so the framework isn't something applied after the fact in conversation — it's already sitting in the data waiting to be reviewed. A shopping item marked bought, or a trip expense added, rolls straight into Finance under the right category and the right business/personal split. And the trusted-sources list means "where should I buy this" has a real, growing answer instead of being re-decided every time.

## 6. Build order

1. Supabase migration: `trusted_sources`, `shopping_items`, `trips`, `trip_expenses` + RLS policies.
2. Replace local state in `ShoppingPage.tsx` / `TravelPage.tsx` with real services (`shoppingService.ts`, `travelService.ts`, `trustedSourceService.ts`, mirroring `financeService.ts`), and add the need/want + justification + spend_type + trusted-source fields to their forms.
3. Extend `mcp-bridge/index.ts` with all the `case` blocks above (Finance CRUD, Shopping CRUD, Travel CRUD, Trusted Sources CRUD).
4. Extend `mcp-server/src/index.js` with the matching `server.tool()` definitions, bump version to 1.4.0.
5. Deploy: `git push`, trigger Lovable's Supabase sync for `mcp-bridge` (a plain push doesn't redeploy the function — same caveat as the existing README), let Railway redeploy `vantoos-mcp`.
6. Verify with a direct `curl` against `mcp-bridge` (same pattern as the README's existing example) before trusting it from Claude.
7. Smoke-test every new tool from a Claude session.

## 7. Still open

- Table names above are a default guess — fine as-is, or match the `finance_` prefix style used by the budget-item tables instead?
- Should shopping categories widen beyond the current fixed four to match whatever Finance categories you actually use, so rollups line up cleanly?
- `trusted_sources.category` list above is a starting guess — add/remove categories to match how you actually think about vendors?
