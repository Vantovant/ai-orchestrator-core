# VantoOS — Page-By-Page Technical Specification

**Version:** 2.0  
**Date:** 5 April 2026  
**Classification:** Confidential  
**Status:** Executive Beta — Live Production

---

## 1. Dashboard (`/`)

**File:** `src/pages/DashboardPage.tsx`

### Purpose
Executive command centre — the first screen users see after login.

### Components
- **AI Daily Agenda** — AI-generated briefing via `run-assistant` edge function with greeting, day overview, focus areas, time blocks, and "3 Commands for Today"
- **Stat Cards** — Active tasks, today's meetings, urgent reminders, total tasks
- **Top 5 Priorities** — AI-ranked tasks rehydrated against live data
- **Today's Meetings** — Quick-access cards with click-through to detail drawers
- **Compliance Widget** — Overdue SA compliance items (SARS, VAT, PAYE, UIF, CIPC)
- **Urgent Reminders** — 48-hour lookahead

### Edge Functions
| Function | Purpose |
|----------|---------|
| `run-assistant` | Builds snapshot of all user data, generates structured AI briefing |
| `snapshot-build` | Compressed data snapshot for AI context |

---

## 2. Plan Hub (`/plan`)

**File:** `src/pages/PlanPage.tsx` (816 lines — master orchestrator)

### Tab Architecture
| Tab | Query Param | Description |
|-----|-------------|-------------|
| Today | `?tab=today` | Daily snapshot: priorities, meetings, reminders, quick-add |
| Tasks | `?tab=tasks` | Full CRUD with priority, due dates, project linking, search & filter |
| Reminders | `?tab=reminders` | Time-based reminders with done/pending filter |
| Meetings | `?tab=meetings` | Meeting management with attendees, location, project linking |
| Notes | `?tab=notes` | Daily structured notes with AI action extraction, dictation |
| Calendar | `?tab=calendar` | Day/Week/Month views with meetings, reminders, task due dates |

### Component Tree
```
PlanPage.tsx (orchestrator)
├── SecretaryBriefing.tsx          — AI morning briefing
├── VoiceInput / VoiceConfirmation — Voice commands
├── PlanCommandBar.tsx             — ⌘K quick actions
├── NotesTab.tsx                   — Daily diary
│   ├── DictationMic.tsx           — Voice-to-text
│   ├── NoteSelectionMenu.tsx      — Highlight-to-convert
│   └── ActionExtractor.tsx        — AI extraction
├── TaskDetailDrawer.tsx           — Task detail/edit panel
├── ReminderDetailDrawer.tsx       — Reminder detail panel
└── MeetingDetailDrawer.tsx        — Meeting detail panel
    ├── ActionExtractor            — Task extraction from notes
    └── AI Advisor Panel           — Live background advisor
```

### Database Tables
| Table | Key Columns |
|-------|-------------|
| `tasks` | `id, title, status, priority, due_date, project_id, dedupe_key, completed_at` |
| `reminders` | `id, title, reminder_time, is_done, task_id, project_id` |
| `meetings` | `id, title, start_time, end_time, location, attendees, notes, project_id` |
| `notes_daily` | `id, note_date, content, structured_mode, structure_json, links_json` |

### Edge Functions
| Function | Purpose |
|----------|---------|
| `plan-ai-secretary` | Secretary Mode briefings (morning, pre-meeting, end-of-day, meeting_advisor) |
| `plan-ai-extract-actions` | NLP extraction: notes → tasks/reminders/meetings |
| `snapshot-build` | Compressed data snapshots for AI context |

### Key Features
- **Secretary Mode** — AI morning briefings, pre-meeting prompts, end-of-day reviews
- **Command Bar** (⌘K) — Quick actions across all plan entities
- **Voice Input** — Speech-to-text with natural language command parsing
- **AI Action Extraction** — Extracts tasks, reminders, meetings from free-form notes
- **Meeting AI Advisor** — Debounced background advisor during active meetings
- **Deduplication** — SHA-256 dedupe_key on tasks prevents duplicate creation

---

## 3. Email (`/email`)

**File:** `src/pages/EmailPage.tsx` (750 lines — master orchestrator)

