# VantoOS AI Partner — Full Specification

**Document**: 06 — AI Partner Module  
**Date**: 2026-04-06  
**Version**: 1.0  

---

## 1. Overview

The **AI Partner** is VantoOS's flagship strategic intelligence module. It operates at two levels:

1. **Project-Level Partner** — embedded as a tab inside each project's detail page, providing deep single-project analysis.
2. **Portfolio-Level Partner** — a standalone page (`/portfolio-partner`) providing cross-project strategic oversight.

Both levels are powered by AI edge functions that build contextual snapshots from the user's live data and return structured, actionable intelligence.

---

## 2. Architecture

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND                                           │
│                                                     │
│  ┌─────────────────┐    ┌─────────────────────────┐ │
│  │ AIPartnerTab    │    │ PortfolioPartnerPage    │ │
│  │ (per project)   │    │ (cross-project)         │ │
│  └────────┬────────┘    └────────────┬────────────┘ │
│           │                          │              │
│  ┌────────▼────────┐    ┌────────────▼────────────┐ │
│  │ PartnerMemory   │    │ Project Scores Table    │ │
│  │ Panel           │    │ + Compare Selectors     │ │
│  └────────┬────────┘    └────────────┬────────────┘ │
│           │                          │              │
│  ┌────────▼────────┐    ┌────────────▼────────────┐ │
│  │ FundingPathways │    │                         │ │
│  │ Tab             │    │                         │ │
│  └─────────────────┘    └─────────────────────────┘ │
└──────────────────┬──────────────────┬───────────────┘
                   │                  │
          ┌────────▼────────┐  ┌──────▼──────────────┐
          │ project-ai-     │  │ portfolio-ai-       │
          │ partner (edge)  │  │ partner (edge)      │
          └────────┬────────┘  └──────┬──────────────┘
                   │                  │
          ┌────────▼──────────────────▼───────────────┐
          │ Lovable AI Gateway (gemini-3-flash)       │
          └───────────────────────────────────────────┘
