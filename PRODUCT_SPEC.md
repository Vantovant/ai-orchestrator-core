# VantoOS — Full Product & Technical Specification

**Version:** 2.0  
**Date:** 8 March 2026  
**Classification:** Confidential  
**Status:** Executive Beta — Live Production

---

## 1. Executive Summary

**VantoOS** is an AI-powered executive command centre designed for multinational leaders, government professionals, and high-performance executives. It functions as a "living secretary" — consolidating planning, communications, financial intelligence, project management, investment monitoring, knowledge management, and compliance tracking into a single, keyboard-first interface.

The platform is built on React + TypeScript with a Lovable Cloud backend, leveraging multiple AI models (Google Gemini and OpenAI GPT families) for proactive daily briefings, strategic project advice, financial mentoring, and market analysis.

**Key Differentiator:** VantoOS is not a generic productivity tool. It is purpose-built for South African executives managing multiple income streams, compliance obligations, and project portfolios — with AI that behaves like a PhD-level strategic partner, not a chatbot.

### Platform Statistics (as of March 2026)

| Metric | Count |
|--------|-------|
| Database tables | 45+ |
| Edge functions | 48 |
| UI pages | 20 |
| Service modules | 20+ |
| AI models supported | 10+ |
| Storage buckets | 4 |

---

## 2. Product Vision & Identity

| Attribute | Detail |
|-----------|--------|
| **Name** | VantoOS |
| **Tagline** | AI Executive Command Centre |
| **Target User** | C-suite executives, government leaders, legal/accounting professionals, multinational operators |
| **Geography Focus** | South Africa (ZAR currency, POPIA compliance, SA tax structures) |
| **Core Promise** | Proactive AI assistance through daily briefings, pre-meeting prep, financial intelligence, and strategic project partnering |
| **Data Sovereignty** | All files stored in Lovable Cloud (Supabase Storage). PII redacted before AI calls. No data leaves without user consent. |

---

## 3. Module Architecture

### 3.1 Dashboard — Executive Command Centre
**Route:** `/`

The home screen provides an at-a-glance executive overview:

- **AI Daily Agenda** — AI-generated briefing with greeting, day overview, focus areas, time blocks, and "3 Commands for Today"
- **Stat Cards** — Active tasks, today's meetings, urgent reminders, total tasks
- **Top 5 Priorities** — AI-ranked (rehydrated against live task data to prevent stale display)
- **Today's Meetings** — Quick access with click-through to detail drawers
- **Compliance Widget** — Overdue compliance items surfaced proactively
- **Urgent Reminders** — 48-hour lookahead

**AI Integration:** `run-assistant` edge function builds a snapshot of all user data and generates a structured briefing via Gemini/GPT models with automatic fallback.

---

### 3.2 Plan Hub — Unified Planning
**Route:** `/plan`

Six-tab planning workspace:

| Tab | Function |
|-----|----------|
| **Today** | Daily snapshot: priorities, meetings, urgent reminders, quick-add buttons |
| **Tasks** | Full CRUD with priority (critical/high/medium/low), due dates, project linking, client tagging, search & filter |
| **Reminders** | Time-based reminders with done/pending filter, project linking |
| **Meetings** | Meeting management with attendees (JSON), location, project linking, description |
| **Notes** | Daily structured notes with AI action extraction, dictation support, link management |
| **Calendar** | Day/Week/Month views with meetings, reminders, and task due dates overlaid |

**Key Features:**
- **Secretary Mode** — AI-powered executive assistant with morning briefings, pre-meeting prompts, end-of-day reviews
- **Command Bar** (⌘K) — Quick actions across all plan entities
- **Voice Input** — Speech-to-text with natural language command parsing ("Add task: review contract by Friday")
- **AI Action Extraction** — Extracts tasks, reminders, and meetings from free-form notes
- **Client/Matter Tagging** — Cross-entity tagging for legal/professional workflows

**Edge Functions:**
- `plan-ai-secretary` — Generates Secretary briefings
- `plan-ai-extract-actions` — NLP extraction from notes
- `snapshot-build` — Builds compressed data snapshots for AI context

