# VantoOS — Executive OS Parity Checklist

## Module / Route Status

| Route | Module | Status |
|-------|--------|--------|
| `/` | Dashboard | ✅ Done |
| `/plan` | Plan Hub (Today/Tasks/Reminders/Meetings/Calendar) | ✅ Done (Sprint 5) |
| `/tasks` | → Redirect to /plan?tab=tasks | ✅ Done (Sprint 5) |
| `/reminders` | → Redirect to /plan?tab=reminders | ✅ Done (Sprint 5) |
| `/meetings` | → Redirect to /plan?tab=meetings | ✅ Done (Sprint 5) |
| `/calendar` | → Redirect to /plan?tab=calendar | ✅ Done (Sprint 5) |
| `/email` | Email (Superhuman speed layer) | ✅ Done (Sprint 4) |
| `/finance` | Finance | ✅ Done (Sprint 2) |
| `/travel` | Travel (premium stub) | ✅ Done (Sprint 5) |
| `/shopping` | Shopping (premium stub) | ✅ Done (Sprint 5) |
| `/settings` | Settings (full) | ✅ Done (Sprint 5) |

## Sprint 6 — SA Executive Pro Layer

| Feature | Status |
|---------|--------|
| Executive Profile Wizard (multi-role selection) | ✅ Done |
| Profile stored in user_preferences | ✅ Done |
| Role-aware AI tips in profile | ✅ Done |
| Compliance Center widget | ✅ Done |
| SA compliance presets (SARS/VAT/UIF/PAYE) | ✅ Done |
| Compliance widget on Dashboard + Plan Today | ✅ Done |
| clients table + entity_client_links table | ✅ Done |
| Client/Matter CRUD in Settings | ✅ Done |
| ClientTagPicker component | ✅ Done |
| Client tags on Tasks in Plan hub | ✅ Done |
| Finance Mentor role-aware upgrade | ✅ Done |
| Role-specific AI instructions (5 profiles) | ✅ Done |
| SA_EXECUTIVE_SPEC.md documentation | ✅ Done |

## Sprint 5 — Consolidation & Mobile Polish

| Feature | Status |
|---------|--------|
| Plan Hub with 5 tabs | ✅ Done |
| Today tab (meetings, reminders, priorities, quick-add) | ✅ Done |
| Calendar tab (Day/Week/Month views) | ✅ Done |
| Calendar shows meetings + reminders + task due dates | ✅ Done |
| Legacy route redirects | ✅ Done |
| Mobile bottom nav | ✅ Done |
| Mobile FAB quick-add button | ✅ Done |
| Scrollable tabs on mobile | ✅ Done |
| Card-based layouts (no tables) | ✅ Done |
| Travel page (trip list + add modal) | ✅ Done |
| Shopping page (list + recurring + categories) | ✅ Done |
| Settings: work hours | ✅ Done |
| Settings: key coach toggle | ✅ Done |
| Settings: data export links | ✅ Done |
| Sidebar reduced to 7 items | ✅ Done |
| ROUTES.md documentation | ✅ Done |

## Dashboard Sections

| Section | Status |
|---------|--------|
| Greeting header ("Good morning, {name} ✨") | ✅ Done |
| AI Status Banner (degraded/rate_limited/error) | ✅ Done |
| AI-Generated Daily Agenda card | ✅ Done |
| Top 5 Priorities (AI + live re-hydration) | ✅ Done |
| Today's Meetings panel | ✅ Done |
| Urgent Reminders panel | ✅ Done |
| KPI stat cards | ✅ Done |
| Compliance widget (compact) | ✅ Done (Sprint 6) |

## AI Persistence

| Feature | Status |
|---------|--------|
| `assistant_runs` table with RLS | ✅ Done |
| Save snapshot + result on briefing | ✅ Done |
| Dashboard reads latest run on load | ✅ Done |
| Agenda persists after refresh | ✅ Done |
| Data drift fix (live re-hydration) | ✅ Done |

## Settings / Executive Context

| Feature | Status |
|---------|--------|
| CRUD executive_context keys | ✅ Done |
| Suggested keys (role, goal, focus…) | ✅ Done |
| snapshot-build reads context | ✅ Done |
| Character limit per field (500) | ✅ Done |
| Backend context truncation (2000 total) | ✅ Done |
| Work hours setting | ✅ Done (Sprint 5) |
| Email key coach toggle | ✅ Done (Sprint 5) |
| Data export (Finance CSV) | ✅ Done (Sprint 5) |
| Executive Profile Wizard | ✅ Done (Sprint 6) |
| Client/Matter management | ✅ Done (Sprint 6) |

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
| Finance Mentor role-aware (5 profiles) | ✅ Done (Sprint 6) |
| Finance page UI (6 tabs) | ✅ Done |
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

## Email Module (Sprint 4)

| Feature | Status |
|---------|--------|
| email_accounts table + RLS | ✅ Done |
| email_oauth_tokens table (server-only RLS) | ✅ Done |
| email_messages table + RLS | ✅ Done |
| Mock data (skip OAuth for now) | ✅ Done |
| Account switcher (Option A) | ✅ Done |
| Keyboard shortcuts (J/K/E/S/Enter/Esc) | ✅ Done |
| Command bar (Ctrl+K) | ✅ Done |
| Cheat sheet (?) | ✅ Done |
| Key Coach strip | ✅ Done |
| Onboarding tutorial | ✅ Done |
| Create Task/Meeting from email | ✅ Done |
| Snooze + Waiting On views | ✅ Done |

## Compliance (Sprint 6)

| Feature | Status |
|---------|--------|
| compliance_reminders table + RLS | ✅ Done |
| SA compliance presets | ✅ Done |
| Compliance CRUD service | ✅ Done |
| ComplianceWidget (full + compact) | ✅ Done |
| Dashboard integration | ✅ Done |
| Plan Today tab integration | ✅ Done |

## Client/Matter Tagging (Sprint 6)

| Feature | Status |
|---------|--------|
| clients table + RLS | ✅ Done |
| entity_client_links table + RLS | ✅ Done |
| clientService (CRUD + link/unlink) | ✅ Done |
| ClientTagPicker component | ✅ Done |
| Task tagging in Plan hub | ✅ Done |
| Client management in Settings | ✅ Done |

## Architecture Invariants

- [x] Database → Services → Snapshot → Edge Functions → UI
- [x] Token discipline: AI reads ONLY snapshot-build output
- [x] RLS + Auth enforced on all tables
- [x] run-assistant always returns 200 structured JSON
- [x] ai_status field in all AI responses
- [x] Soft delete everywhere (deleted_at)
- [x] Role-aware AI: Finance Mentor adapts by executive profile