```

### 2.2 Database Tables

| Table | Purpose |
|---|---|
| `project_partner_memory` | Stores strategic context per project: north star, customer, model, stage, constraints, weekly focus, AI summary, assumptions, risks |
| `project_partner_scores` | Stores computed scores: sell_readiness_score, risk_level, momentum_score, audit/brief timestamps |
| `funding_cache` | Cached funding opportunities linked to projects |

### 2.3 Edge Functions

| Function | Purpose |
|---|---|
| `project-ai-partner` | Single-project analysis (5 modes) |
| `portfolio-ai-partner` | Cross-project analysis (3 modes) |
| `project-ai-funding-search` | Web search for funding opportunities |

### 2.4 Frontend Components

| Component | File | Purpose |
|---|---|---|
| `AIPartnerTab` | `src/components/projects/AIPartnerTab.tsx` | Main project-level partner UI with mode buttons and result renderers |
| `PartnerMemoryPanel` | `src/components/projects/PartnerMemoryPanel.tsx` | Editable partner memory card with AI auto-update |
| `FundingPathwaysTab` | `src/components/projects/FundingPathwaysTab.tsx` | Funding search, AI analysis, and cached results |
| `PortfolioPartnerPage` | `src/pages/PortfolioPartnerPage.tsx` | Portfolio-wide command room |

### 2.5 Service Layer

| Service | File |
|---|---|
| `partnerMemoryService` | `src/services/partnerMemoryService.ts` |
| `partnerScoresService` | `src/services/partnerScoresService.ts` |
| `fundingCacheService` | `src/services/fundingCacheService.ts` |

---

## 3. Project-Level Partner (AIPartnerTab)

### 3.1 Partner Memory

The Partner Memory is a persistent strategic profile for each project. It gives the AI continuity across sessions.

**Fields:**

| Field | Type | Description |
|---|---|---|
| `north_star` | string | The ultimate goal of the project |
| `target_customer` | string | Who the project serves |
| `business_model` | string | How the project generates revenue |
| `stage` | enum | `idea` · `mvp` · `beta` · `live` · `scaling` |
| `primary_constraint` | string | Main blocker (time, money, tech, team) |
| `weekly_focus` | string | This week's priority |
| `key_assumptions` | string[] | Strategic assumptions to validate |
| `key_risks` | string[] | Known risks |
| `last_partner_summary` | string | AI-generated summary from last session |
| `auto_update_enabled` | boolean | Allow AI to update memory after briefs/sprints |

**User Interactions:**
- **Edit**: Manual dialog to set all fields
- **AI Update**: Calls `project-ai-partner` with `mode: "update_memory"`. AI proposes changes based on project data. User reviews a diff dialog and can **Apply** or **Dismiss**.
- **Auto-Update Toggle**: When enabled, the AI automatically updates `last_partner_summary` after executive briefs and sprint plans.

### 3.2 Analysis Modes

#### 3.2.1 Executive Brief (`executive_brief`)

**Purpose**: Quick strategic status report.

**AI Output (structured JSON):**

| Field | Description |
|---|---|
| `status_summary` | 2-3 sentence project status |
| `top_priorities[]` | Each with `priority`, `reason`, `action` |
| `biggest_risk` | Object with `risk`, `impact`, `mitigation` |
| `meeting_prep` | Prep notes if upcoming meetings exist |
| `suggested_tasks[]` | Tasks with `title`, `priority`, `due_in_days` |

**Side Effects:**
- Computes `momentum_score` from 14-day activity count (tasks + notes + meetings × 10, capped at 100)
- Computes `risk_level` from overdue tasks and blocked status
- Saves scores to `project_partner_scores`
- If `auto_update_enabled`, saves summary to memory

#### 3.2.2 Sprint Plan (`sprint_plan`)

**Purpose**: 7-day actionable execution plan.

**AI Output:**

| Field | Description |
|---|---|
| `focus_areas[]` | Key themes for the week |
| `daily_plan[]` | Each day has `day` label and `actions[]` |
| `postpone[]` | Items to defer with `item` and `reason` |
| `quick_wins[]` | Low-effort high-impact actions |
| `suggested_tasks[]` | Actionable tasks to add |

**Side Effects:**
- If `auto_update_enabled`, saves summary to memory

#### 3.2.3 Sell-Readiness Audit (`sell_readiness`)

**Purpose**: Comprehensive commercialization scorecard.

**Scoring Dimensions (0-100 each):**

| Dimension | What It Measures |
|---|---|
| `problem_clarity` | Is the problem well-defined? |
| `solution_maturity` | How developed is the solution? |
| `mvp_stability` | Is the MVP stable and usable? |
| `onboarding_ux` | Can users onboard easily? |
| `pricing_packaging` | Is pricing clear and competitive? |
| `compliance` | Privacy, legal, regulatory readiness |
| `support_docs` | Documentation quality |

**AI Output:**

| Field | Description |
|---|---|
| `overall_score` | Weighted average 0-100 |
| `scores{}` | Object with all 7 dimension scores |
| `missing_items[]` | Each with `area`, `issue`, `next_step` |
| `verdict` | `ready` · `almost_ready` · `not_ready` |
| `summary` | Narrative assessment |
| `suggested_tasks[]` | Remediation tasks |

**Side Effects:**
- Saves `sell_readiness_score` and `last_audit_at` to `project_partner_scores`

**UI Rendering:**
- Large score display with progress bar
- Color-coded verdict badge
- 7-dimension scorecard with individual progress bars
- Missing items list with destructive accent

#### 3.2.4 Memory Update (`update_memory`)

**Purpose**: AI proposes updates to Partner Memory based on current project data.

**AI Output**: Partial memory fields — only changed fields are returned.

**UI Flow**: Diff dialog shows proposed changes → user clicks **Apply** or **Dismiss**.

#### 3.2.5 Funding Pathways (`funding_pathways`)

**Purpose**: Funding readiness analysis and opportunity discovery.

**AI Output:**

| Field | Description |
|---|---|
| `recommended_types[]` | Funding types with `type`, `reason`, `next_step` |
| `readiness_checklist[]` | Items with `item`, `ready` (boolean), `action` |
| `cached_opportunities[]` | Verified funding from cache with full metadata |

**Sub-Components:**
- **Funding Search**: Calls `project-ai-funding-search` with region and funding type filters
- **AI Analysis**: Calls `project-ai-partner` with funding mode
- **Cached Results**: Displays previously discovered opportunities from `funding_cache`

**Funding Types Supported**: grant, accelerator, angel, vc, debt, corporate, government, competition

### 3.3 Suggested Tasks Engine

All analysis modes can return `suggested_tasks[]`. The UI renders these as actionable cards:

- Each task shows `title`, `priority` badge, and optional `due_in_days` badge
- **Add** button creates the task in the main tasks database via `taskService.create()`
- Source is tagged as `ai_partner`
- Applied tasks show a green checkmark
- Queries are invalidated to refresh task lists across the app

---

## 4. Portfolio-Level Partner (PortfolioPartnerPage)

### 4.1 Project Scores Dashboard

A table showing all active (non-completed) projects with:

| Column | Source |
|---|---|
| Project Name | `projects.name` |
| Status | `projects.status` (badge) |
| Momentum | `project_partner_scores.momentum_score` (progress bar + number) |
| Risk | `project_partner_scores.risk_level` (color-coded: green/amber/red) |
| Sell Ready | `project_partner_scores.sell_readiness_score` |
| Updated | `projects.updated_at` |

### 4.2 Portfolio Analysis Modes

#### 4.2.1 This Week Focus (`focus_plan_week`)

**Purpose**: Recommends which project deserves focus this week.

**AI Output:**

| Field | Description |
|---|---|
| `summary` | Overall portfolio assessment |
| `focus_project` | Recommended project name |
| `focus_reason` | Why this project needs attention |
| `recommendations[]` | Strategic recommendations |
| `suggested_tasks[]` | Cross-project tasks |

#### 4.2.2 Portfolio Scan (`portfolio_scan`)

**Purpose**: Comprehensive risk/opportunity scan across all projects.

**AI Output:**

| Field | Description |
|---|---|
| `summary` | Portfolio health summary |
| `risks[]` | Per-project risks with `project`, `risk`, `mitigation` |
| `quick_wins[]` | Easy wins across portfolio |
| `recommendations[]` | Strategic recommendations |
| `suggested_tasks[]` | Cross-project tasks |

#### 4.2.3 Compare Projects (`compare_projects`)

**Purpose**: Head-to-head comparison of two selected projects.

**UI**: Two project selectors + Compare button

**AI Output:**

| Field | Description |
|---|---|
| `summary` | Comparison narrative |
| `comparison` | Object with `recommendation` and `reasoning` |
| `recommendations[]` | What to do differently |
| `suggested_tasks[]` | Tasks arising from comparison |

### 4.3 Portfolio Snapshot Builder

The `portfolio-ai-partner` edge function builds a multi-project snapshot:

- Fetches up to 5 active projects (or specific IDs for compare)
- For each project, loads: memory, scores, top 3 open tasks, next meeting
- Concatenates into a text snapshot (max 3000 chars)
- Applies PII redaction (ID numbers, emails, phone numbers)

---

## 5. Data Flow & Snapshot Pipeline

### 5.1 Project Snapshot (project-ai-partner)

The snapshot is built from 6 parallel queries:

1. `project_partner_memory` — full memory record
2. `projects` — status, progress, blocked state, description, tags
3. `tasks` — top 10 open tasks by due date
4. `meetings` — next 3 upcoming meetings
5. `project_notes` — last 7 notes (300 char snippets)
6. `project_links` — up to 5 links

**Derived Fields:**
- `progress`: tasks-based (done/total × 100) or manual percentage
- `health`: `on_track` · `at_risk` (1 overdue) · `blocked` (2+ overdue or is_blocked)

**Snapshot Format**: Plain text with sections (PARTNER MEMORY, PROJECT, OPEN TASKS, UPCOMING MEETINGS, RECENT NOTES, LINKS). Capped at 3000 chars with `[TRUNCATED]` marker.

### 5.2 PII Redaction

Applied to all snapshots before AI processing:

| Pattern | Replacement |
|---|---|
| 13-digit numbers | `[ID_REDACTED]` |
| 10-12 digit numbers | `[ACCT_REDACTED]` |
| Email addresses | `[EMAIL_REDACTED]` |
| SA phone numbers (+27/0 prefix) | `[PHONE_REDACTED]` |
| `[CONFIDENTIAL]...[/CONFIDENTIAL]` blocks | `[REDACTED_BLOCK]` |

---

## 6. AI Configuration

| Parameter | Value |
|---|---|
| **Model** | `google/gemini-3-flash-preview` |
| **Gateway** | `https://ai.gateway.lovable.dev/v1/chat/completions` |
| **Auth** | `LOVABLE_API_KEY` (server-side) |
| **Tool Calling** | Forced via `tool_choice` for structured output |
| **System Prompt** | Role: "AI Senior Partner — PhD-level strategist with streetwise African business execution experience" |