---

### 3.3 Email — Keyboard-First Inbox
**Route:** `/email`

Superhuman-inspired email client with live Gmail integration:

- **Multi-Account Support** — Account switcher with unified inbox mode
- **Gmail OAuth** — Connect, sync, and disconnect Gmail accounts securely
- **Keyboard Shortcuts** — j/k navigation, e=archive, s=snooze, t=create task, m=create meeting, w=waiting-on, x=star, ?=cheat sheet
- **Views** — Inbox, Snoozed, Waiting On
- **Focus Mode** — Hide fyi/spam categories for zero-inbox workflow
- **Smart Extract** — AI-powered email classification, money direction detection, entity extraction, and routing
- **Command Bar** (⌘K) — Quick email actions
- **Action Creation** — One-key task/meeting/reminder creation from any email
- **Onboarding Tutorial** — 5-step first-time user walkthrough
- **Key Coach** — Contextual shortcut strip at bottom

**Smart Extract Capabilities:**
- Email type classification (expense, invoice, subscription, travel, task, meeting, fyi, other)
- Money direction detection (income/expense/transfer/bank fee)
- Account-aware intelligence (knows which bank account to reference)
- Entity extraction (merchant, amount, currency, date, reference)
- One-click routing to finance, tasks, meetings, reminders, or project notes
- PII redaction (SA ID numbers, phone numbers, bank accounts)

**Edge Functions:**
- `gmail-auth-start` / `gmail-auth-callback` — OAuth flow
- `gmail-sync` — Email synchronisation via Gmail History API
- `gmail-list` / `gmail-get` — Email listing and body fetching
- `gmail-disconnect` — Account disconnection
- `email-smart-extract` — AI-powered email analysis

---

### 3.4 Finance — SA Executive Financial Intelligence
**Route:** `/finance`

Comprehensive financial management tailored for South African executives:

| Tab | Function |
|-----|----------|
| **Overview** | Monthly income/expense/net cards, entry list with CRUD |
| **Debt Radar** | Active debts with principal, interest rates, repayment tracking |
| **Income Engine** | Multiple income streams (salary, legal practice, network marketing, side hustles) with targets |
| **Opportunities** | AI-surfaced opportunities with difficulty ratings |
| **Import** | Bank statement import (CSV/OFX) with AI categorisation |
| **AI Mentor** | Financial briefing with AI-generated role-aware insights |
| **Budget** | Recurring budget items with cadence, autopay tracking, event generation |
| **Invest** | Full investment sub-module (see 3.5) |

**Key Features:**
- ZAR currency formatting throughout
- Month selector for historical views
- CSV export for entries and debts
- Voice input for quick expense/income entry
- Finance Notes panel for monthly annotations
- Bank statement parsing with merchant rule engine
- AI-powered transaction categorisation
- Role-aware AI adaptation (government executive, attorney, accountant, entrepreneur, network marketer)

**Edge Functions:**
- `finance-mentor` — AI financial briefing (role-aware)
- `finance-ai-route` — AI routing for finance queries
- `finance-snapshot-build` — Financial data snapshot
- `bank-import-parse` — Bank statement parser
- `bank-categorize-ai` — AI transaction categoriser
- `budget-generate-events` — Generates upcoming budget events

---

### 3.5 Invest & Trade — Executive Investment Dashboard
**Route:** `/finance` (Invest tab) and `/invest`

Educational-first investment platform:

| Tab | Function |
|-----|----------|
| **Market Pulse** | Live prices (FX, crypto, commodities), risk mood indicator, macro headlines |
| **Learn** | 6 beginner-friendly lessons (currencies, inflation, stocks, crypto, commodities, risk) |
| **Watchlist** | Custom watchlists with real-time price tracking |
| **Portfolio** | Manual holdings tracker with P&L calculations |
| **Paper Trade** | Risk-free simulated trading |
| **Alerts** | Price-based alerts (above/below/change thresholds) |
| **AI Mentor** | AI investment coaching with market context |

**Edge Functions:**
- `invest-market-pulse` — Fetches/generates market data
- `invest-ai-mentor` — AI investment guidance

