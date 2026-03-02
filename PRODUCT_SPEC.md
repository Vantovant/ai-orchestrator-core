# VantoOS — Full Product & Technical Specification

**Version:** 1.0  
**Date:** 2 March 2026  
**Classification:** Confidential  

---

## 1. Executive Summary

**VantoOS** is an AI-powered executive command center designed for multinational leaders, government professionals, and high-performance executives. It functions as a "living secretary" — consolidating planning, communications, financial intelligence, project management, and investment monitoring into a single, keyboard-first interface.

The platform is built on React + TypeScript with a Supabase (Lovable Cloud) backend, leveraging multiple AI models for proactive daily briefings, strategic project advice, financial mentoring, and market analysis.

**Key Differentiator:** VantoOS is not a generic productivity tool. It is purpose-built for South African executives managing multiple income streams, compliance obligations, and project portfolios — with AI that behaves like a PhD-level strategic partner, not a chatbot.

---

## 2. Product Vision & Identity

| Attribute | Detail |
|-----------|--------|
| **Name** | VantoOS |
| **Tagline** | AI Executive Command Center |
| **Target User** | C-suite executives, government leaders, legal/accounting professionals, multinational operators |
| **Geography Focus** | South Africa (ZAR currency, POPIA compliance, SA tax structures) |
| **Core Promise** | Proactive AI assistance through daily briefings, pre-meeting prep, financial intelligence, and strategic project partnering |

---

## 3. Module Architecture

### 3.1 Dashboard — Executive Command Center
**Route:** `/`

The home screen provides an at-a-glance executive overview:

- **AI Daily Agenda** — AI-generated briefing with greeting, day overview, focus areas, time blocks, and "3 Commands for Today"
- **Stat Cards** — Active tasks, today's meetings, urgent reminders, total tasks
- **Top 5 Priorities** — AI-ranked (re-hydrated against live task data to prevent stale display)
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

Superhuman-inspired email client:

- **Multi-Account Support** — Account switcher with unified inbox mode
- **Keyboard Shortcuts** — j/k navigation, e=archive, s=snooze, t=create task, m=create meeting, ?=cheat sheet
- **Views** — Inbox, Snoozed, Waiting On
- **Command Bar** (⌘K) — Quick email actions
- **Action Creation** — One-key task/meeting/reminder creation from any email
- **Onboarding Tutorial** — First-time user walkthrough
- **Key Coach** — Contextual shortcut strip at bottom

**Current Status:** Mock data implementation. Gmail OAuth integration planned.

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
| **Import** | Bank statement import (CSV/OFX) with AI categorization |
| **AI Mentor** | Financial briefing with AI-generated insights |
| **Budget** | Recurring budget items with cadence, autopay tracking, event generation |
| **Invest** | Full investment sub-module (see 3.5) |

**Key Features:**
- ZAR currency formatting throughout
- Month selector for historical views
- CSV export for entries and debts
- Voice input for quick expense/income entry
- Finance Notes panel for monthly annotations
- Bank statement parsing with merchant rule engine
- AI-powered transaction categorization

**Edge Functions:**
- `finance-mentor` — AI financial briefing
- `finance-ai-route` — AI routing for finance queries
- `finance-snapshot-build` — Financial data snapshot
- `bank-import-parse` — Bank statement parser
- `bank-categorize-ai` — AI transaction categorizer
- `budget-generate-events` — Generates upcoming budget events

---

### 3.5 Invest & Trade — Executive Investment Dashboard
**Route:** `/finance` (Invest tab)

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

### 3.6 Projects — Personal Project Command Center
**Route:** `/projects`

Project management with AI strategic partnership:

**Project Card Features:**
- Name, description, status (active/paused/completed)
- Progress tracking (manual percentage)
- Pin/unpin for quick access
- Blocked status indicator
- AI Partner readiness badge

**Project Detail View (tabs):**
- **Tasks** — Project-scoped tasks
- **Meetings** — Project-scoped meetings
- **Notes** — Project-scoped daily notes with AI extraction
- **Links** — Bookmark management
- **AI Partner** — Strategic AI co-founder (see 3.7)

---

### 3.7 AI Senior Partner — Strategic AI Co-Founder
**Access:** Project Detail → AI Partner tab

PhD-level strategic partner providing:

| Mode | Output |
|------|--------|
| **Executive Brief** | Situation analysis, key risks, opportunities, recommended actions |
| **Sprint Plan (7-Day)** | Prioritized weekly plan with daily focus areas |
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