---

## 7. Security & Access Control

- All edge functions require valid JWT via `Authorization` header
- All database queries are scoped to `user_id` via RLS
- Partner memory and scores use `user_id + project_id` composite uniqueness
- PII redaction runs before any data leaves the server to the AI gateway
- `[CONFIDENTIAL]` block markers allow users to protect sensitive notes content

---

## 8. Current Feature Matrix

| Feature | Project Level | Portfolio Level |
|---|---|---|
| Executive Brief | ✅ | — |
| Sprint Plan (7-day) | ✅ | — |
| Sell-Readiness Audit | ✅ | — |
| Funding Pathways | ✅ | — |
| Memory Management | ✅ | — |
| AI Memory Auto-Update | ✅ | — |
| Weekly Focus Plan | — | ✅ |
| Portfolio Scan | — | ✅ |
| Project Comparison | — | ✅ |
| Scores Dashboard | — | ✅ |
| Suggested Tasks → DB | ✅ | ✅ |
| PII Redaction | ✅ | ✅ |

---

## 9. Suggested Upgrades & Roadmap

### 9.1 High Priority

| Upgrade | Description | Effort |
|---|---|---|
| **Conversation History** | Store partner chat threads per project for context continuity beyond single sessions | Medium |
| **Scheduled Briefings** | Cron-triggered weekly executive brief sent via email or push notification | Medium |
| **Competitor Analysis Mode** | New mode using web search to analyze competitor landscape | High |
| **Revenue Forecasting** | Integrate finance data with partner analysis for revenue projections | Medium |
| **Risk Trend Tracking** | Store historical scores and show risk/momentum trends over time as charts | Low |