---

### 3.6 Projects — Personal Project Command Centre
**Route:** `/projects`

Project management with AI strategic partnership:

**Project Card Features:**
- Name, description, status (active/paused/completed)
- Progress tracking (manual percentage)
- Pin/unpin for quick access
- Blocked status indicator
- AI Partner readiness badge
- Solution upgrade pathway

**Project Detail View (tabs):**

| Tab | Function |
|-----|----------|
| **Tasks** | Project-scoped tasks with board, table, and timeline views |
| **Meetings** | Project-scoped meetings |
| **Notes** | Project-scoped daily notes with AI extraction |
| **Links** | Bookmark management |
| **Knowledge** | Project-scoped knowledge base with file upload (see 3.10) |
| **AI Partner** | Strategic AI co-founder (see 3.7) |
| **Accomplishments** | Milestone and achievement tracking |

**Additional Features:**
- Import Wizard for bulk task/note creation
- Tender Wizard demo for government procurement workflows
- Solution upgrade (tender compliance, funding pack, business case, financial model)

---

### 3.7 AI Senior Partner — Strategic AI Co-Founder
**Access:** Project Detail → AI Partner tab

PhD-level strategic partner providing:

| Mode | Output |
|------|--------|
| **Executive Brief** | Situation analysis, key risks, opportunities, recommended actions |
| **Sprint Plan (7-Day)** | Prioritised weekly plan with daily focus areas |
| **Sell-Readiness Audit** | 0-100 maturity scorecard across 8 dimensions |
| **Funding Pathways** | Verified funding types + readiness checklist + cached programs with citations |
| **Update Memory** | AI-proposed updates to Partner Memory with diff preview |

**Partner Memory (per project):**
- North Star, Target Customer, Business Model
- Stage (idea/mvp/beta/live/scaling)
- Primary Constraint, Weekly Focus
- Key Assumptions & Risks (JSON arrays)
- Last Partner Summary
- Auto-update toggle (default OFF)

**Non-Negotiable Rules:**
- Snapshot cap ≤ 3,000 chars
- POPIA redaction before AI calls
- Confirm-before-create for all actions
- No hallucinated funding — specific programs only from `funding_cache` with source URLs
- No secrets in logs

**Edge Functions:**
- `project-ai-partner` — Main AI partner with 5 modes
- `project-ai-extract-actions` — Note extraction for projects
- `project-ai-funding-search` — Verified funding source search

---

### 3.8 Portfolio Partner — Cross-Project Command Room
**Route:** `/dashboard/partner`

CEO-level portfolio oversight:

- **Projects Table** — All projects with scores: momentum (0-100), risk (low/med/high), sell readiness (0-100)
- **This Week Focus** — AI recommends which project gets focus + why + 7-day plan
- **Portfolio Scan** — Top risks, quick wins, what to stop
- **Compare Projects** — Head-to-head AI comparison with ROI and sequencing recommendations
- **Suggested Tasks** — AI-generated tasks with one-click creation (confirm-before-create)

**Edge Function:** `portfolio-ai-partner` — Cross-project AI analysis

---

### 3.9 Solutions — Tender & Funding Management
**Access:** Project Detail → upgrade to Solution

Advanced project workflows for government procurement and funding:

| Tab | Function |
|-----|----------|
| **Tender Brief** | Tender opportunity details, client linking |
| **Requirements** | Compliance requirements checklist |
| **Compliance** | Compliance tracking matrix |
| **Proposal** | Proposal document management |
| **Business Case** | Lean canvas (problem, customer, offer, model, risks) |
| **Financial Model** | Startup costs, monthly costs, pricing, cashflow, assumptions |
| **Funding Pack** | Ask amount, use of funds, milestones, deadline |

**Components:**
- Bid Readiness Card — scorecard for tender preparation
- Fundable Readiness Card — investment readiness assessment
- Mentor Brief Card — AI strategic guidance per solution
- Solution Mentor edge function for AI advice

---

### 3.10 Knowledge Base — Project-Scoped Intelligence
**Routes:** `/knowledge` (global), Project Detail → Knowledge tab