**Scoring:**
- `project_partner_scores` table updated after each audit/brief
- Momentum: recent notes, tasks completed, meetings (14-day window)
- Risk: overdue tasks, blocked status, low momentum
- Sell Readiness: from latest Sell-Readiness Audit

**Edge Function:** `portfolio-ai-partner` — Cross-project AI analysis

---

### 3.9 Travel
**Route:** `/travel`

Trip management with itinerary cards:
- Destination, dates, status (upcoming/in-progress/completed)
- Notes per trip
- Email-to-itinerary import planned

---

### 3.10 Shopping
**Route:** `/shopping`

Shopping list management:
- Categories (groceries, household, personal, other)
- Recurring items support
- Done/pending states
- Budget category linking planned

---

### 3.11 Weekly Report
**Route:** `/weekly-report`

Structured executive summary:
- Plan summary (tasks created/completed, meetings)
- Finance summary (income/expenses/net)
- Compliance status
- Client/matter overview
- One-click copy for WhatsApp/email sharing

---

### 3.12 Settings
**Route:** `/settings`

- **Account** — Email display
- **Executive Profile Wizard** — Guided setup for AI context
- **Clients & Matters** — CRUD for client/matter entities
- **Email Preferences** — Key Coach toggle
- **AI Preferences** — Provider fallback order (fastest vs quality)
- **Secretary Mode** — Toggle morning briefings, pre-meeting prompts, end-of-day reviews
- **Executive Context** — Key-value pairs for AI personalization (role, goals, focus, priorities)
- **Data Export** — CSV export for finance entries and debts

---

## 4. Technical Architecture

### 4.1 Frontend Stack

| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool |
| Tailwind CSS | Styling (HSL design tokens) |
| shadcn/ui | Component library |
| TanStack React Query | Server state management |
| React Router v6 | Client-side routing |
| Recharts | Data visualization |
| Framer Motion | Animations (planned) |
| date-fns | Date manipulation |
| Sonner | Toast notifications |
| Zod | Schema validation |
| cmdk | Command palette |

### 4.2 Backend Stack

| Technology | Purpose |
|------------|---------|
| Lovable Cloud (Supabase) | Database, Auth, Edge Functions, Storage |
| PostgreSQL | Relational database with RLS |
| Deno (Edge Functions) | Serverless backend logic |
| Lovable AI Gateway | Multi-model AI access (Gemini, GPT) |

### 4.3 AI Model Strategy

| Model | Use Case |
|-------|----------|
| `google/gemini-2.5-flash` | Default for speed-critical features (briefings, extraction) |
| `google/gemini-2.5-pro` | Complex reasoning (audits, strategic analysis) |
| `openai/gpt-5` | Fallback for high-accuracy needs |
| `openai/gpt-5-mini` | Cost-efficient fallback |

All AI calls go through the `ai-gateway` edge function with automatic model fallback and rate limiting.

---

## 5. Database Schema

### 5.1 Core Tables (32 tables)

