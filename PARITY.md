# VantoOS — Executive OS Parity Checklist

## Module / Route Status

| Route | Module | Status |
|-------|--------|--------|
| `/` | Dashboard | ✅ Done |
| `/tasks` | Tasks | ✅ Done |
| `/reminders` | Reminders | ✅ Done |
| `/meetings` | Meetings | ✅ Done |
| `/calendar` | Calendar | 🟡 Stub |
| `/email` | Email | 🟡 Stub |
| `/finance` | Finance | ✅ Implemented (Sprint 2) |
| `/travel` | Travel | 🟡 Stub |
| `/shopping` | Shopping | 🟡 Stub |
| `/settings` | Settings | ✅ Done |

## Dashboard Sections

| Section | Status |
|---------|--------|
| Greeting header ("Good morning, {name} ✨") | ✅ Done |
| AI Status Banner (degraded/rate_limited/error) | ✅ Done (Sprint 2) |
| AI-Generated Daily Agenda card | ✅ Done |
| Top 5 Priorities (AI + live re-hydration) | ✅ Done (data drift fixed Sprint 2) |
| Today's Meetings panel | ✅ Done |
| Urgent Reminders panel | ✅ Done |
| KPI stat cards | ✅ Done |

## AI Persistence

| Feature | Status |
|---------|--------|
| `assistant_runs` table with RLS | ✅ Done |
| Save snapshot + result on briefing | ✅ Done |
| Dashboard reads latest run on load | ✅ Done |
| Agenda persists after refresh | ✅ Done |
| Data drift fix (live re-hydration) | ✅ Done (Sprint 2) |

## Settings / Executive Context

| Feature | Status |
|---------|--------|
| CRUD executive_context keys | ✅ Done |
| Suggested keys (role, goal, focus…) | ✅ Done |
| snapshot-build reads context | ✅ Done |
| Character limit per field (500) | ✅ Done (Sprint 2) |
| Backend context truncation (2000 total) | ✅ Done (Sprint 2) |

## Expert Fixes (Sprint 2)

| Fix | Status |
|-----|--------|
| A1: Data drift — live re-hydration of Top 5 | ✅ Done |
| A2: Token-bloat firewall (UI + backend) | ✅ Done |
| A3: ai_status in run-assistant + degraded UX | ✅ Done |

## Finance Module (Sprint 2)

| Feature | Status |
|---------|--------|
| finance_profiles table | ✅ Done |
| finance_entries table | ✅ Done |
| debts table | ✅ Done |
| income_streams table | ✅ Done |
| opportunities table | ✅ Done |
| financeService (CRUD + summary + export) | ✅ Done |
| finance-snapshot-build edge function | ✅ Done |
| finance-mentor edge function (SA lens) | ✅ Done |
| Finance page UI (5 tabs) | ✅ Done |
| Bankability profile support | ✅ Done |
| CSV export (entries + debts) | ✅ Done |

## Bank Statement Import (Sprint 3)

| Feature | Status |
|---------|--------|
| bank_accounts table | ✅ Done |
| bank_statement_imports table | ✅ Done |
| bank_transactions table (fingerprint dedup) | ✅ Done |
| merchant_rules table (user-learned) | ✅ Done |
| statements storage bucket (private) | ✅ Done |
| bankImportService (upload + parse + commit) | ✅ Done |
| bank-import-parse edge function | ✅ Done |
| SA merchant categorization rules | ✅ Done |
| CSV column mapping UI (SA bank presets) | ✅ Done |
| OFX/QIF parser support | ✅ Done |
| Review screen (totals, categories, insights) | ✅ Done |
| Commit to ledger flow | ✅ Done |
| SA insights (bank fees, subscriptions, recurring) | ✅ Done |
| Finance snapshot includes bank insights | ✅ Done |
| Import tab in Finance page (6 tabs) | ✅ Done |
| Export help modal | ✅ Done |

## Architecture Invariants

- [x] Database → Services → Snapshot → Edge Functions → UI
- [x] Token discipline: AI reads ONLY snapshot-build output
- [x] RLS + Auth enforced on all tables
- [x] run-assistant always returns 200 structured JSON
- [x] ai_status field in all AI responses
- [x] Soft delete everywhere (deleted_at)