Dual-connector RAG architecture with project segmentation:

**Architecture:**
- **knowledge_docs** — Document metadata with project scoping
- **knowledge_chunks** — ~800-word chunks for vector-ready retrieval
- **knowledge_files** — File upload metadata linked to docs
- **kb_workspaces** — Provider routing (OpenAI for private, Vertex for government)

**Key Features:**
- **Project-Scoped Retrieval** — Documents partitioned by `project_id` ("knowledge cells")
- **File Upload** — Drag/drop PDF, DOCX, TXT, MD, CSV, JSON, HTML into Supabase Storage
- **Client-Side Text Extraction** — PDF via pdfjs-dist CDN, DOCX via mammoth
- **Auto-Chunking Pipeline** — ~800-word chunks with content hashing
- **Smart Project Assignment** — AI suggests which project a document belongs to (user confirms)
- **Filters** — This Project / All Projects / Global Only
- **PII Redaction** — All queries scrubbed before reaching AI providers
- **Data Sovereignty** — Government workspaces routed to Vertex AI only

**Storage:**
- Private bucket: `knowledge-uploads`
- Path: `${userId}/${projectId||'global'}/${docId}/${timestamp}_${filename}`
- User-scoped RLS on storage objects

**Edge Functions:**
- `kb-query` — Query knowledge base with project filtering
- `kb-ingest-upload` — Process uploaded file text into chunks
- `kb-openai-query` / `kb-openai-store` / `kb-openai-upload` — OpenAI vector operations
- `kb-vertex-query` / `kb-vertex-store` / `kb-vertex-upload` — Vertex AI operations
- `redact-sensitive` — PII scrubbing

---

### 3.11 Export & Import — Data Portability
**Route:** Settings → Export & Import

Idempotent data synchronisation for external workflows:

**Export:**
- Per-entity CSV/JSON export: Tasks, Meetings, Reminders, Notes, Knowledge Docs
- Full Workspace Bundle (ZIP of all JSON files)
- Exports include: id, external_id, dedupe_key, project_id, status, created_at, updated_at

**Import:**
- CSV + JSON import per entity
- Upsert logic prevents duplicates:
  - If `external_id` present: upsert on `(user_id, external_id)`
  - Else compute `dedupe_key` from `userId|title|date|projectId` and upsert on `(user_id, dedupe_key)`

---

### 3.12 Chrome Extension — Smart Capture
**Location:** `/chrome-extension/`

Manifest V3 extension with side panel:

| Feature | Description |
|---------|-------------|
| **Quick Capture** | Save URL/title/highlight to project inbox |
| **Smart Capture** | AI-powered page analysis → task checklist with PII redaction |
| **WhatsApp Smart Extract** | PhD-grade conversation analysis from WhatsApp Web |
| **Side Panel** | Capture, Projects, Tasks, Settings tabs |
| **Pairing** | 6-digit code exchange for secure authentication |
| **Domain Allowlist** | Configure which sites show the floating "V" button |

**Edge Functions:**
- `extension-pair` / `extension-exchange` — Authentication
- `extension-projects` / `extension-tasks` — Data access
- `extension-task-create` / `extension-reminder-create` / `extension-meeting-create` / `extension-finance-create` — Entity creation
- `smart-capture-web` / `capture-web` — Web page capture
- `smart-capture-whatsapp` / `capture-whatsapp` — WhatsApp capture
- `whatsapp-action-log` — WhatsApp action audit trail

---

### 3.13 Additional Modules

| Module | Route | Description |
|--------|-------|-------------|
| **Travel** | `/travel` | Trip management with itinerary cards, destinations, dates, status |
| **Shopping** | `/shopping` | Shopping lists with categories, recurring items, budget linking |
| **Weekly Report** | `/weekly-report` | Executive summary with plan, finance, compliance, client overview |
| **Team** | `/testers` | Beta tester management with AI credit tracking |
| **Admin Health** | `/admin/health` | System health monitoring (admin only) |
| **User Manual** | `/manual` | Interactive user guide with downloadable HTML manual |
| **Investor Report** | `/investor-report` | Standalone investor-facing product report |
| **Onboarding Emails** | `/onboarding-emails` | Email template management for user onboarding |
| **Settings** | `/settings` | Account, profile wizard, Gmail, AI keys, clients, export/import, executive context |