### Component Tree
```
EmailPage.tsx
├── AccountSwitcher       — Gmail account dropdown, unified/filtered view
├── EmailList             — Inbox rows with star toggle, badges, handled indicator
├── EmailDetail           — Single email view with toolbar + sticky panels
│   ├── HandledStamp      — Action audit trail
│   └── SmartExtractPanel — AI-powered entity extraction + routing
├── CommandBar            — ⌘K palette
├── CheatSheet            — Keyboard shortcut reference modal
├── KeyCoach              — Contextual shortcut hints strip
└── OnboardingTutorial    — 5-step first-run checklist
```

### Database Tables (6 tables)
| Table | Purpose |
|-------|---------|
| `email_accounts` | Gmail OAuth connections |
| `email_messages` | Synced email metadata |
| `email_oauth_tokens` | Decoupled token storage |
| `email_extracts` | AI analysis cache |
| `email_action_log` | Handled audit trail |
| `email_inbox_items` | Inbox status tracking |

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| J/K | Navigate emails |
| E | Archive |
| S | Snooze (tomorrow 8AM) |
| X | Star/Unstar |
| U | Toggle read/unread |
| W | Waiting On |
| T | Create task from email |
| M | Create meeting from email |
| ? | Cheat sheet |

### Edge Functions
| Function | Purpose |
|----------|---------|
| `gmail-auth-start` / `gmail-auth-callback` | OAuth flow |
| `gmail-sync` | Incremental sync via Gmail History API |
| `gmail-list` / `gmail-get` | Email listing and body fetching |
| `gmail-disconnect` | Account disconnection |
| `email-smart-extract` | AI-powered email analysis & routing |

### Smart Extract Capabilities
- Email type classification (expense, invoice, subscription, travel, task, meeting, fyi)
- Money direction detection (income/expense/transfer/bank fee)
- Account-aware intelligence
- Entity extraction (merchant, amount, currency, date, reference)
- One-click routing to finance, tasks, meetings, reminders, project notes
- PII redaction (SA ID numbers, phone numbers, bank accounts)

### Plan Hub Integration
- **T key** → Creates task from email subject, links via `email_action_log`
- **M key** → Creates meeting from email, links via `email_action_log`
- Smart Extract routes → Create finance entry, task, meeting, or reminder
- All created entities appear in Plan Hub with email source reference
- `HandledStamp` shows audit trail of actions taken on each email

---

## 4. Finance (`/finance`)

**File:** `src/pages/FinancePage.tsx`

### Tab Architecture
| Tab | Function |
|-----|----------|
| Overview | Monthly income/expense/net cards, entry list with CRUD |
| Debt Radar | Active debts with principal, interest rates, repayment |
| Income Engine | Multiple income streams with targets |
| Opportunities | AI-surfaced opportunities with difficulty ratings |
| Import | Bank statement import (CSV/OFX) with AI categorisation |
| AI Mentor | Financial briefing with role-aware insights |
| Budget | Recurring items with cadence, autopay, event generation |
| Invest | Full investment sub-module |

### Database Tables
| Table | Purpose |
|-------|---------|
| `finance_entries` | Income/expense records |
| `finance_budget_items` | Recurring budget items |
| `finance_budget_events` | Generated upcoming events |
| `finance_notes` | Monthly financial annotations |
| `finance_profiles` | User financial profile (role, VAT, tax) |
| `debts` | Debt tracking |
| `income_streams` | Multiple income sources |
| `opportunities` | AI-surfaced opportunities |
| `bank_accounts` | Bank account metadata |
| `bank_statement_imports` | Import records |
| `bank_transactions` | Parsed transactions |
| `merchant_rules` | Category mapping rules |

### Edge Functions
| Function | Purpose |
|----------|---------|
| `finance-mentor` | AI financial briefing (role-aware) |
| `finance-ai-route` | Finance AI query routing |
| `finance-snapshot-build` | Financial data snapshot |
| `bank-import-parse` | CSV/OFX statement parser |
| `bank-categorize-ai` | AI transaction categorisation |
| `budget-generate-events` | Budget event generation |

---

## 5. Invest & Trade (`/invest`)

**File:** `src/pages/InvestPage.tsx`