| Table | Purpose | RLS |
|-------|---------|-----|
| `tasks` | Task management | ✅ User-scoped |
| `reminders` | Time-based reminders | ✅ User-scoped |
| `meetings` | Calendar events | ✅ User-scoped |
| `notes_daily` | Daily notes with structured mode | ✅ User-scoped |
| `projects` | Project entities | ✅ User-scoped |
| `project_notes` | Per-project notes | ✅ User-scoped |
| `project_links` | Project bookmarks | ✅ User-scoped |
| `project_partner_memory` | AI Partner persistent memory | ✅ User-scoped |
| `project_partner_scores` | Portfolio scoring cache | ✅ User-scoped |
| `funding_cache` | Verified funding programs | ✅ User-scoped |
| `finance_entries` | Income/expense records | ✅ User-scoped |
| `finance_budget_items` | Recurring budget items | ✅ User-scoped |
| `finance_budget_events` | Generated budget events | ✅ User-scoped |
| `finance_notes` | Monthly finance annotations | ✅ User-scoped |
| `finance_profiles` | User financial profile | ✅ User-scoped |
| `debts` | Debt tracking | ✅ User-scoped |
| `income_streams` | Multiple income sources | ✅ User-scoped |
| `opportunities` | Business opportunities | ✅ User-scoped |
| `bank_accounts` | Linked bank accounts | ✅ User-scoped |
| `bank_statement_imports` | Import records | ✅ User-scoped |
| `bank_transactions` | Parsed transactions | ✅ User-scoped |
| `merchant_rules` | Category mapping rules | ✅ User-scoped |
| `email_accounts` | Email account configs | ✅ User-scoped |
| `email_messages` | Email records | ✅ User-scoped |
| `email_oauth_tokens` | OAuth credentials | ✅ User-scoped |
| `invest_watchlists` | Investment watchlists | ✅ User-scoped |
| `invest_watchlist_items` | Watchlist symbols | ✅ User-scoped |
| `invest_manual_holdings` | Portfolio holdings | ✅ User-scoped |
| `invest_paper_trades` | Simulated trades | ✅ User-scoped |
| `invest_alerts` | Price alerts | ✅ User-scoped |
| `market_prices_cache` | Market data cache | ✅ Public read |
| `market_news_cache` | News cache | ✅ Public read |
| `clients` | Client/matter entities | ✅ User-scoped |
| `entity_client_links` | Client-entity associations | ✅ User-scoped |
| `entity_tags` | Tag associations | ✅ User-scoped |
| `tags` | Tag definitions | ✅ User-scoped |
| `compliance_reminders` | Regulatory compliance | ✅ User-scoped |
| `executive_context` | AI personalization context | ✅ User-scoped |
| `user_preferences` | App preferences | ✅ User-scoped |
| `notifications` | System notifications | ✅ User-scoped |
| `attachments` | File attachments | ✅ User-scoped |
| `assistant_runs` | AI run history | ✅ User-scoped |

### 5.2 Security Model

- **Row Level Security (RLS)** enabled on ALL user-data tables
- Every table scoped to `auth.uid() = user_id`
- POPIA-compliant: PII redacted before AI processing
- No secrets stored in application code or logs
- Soft-delete pattern (`deleted_at` column) across all tables

---

## 6. Edge Functions (17 functions)

| Function | Purpose |
|----------|---------|
| `ai-gateway` | Multi-model AI routing with fallback |
| `run-assistant` | Daily AI briefing generation |
| `snapshot-build` | Data snapshot builder |
| `plan-ai-secretary` | Secretary mode briefings |
| `plan-ai-extract-actions` | NLP action extraction from notes |
| `project-ai-partner` | Strategic AI partner (5 modes) |
| `project-ai-extract-actions` | Project note extraction |
| `project-ai-funding-search` | Verified funding search |
| `portfolio-ai-partner` | Cross-project AI analysis |
| `finance-mentor` | AI financial briefing |
| `finance-ai-route` | Finance AI routing |
| `finance-snapshot-build` | Financial snapshot |
| `bank-import-parse` | Bank statement parsing |
| `bank-categorize-ai` | AI transaction categorization |
| `budget-generate-events` | Budget event generation |
| `invest-market-pulse` | Market data refresh |
| `invest-ai-mentor` | Investment AI coaching |
| `admin-health` | System health monitoring |

---

## 7. Design System

### 7.1 Color Tokens (HSL)

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
| `/admin/health` | Admin Health |

**Legacy Redirects:** `/tasks`, `/reminders`, `/meetings`, `/calendar` → `/plan?tab=*`

---

## 9. Security & Compliance

| Area | Implementation |
|------|----------------|
| **Authentication** | Email/password via Supabase Auth |
| **Authorization** | RLS on every table |
| **Data Protection** | POPIA-compliant PII redaction |
| **AI Safety** | No PII in prompts, no hallucinated data |
| **Soft Delete** | All deletions are soft (recoverable) |
| **Export** | CSV export for user data portability |
| **Secrets** | Managed via Lovable Cloud secrets |

---

## 10. Roadmap

### Delivered ✅
- Executive Dashboard with AI briefings
- Plan Hub (Tasks, Reminders, Meetings, Notes, Calendar)
- Finance module with bank imports, AI mentor, budget
- Invest & Trade with market pulse, paper trading
- Projects with AI Senior Partner
- Partner Memory system
- Verified Funding Pathways
- Portfolio Partner command room
- Email client (mock)
- Weekly Executive Report
- Voice input & dictation
- Secretary Mode
- Compliance tracking

### Planned 🔄
- Gmail OAuth integration
- Email-to-itinerary import
- Shopping ↔ Budget linking
- Mobile PWA optimization
- Push notifications
- Multi-currency support
- Document/contract management
- Team collaboration features

---

*© 2026 VantoOS. All rights reserved.*