---

## 4. Technical Architecture

### 4.1 Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3 | UI framework |
| TypeScript | Strict | Type safety |
| Vite | 5.4 | Build tool |
| Tailwind CSS | HSL tokens | Design system |
| shadcn/ui | Latest | Component library (50+ components) |
| TanStack React Query | 5.83 | Server state management |
| React Router v6 | 6.30 | Client-side routing |
| Recharts | 2.15 | Data visualisation |
| date-fns | 3.6 | Date manipulation |
| Sonner + shadcn Toast | Dual | Notifications |
| cmdk | 1.1 | Command palette |
| Zod | 3.25 | Schema validation |
| mammoth | 1.8 | DOCX text extraction |
| pdfjs-dist | CDN | PDF text extraction |

### 4.2 Backend Stack

| Component | Technology |
|-----------|-----------|
| Database | PostgreSQL (Lovable Cloud) |
| Auth | Email/password via authentication system |
| Edge Functions | Deno (48 functions) |
| AI Gateway | Lovable AI + BYOK support |
| File Storage | 4 private buckets (statements, kb-gov, kb-private, knowledge-uploads) |
| Secrets | Lovable Cloud Secrets Manager |

### 4.3 AI Model Strategy

| Model | Use Case |
|-------|----------|
| `google/gemini-2.5-flash` | Default for speed-critical features (briefings, extraction) |
| `google/gemini-2.5-pro` | Complex reasoning (audits, strategic analysis) |
| `google/gemini-2.5-flash-lite` | Lightweight classification, summaries |
| `openai/gpt-5` | Fallback for high-accuracy needs |
| `openai/gpt-5-mini` | Cost-efficient fallback |

All AI calls go through the `ai-gateway` edge function with:
- Automatic model fallback
- Rate limiting
- BYOK key support
- Beta assist credit system
- PII redaction
- Call logging and truncation tracking

---

## 5. Database Schema

### 5.1 Core Tables (45+ tables)

**Planning:**
`tasks`, `reminders`, `meetings`, `notes_daily`

**Projects:**
`projects`, `project_notes`, `project_links`, `project_milestones`, `project_accomplishments`, `project_documents`, `project_inbox_items`, `project_partner_memory`, `project_partner_scores`

**Finance:**
`finance_entries`, `finance_budget_items`, `finance_budget_events`, `finance_notes`, `finance_profiles`, `debts`, `income_streams`

**Banking:**
`bank_accounts`, `bank_statement_imports`, `bank_transactions`

**Email:**
`email_accounts`, `email_messages`, `email_oauth_tokens`, `email_inbox_items`, `email_extracts`, `email_action_log`

**Invest:**
`invest_watchlists`, `invest_watchlist_items`, `invest_manual_holdings`, `invest_paper_trades`, `invest_alerts`

**Knowledge Base:**
`knowledge_docs`, `knowledge_chunks`, `knowledge_files`, `kb_workspaces`, `kb_files`, `kb_query_log`

**Solutions:**
`business_cases`, `financial_models`, `funding_cache`, `funding_packs`

**System:**
`beta_testers`, `invites`, `user_roles`, `activity_log`, `ai_call_log`, `assistant_runs`, `executive_context`, `attachments`, `clients`, `entity_client_links`, `entity_tags`, `tags`, `compliance_reminders`

**Extension:**
`extension_pairing_codes`, `extension_tokens`

### 5.2 Security Model

| Control | Implementation |
|---------|----------------|
| **Row Level Security** | Enabled on ALL user-data tables |
| **User Isolation** | `auth.uid() = user_id` on every table |
| **Admin Roles** | Separate `user_roles` table with `has_role()` security definer function |
| **Soft Delete** | `deleted_at` column across all tables |
| **PII Redaction** | POPIA-compliant scrubbing before AI calls |
| **Deduplication** | SHA-256 / hash-based dedupe keys |
| **Storage Isolation** | User-prefixed storage paths with RLS |
| **Secret Management** | Lovable Cloud Secrets (never in code) |