### Tab Architecture
| Tab | Function |
|-----|----------|
| Market Pulse | Live FX, crypto, commodities, risk mood, macro headlines |
| Learn | 6 beginner-friendly lessons |
| Watchlist | Custom watchlists with real-time tracking |
| Portfolio | Manual holdings with P&L calculations |
| Paper Trade | Risk-free simulated trading |
| Alerts | Price-based alerts (above/below/change) |
| AI Mentor | AI investment coaching |

### Database Tables
| Table | Purpose |
|-------|---------|
| `invest_watchlists` / `invest_watchlist_items` | Watchlist management |
| `invest_manual_holdings` | Portfolio tracking |
| `invest_paper_trades` | Simulated trades |
| `invest_alerts` | Price alerts |
| `market_prices_cache` | Cached market data |
| `market_news_cache` | Cached macro news |

### Edge Functions
| Function | Purpose |
|----------|---------|
| `invest-market-pulse` | Market data fetch/generation |
| `invest-ai-mentor` | AI investment guidance |

---

## 6. Projects (`/projects` / `/projects/:id`)

**File:** `src/pages/ProjectsPage.tsx`, `src/pages/ProjectDetailPage.tsx`

### Project List Features
- Project cards with status (active/paused/completed), progress %, pin/unpin
- Blocked status indicator, AI Partner readiness badge
- Solution upgrade pathway, Import Wizard, Tender Wizard demo
- **Auto-complete**: When all tasks in a project are marked done, project auto-moves to "completed"

### Project Detail Tabs
| Tab | Function |
|-----|----------|
| Tasks | Board, table, timeline views (project-scoped) |
| Meetings | Project-scoped meetings |
| Notes | Project notes with AI extraction |
| Links | Bookmark management |
| Knowledge | Project-scoped knowledge base with file upload |
| AI Partner | Strategic AI co-founder (5 modes) |
| Accomplishments | Milestone and achievement tracking |

### Database Tables
| Table | Purpose |
|-------|---------|
| `projects` | Project metadata |
| `project_notes` | Project-scoped notes |
| `project_links` | Bookmarks |
| `project_milestones` | Milestone tracking |
| `project_accomplishments` | Achievement records |
| `project_documents` | Document management |
| `project_inbox_items` | Inbox items from captures |
| `project_partner_memory` | AI Partner memory per project |
| `project_partner_scores` | AI-generated project scores |

### AI Partner Modes
| Mode | Output |
|------|--------|
| Executive Brief | Situation analysis, risks, opportunities, actions |
| Sprint Plan (7-Day) | Prioritised weekly plan |
| Sell-Readiness Audit | 0-100 maturity scorecard (8 dimensions) |
| Funding Pathways | Verified funding types + cached programs with citations |
| Update Memory | AI-proposed memory updates with diff preview |

### Edge Functions
| Function | Purpose |
|----------|---------|
| `project-ai-partner` | Strategic AI partner (5 modes) |
| `project-ai-extract-actions` | Project note extraction |
| `project-ai-funding-search` | Verified funding source search |

---

## 7. Portfolio Partner (`/dashboard/partner`)

**File:** `src/pages/PortfolioPartnerPage.tsx`

### Features
- **Projects Table** — All projects with momentum (0-100), risk (low/med/high), sell-readiness (0-100)
- **This Week Focus** — AI recommends which project gets focus + why + 7-day plan
- **Portfolio Scan** — Top risks, quick wins, what to stop
- **Compare Projects** — Head-to-head AI comparison
- **Suggested Tasks** — AI-generated tasks with confirm-before-create

### Edge Function
| Function | Purpose |
|----------|---------|
| `portfolio-ai-partner` | Cross-project AI analysis |

---

## 8. Knowledge Base (`/knowledge`)

**File:** `src/pages/KnowledgeBasePage.tsx`

### Architecture
- **knowledge_docs** — Document metadata with project scoping
- **knowledge_chunks** — ~800-word chunks for vector retrieval
- **knowledge_files** — File upload metadata
- **kb_workspaces** — Provider routing (OpenAI for private, Vertex for government)