### 9.2 Medium Priority

| Upgrade | Description | Effort |
|---|---|---|
| **Team Partner** | Multi-user partner with shared memory for team projects | High |
| **Document Generation** | Auto-generate pitch decks, one-pagers, and investor memos from partner analysis | High |
| **Custom Scoring Dimensions** | Allow users to define their own sell-readiness criteria | Medium |
| **Milestone Intelligence** | AI suggests and tracks project milestones based on stage and goals | Medium |
| **Integration with Email** | Partner surfaces relevant emails and suggests follow-ups per project | Medium |
| **Voice Partner** | Dictate strategic thoughts, AI processes and updates memory | Medium |

### 9.3 Low Priority / Experimental

| Upgrade | Description | Effort |
|---|---|---|
| **Portfolio Optimizer** | AI recommends project kill/pivot/invest decisions based on resource constraints | High |
| **Stakeholder Reports** | Auto-generate investor/board reports from portfolio data | High |
| **Market Signal Integration** | Pull in market/industry signals from news APIs relevant to projects | High |
| **Partner Personality Modes** | Switch between advisor styles: cautious, aggressive, balanced | Low |
| **Mobile Widget** | PWA home screen widget showing today's partner recommendation | Medium |
| **WhatsApp Partner** | Query the AI Partner via WhatsApp messages | Medium |

### 9.4 Technical Improvements

| Improvement | Description |
|---|---|
| **Streaming Responses** | Use SSE to stream AI responses for perceived speed |
| **Response Caching** | Cache analysis results for 1 hour to reduce AI costs |
| **Offline Snapshots** | Pre-build snapshots and cache for offline PWA access |
| **Edge Function Decomposition** | Split the 376-line `project-ai-partner` into separate files per mode |
| **React Query Integration** | Replace manual `useState` loading with `useMutation` patterns consistently |
| **Error Retry with Backoff** | Auto-retry failed AI calls with exponential backoff |
| **Token Budget Display** | Show users how much AI capacity remains |

---

## 10. API Reference

### 10.1 project-ai-partner

**Endpoint**: `POST /functions/v1/project-ai-partner`

**Request Body:**
```json
{
  "project_id": "uuid",
  "mode": "executive_brief | sprint_plan | sell_readiness | update_memory | funding_pathways"
}
```

**Response:**
```json
{
  "mode": "executive_brief",
  "result": { /* mode-specific structured data */ },
  "snapshot_len": 2847,
  "was_truncated": false,
  "ai_status": "ok"
}
```

**Error Codes**: `401` Unauthorized · `400` Missing params · `429` Rate limited · `402` Credits exhausted · `500` AI unavailable

### 10.2 portfolio-ai-partner

**Endpoint**: `POST /functions/v1/portfolio-ai-partner`

**Request Body:**
```json
{
  "mode": "focus_plan_week | portfolio_scan | compare_projects",
  "project_ids": ["uuid", "uuid"]  // only for compare_projects
}
```

**Response:**
```json
{
  "mode": "portfolio_scan",
  "result": { /* mode-specific structured data */ },
  "snapshot_len": 2100
}
```

---

*End of AI Partner Specification*