---

## 6. Edge Functions (48 functions)

### 6.1 AI & Core
| Function | Purpose |
|----------|---------|
| `ai-gateway` | Central AI router with BYOK, beta assist, provider fallback |
| `ai-status` | Returns current AI access status for user |
| `run-assistant` | Executive daily briefing generation |
| `snapshot-build` | Compressed data snapshot builder |
| `assistant-help` | Context-aware Q&A |
| `redact-sensitive` | POPIA-compliant PII scrubbing |
| `admin-health` | System health monitoring |

### 6.2 Plan & Secretary
| Function | Purpose |
|----------|---------|
| `plan-ai-secretary` | Secretary Mode briefings |
| `plan-ai-extract-actions` | NLP extraction from notes |

### 6.3 Email (Gmail)
| Function | Purpose |
|----------|---------|
| `gmail-auth-start` | Initiates Gmail OAuth flow |
| `gmail-auth-callback` | Handles OAuth callback |
| `gmail-sync` | Syncs emails from Gmail API |
| `gmail-list` / `gmail-get` | Lists/fetches emails |
| `gmail-disconnect` | Disconnects Gmail account |
| `email-smart-extract` | AI-powered email analysis |

### 6.4 Finance
| Function | Purpose |
|----------|---------|
| `finance-mentor` | AI financial briefing (role-aware) |
| `finance-ai-route` | Finance AI query routing |
| `finance-snapshot-build` | Financial snapshot |
| `bank-import-parse` | CSV/OFX bank statement parser |
| `bank-categorize-ai` | AI transaction categorisation |
| `budget-generate-events` | Budget event generation |

### 6.5 Projects & Solutions
| Function | Purpose |
|----------|---------|
| `project-ai-partner` | Strategic AI partner (5 modes) |
| `project-ai-extract-actions` | Project note extraction |
| `project-ai-funding-search` | Verified funding search |
| `portfolio-ai-partner` | Cross-project AI analysis |
| `solution-mentor` | Solution/tender AI guidance |

### 6.6 Invest
| Function | Purpose |
|----------|---------|
| `invest-market-pulse` | Market data fetch/generation |
| `invest-ai-mentor` | Investment AI coaching |

### 6.7 Knowledge Base
| Function | Purpose |
|----------|---------|
| `kb-query` | Query KB with project filtering |
| `kb-ingest-upload` | Process uploaded text → chunks |
| `kb-openai-query` / `kb-openai-store` / `kb-openai-upload` | OpenAI vector ops |
| `kb-vertex-query` / `kb-vertex-store` / `kb-vertex-upload` | Vertex AI ops |

### 6.8 Chrome Extension
| Function | Purpose |
|----------|---------|
| `extension-pair` / `extension-exchange` | Auth pairing |
| `extension-projects` / `extension-tasks` / `extension-domains` | Data access |
| `extension-task-create` / `extension-reminder-create` / `extension-meeting-create` / `extension-finance-create` | Entity creation |
| `smart-capture-web` / `capture-web` | Web capture |
| `smart-capture-whatsapp` / `capture-whatsapp` | WhatsApp capture |
| `whatsapp-action-log` | Audit trail |

### 6.9 System
| Function | Purpose |
|----------|---------|
| `invite-check` | Beta invite validation |
| `team-analytics` | Team performance analytics |

---

## 7. Design System

### 7.1 Colour Tokens (HSL)

| Token | Light | Dark |
|-------|-------|------|
| `--primary` | 221 83% 53% | 221 83% 53% |
| `--accent` | 262 83% 58% | 262 83% 58% |
| `--success` | 142 76% 36% | 142 76% 36% |
| `--warning` | 38 92% 50% | 38 92% 50% |
| `--destructive` | 0 84% 60% | 0 63% 31% |
| `--background` | 220 20% 97% | 222 47% 6% |
| `--foreground` | 222 47% 11% | 210 40% 98% |

### 7.2 Typography
- **Font:** Inter (system fallback: system-ui, -apple-system, sans-serif)
- **Border Radius:** 0.75rem (`--radius`)