### Features
- Project-scoped retrieval ("knowledge cells")
- File upload: PDF, DOCX, TXT, MD, CSV, JSON, HTML
- Client-side text extraction (pdfjs-dist, mammoth)
- Auto-chunking pipeline with content hashing
- Smart project assignment with AI suggestion
- PII redaction on all queries
- Filters: This Project / All Projects / Global Only

### Edge Functions
| Function | Purpose |
|----------|---------|
| `kb-query` | Query KB with project filtering |
| `kb-ingest-upload` | Process text → chunks |
| `kb-openai-*` | OpenAI vector operations |
| `kb-vertex-*` | Vertex AI operations |
| `redact-sensitive` | PII scrubbing |

---

## 9. Solutions (Project → Upgrade to Solution)

**File:** `src/pages/ProjectDetailPage.tsx` (solution tabs)

### Tabs
| Tab | Function |
|-----|----------|
| Tender Brief | Opportunity details, client linking |
| Requirements | Compliance requirements checklist |
| Compliance | Compliance tracking matrix |
| Proposal | Proposal document management |
| Business Case | Lean canvas (problem, customer, offer, model, risks) |
| Financial Model | Startup costs, monthly costs, pricing, cashflow, assumptions |
| Funding Pack | Ask amount, use of funds, milestones, deadline |

### Components
- `BidReadinessCard` — Tender preparation scorecard
- `FundableReadinessCard` — Investment readiness assessment
- `MentorBriefCard` — AI strategic guidance
- `solution-mentor` edge function for AI advice

---

## 10. Settings (`/settings`)

**File:** `src/pages/SettingsPage.tsx`

### Sections
| Section | Function |
|---------|----------|
| Account | Email, account status |
| Profile Wizard | Role, schedule, AI personalisation |
| Gmail Integration | Connect/disconnect/sync Gmail accounts |
| AI Preferences | BYOK keys, usage, provider settings |
| Clients & Matters | Client/matter entity management |
| Executive Context | Key-value pairs for AI personalisation |
| Compliance | SA compliance reminders (SARS, VAT, PAYE, UIF, CIPC) |
| Export & Import | CSV/JSON per-entity + full workspace bundle |

---

## 11. Additional Pages

| Page | Route | File | Purpose |
|------|-------|------|---------|
| Travel | `/travel` | `TravelPage.tsx` | Trip management with itinerary cards |
| Shopping | `/shopping` | `ShoppingPage.tsx` | Shopping lists with categories |
| Weekly Report | `/weekly-report` | `WeeklyReportPage.tsx` | Executive weekly summary |
| Team | `/testers` | `TeamPage.tsx` | Beta tester management |
| Admin Health | `/admin/health` | `AdminHealthPage.tsx` | System health (admin only) |
| User Manual | `/manual` | `UserManualPage.tsx` | Interactive guide |
| Investor Report | `/investor-report` | `InvestorReportPage.tsx` | Investor-facing report |
| Onboarding Emails | `/onboarding-emails` | `OnboardingEmailsPage.tsx` | Email templates |

---

## 12. Cross-Page Integration Map

```
Dashboard ──reads──→ Tasks, Meetings, Reminders, Compliance
    │
Plan Hub ──CRUD──→ Tasks, Reminders, Meetings, Notes
    │                    ↑
Email ──creates──→ Tasks, Meetings, Reminders (via action keys T/M/S)
    │                    ↑
Finance ──receives──→ Finance entries (from Email Smart Extract)
    │
Projects ──scopes──→ Tasks, Meetings, Notes, Knowledge
    │
Portfolio Partner ──reads──→ All Projects + Partner Memory
    │
Knowledge Base ──feeds──→ AI Partner context per project
```

---

## 13. Navigation Structure

### Desktop Sidebar
1. Dashboard
2. Plan
3. Email
4. Finance
5. Projects
6. Travel
7. Shopping
8. Settings

### Mobile Bottom Nav
1. Home (Dashboard)
2. Plan
3. Email
4. Finance
5. More (hamburger → full nav)

### Legacy Redirects
| Old Route | New Route |
|-----------|-----------|
| `/tasks` | `/plan?tab=tasks` |
| `/reminders` | `/plan?tab=reminders` |
| `/meetings` | `/plan?tab=meetings` |
| `/calendar` | `/plan?tab=calendar` |

---

*© 2026 VantoOS. All rights reserved.*