### 7.3 Navigation
- **Desktop:** Fixed sidebar with 8 primary items + secondary section
- **Mobile:** Bottom nav (Home, Plan, Email, Finance, More) + hamburger for full nav

---

## 8. Route Map

| Route | Module |
|-------|--------|
| `/` | Dashboard |
| `/plan` | Plan Hub (with tab params) |
| `/email` | Email |
| `/finance` | Finance (with Invest sub-tab) |
| `/projects` | Projects |
| `/travel` | Travel |
| `/shopping` | Shopping |
| `/settings` | Settings |
| `/weekly-report` | Weekly Report |
| `/dashboard/partner` | Portfolio Partner |
| `/knowledge` | Knowledge Base (global) |
| `/investor-report` | Investor Report |
| `/testers` | Team / Beta Testers |
| `/manual` | User Manual |
| `/onboarding-emails` | Onboarding Email Templates |
| `/admin/health` | Admin Health |

**Legacy Redirects:** `/tasks`, `/reminders`, `/meetings`, `/calendar` → `/plan?tab=*`

---

## 9. Security & Compliance

| Area | Implementation |
|------|----------------|
| **Authentication** | Email/password via Lovable Cloud Auth |
| **Authorisation** | RLS on every table + role-based admin via `user_roles` |
| **Data Protection** | POPIA-compliant PII redaction on all AI interactions |
| **AI Safety** | No PII in prompts, no hallucinated data, evidence-grounded claims |
| **Soft Delete** | All deletions are recoverable |
| **Export** | Full data portability (CSV/JSON/ZIP) |
| **Storage Security** | Private buckets with user-scoped access policies |
| **Secrets** | Managed via Lovable Cloud (never in code) |
| **Deduplication** | SHA-256 and hash-based dedupe keys prevent duplicate imports |

---

## 10. Roadmap

### Delivered ✅
- Executive Dashboard with AI briefings
- Plan Hub (Tasks, Reminders, Meetings, Notes, Calendar)
- Secretary Mode with AI briefings
- Gmail OAuth integration (live)
- Email Smart Extract with money direction detection
- Finance module with bank imports, AI mentor, budget
- Invest & Trade with market pulse, paper trading, AI mentor
- Projects with AI Senior Partner (5 modes)
- Partner Memory system
- Verified Funding Pathways with cached sources
- Portfolio Partner command room
- Solutions (tender, business case, financial model, funding pack)
- Knowledge Base with project segmentation
- File upload with text extraction (PDF, DOCX, TXT, etc.)
- Auto-chunking pipeline for RAG retrieval
- Smart project assignment for knowledge documents
- Export/Import with idempotent upsert
- Chrome Extension (Smart Capture, WhatsApp Extract)
- Weekly Executive Report
- Voice input & dictation
- Compliance tracking with SA presets
- Client/matter tagging
- Activity logging

### Planned 🔄
- Email-to-itinerary import
- Shopping ↔ Budget linking
- Mobile PWA optimisation
- Push notifications
- Multi-currency support
- Team collaboration features
- Advanced email analytics
- Offline support with service worker

---

## 11. Documentation Suite

| Document | Purpose |
|----------|---------|
| `PRODUCT_SPEC.md` | Full product & technical specification (this file) |
| `USER_MANUAL.md` | Comprehensive end-user guide |
| `HANDOVER_REPORT.md` | Professional handover report |
| `TECHNICAL_BLUEPRINT.md` | Engineer-only execution blueprint |
| `EXECUTIVE_PLAYBOOK.md` | User onboarding & sovereignty guide |
| `FLAGSHIP_FEATURES_SPEC.md` | Email, WhatsApp, Web Smart Capture specs |
| `SA_EXECUTIVE_SPEC.md` | SA-specific executive requirements |
| `FINANCE_SPEC.md` | Finance module specification |
| `ROUTES.md` | Route map documentation |
| `PARITY.md` | Feature parity tracking |
| `AI_PROVIDERS.md` | AI provider documentation |

---

*© 2026 VantoOS. All rights reserved.*
