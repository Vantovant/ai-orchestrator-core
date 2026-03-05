# VantoOS — Professional Handover Report

**Project:** VantoOS AI Executive Command Center  
**Date:** 5 March 2026  
**Prepared by:** Development Team  
**Classification:** Confidential  
**Version:** 1.0  

---

## 1. Executive Summary

VantoOS is a production-ready AI-powered executive command center built for multinational leaders, government professionals, and high-performance executives operating primarily in South Africa. The platform consolidates planning, communications, financial intelligence, project management, investment monitoring, and compliance tracking into a single keyboard-first interface.

The system is fully deployed on **Lovable Cloud** (Supabase backend) with **46 serverless edge functions**, **40+ database tables** with Row Level Security, and a React/TypeScript frontend. AI capabilities are powered through a multi-model gateway supporting Google Gemini and OpenAI GPT families with automatic failover.

**Current Status:** Executive Beta — live with connected users, Gmail OAuth integrated, all core modules functional.

---

## 2. System Architecture

### 2.1 Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3 | UI framework |
| TypeScript | Strict mode | Type safety |
| Vite | Latest | Build & dev server |
| Tailwind CSS | With HSL tokens | Design system |
| shadcn/ui | Latest | Component library |
| React Router v6 | 6.30 | Client-side routing |
| TanStack React Query | 5.83 | Server state (planned wider adoption) |
| Recharts | 2.15 | Data visualisation |
| date-fns | 3.6 | Date manipulation |
| Sonner + shadcn Toast | Dual | Notifications |
| cmdk | 1.1 | Command palette |
| Zod | 3.25 | Schema validation |

### 2.2 Backend Stack

| Component | Technology |
|-----------|-----------|
| Database | PostgreSQL (Lovable Cloud) |
| Auth | Supabase Auth (email/password) |
| Edge Functions | Deno (46 functions deployed) |
| AI Gateway | Lovable AI + BYOK support |
| File Storage | Supabase Storage |
| Secrets | Lovable Cloud Secrets Manager |

### 2.3 Supplementary

| Component | Technology |
|-----------|-----------|
| Chrome Extension | Manifest V3 with side panel |
| Investor Report | Standalone HTML (public/VantoOS_Full_Product_Report_March2026.html) |

---

## 3. Module Inventory

### 3.1 Dashboard (`/`)
- AI-generated daily agenda via `run-assistant` edge function
- Stat cards: active tasks, meetings, reminders, total tasks
- Top 5 AI-ranked priorities (live data rehydration)
- Compliance widget, urgent reminders (48h lookahead)
- **Status:** ✅ Fully functional

### 3.2 Plan Hub (`/plan`)
- Six tabs: Today, Tasks, Reminders, Meetings, Notes, Calendar
- Secretary Mode with morning/pre-meeting/end-of-day AI briefings
- Command Bar (⌘K), voice input, AI action extraction from notes
- Client/matter tagging across all entities
- **Status:** ✅ Fully functional

### 3.3 Email (`/email`)
- Multi-account Gmail OAuth (connect, sync, disconnect)
- Unified inbox with per-account badges
- Account selector dropdown with Unified toggle
- Superhuman-style triage mode with auto-advance
- Focus filter (hides fyi/spam), unread-only toggle
- Keyboard shortcuts: J/K navigate, E archive, S snooze, W waiting, X star, U unread toggle, T task, M meeting
- Views: Inbox, Snoozed, Waiting On
- In-page sync with last-synced timestamps
- Key Coach contextual shortcut strip
- Onboarding tutorial for first-time users
- **Status:** ✅ Functional (Gmail OAuth live, triage mode implemented)

### 3.4 Finance (`/finance`)
- Overview: monthly income/expense/net, entry CRUD
- Debt Radar: principal, interest rates, repayment tracking
- Income Engine: multiple streams with targets
- Bank Import: CSV/OFX parsing with AI categorisation
- Budget: recurring items, cadence, autopay, event generation
- AI Mentor: financial briefings
- Finance Notes panel
- ZAR currency formatting, CSV export
- **Status:** ✅ Fully functional

### 3.5 Invest & Trade (`/finance` → Invest tab)
- Market Pulse: live FX, crypto, commodities, risk mood
- Learn: 6 beginner lessons
- Watchlists, Portfolio, Paper Trading, Alerts
- AI Investment Mentor
- **Status:** ✅ Fully functional

### 3.6 Projects (`/projects`, `/projects/:id`)
- Project cards with status, progress, pin/unpin, blocked indicator
- Detail view: Tasks, Meetings, Notes, Links, AI Partner
- Solution upgrade pathway (tender, funding pack, business case)
- **Status:** ✅ Fully functional

### 3.7 AI Senior Partner (Project Detail → AI Partner tab)
- 5 modes: Executive Brief, Sprint Plan, Sell-Readiness Audit, Funding Pathways, Update Memory
- Partner Memory with north star, target customer, business model, stage, constraints
- Verified funding search with cached programs and source URLs
- **Status:** ✅ Fully functional

### 3.8 Portfolio Partner (`/dashboard/partner`)
- Cross-project command room with momentum/risk/sell-readiness scores
- This Week Focus, Portfolio Scan, Compare Projects, Suggested Tasks
- **Status:** ✅ Fully functional

### 3.9 Additional Modules
| Module | Route | Status |
|--------|-------|--------|
| Travel | `/travel` | ✅ Basic |
| Shopping | `/shopping` | ✅ Basic |
| Weekly Report | `/weekly-report` | ✅ Functional |
| Knowledge Base | `/knowledge-base` | ✅ Functional |
| Team | `/team` | ✅ Basic |
| Settings | `/settings` | ✅ Functional |
| Admin Health | `/admin/health` | ✅ Admin only |
| User Manual | `/manual` | ✅ Functional |

---

## 4. Edge Functions (46 Functions)

### 4.1 AI & Core
| Function | Purpose |
|----------|---------|
| `ai-gateway` | Central AI router with BYOK, beta assist, provider fallback |
| `ai-status` | Returns current AI access status for user |
| `run-assistant` | Executive daily briefing generation |
| `snapshot-build` | Compressed data snapshot builder for AI context |
| `assistant-help` | Context-aware Q&A (extension) |
| `redact-sensitive` | POPIA-compliant PII scrubbing |
| `admin-health` | System health monitoring dashboard |

### 4.2 Plan & Secretary
| Function | Purpose |
|----------|---------|
| `plan-ai-secretary` | Secretary Mode briefings |
| `plan-ai-extract-actions` | NLP extraction from notes → tasks/reminders/meetings |

### 4.3 Email (Gmail)
| Function | Purpose |
|----------|---------|
| `gmail-auth-start` | Initiates Gmail OAuth flow |
| `gmail-auth-callback` | Handles OAuth callback |
| `gmail-sync` | Syncs emails from Gmail API |
| `gmail-list` | Lists emails from Gmail |
| `gmail-get` | Fetches single email body |
| `gmail-disconnect` | Disconnects Gmail account |

### 4.4 Finance
| Function | Purpose |
|----------|---------|
| `finance-mentor` | AI financial briefing |
| `finance-ai-route` | Finance AI query routing |
| `finance-snapshot-build` | Financial data snapshot |
| `bank-import-parse` | CSV/OFX bank statement parser |
| `bank-categorize-ai` | AI transaction categorisation |
| `budget-generate-events` | Generates upcoming budget events |

### 4.5 Projects & Solutions
| Function | Purpose |
|----------|---------|
| `project-ai-partner` | Strategic AI partner (5 modes) |
| `project-ai-extract-actions` | Project note extraction |
| `project-ai-funding-search` | Verified funding source search |
| `portfolio-ai-partner` | Cross-project AI analysis |
| `solution-mentor` | Solution/tender AI guidance |

### 4.6 Invest
| Function | Purpose |
|----------|---------|
| `invest-market-pulse` | Market data fetch/generation |
| `invest-ai-mentor` | Investment AI coaching |

### 4.7 Knowledge Base
| Function | Purpose |
|----------|---------|
| `kb-query` | Query knowledge base |
| `kb-openai-query` | OpenAI vector search |
| `kb-openai-store` | OpenAI vector store management |
| `kb-openai-upload` | File upload to OpenAI vectors |
| `kb-vertex-query` | Vertex AI corpus search |
| `kb-vertex-store` | Vertex AI corpus management |
| `kb-vertex-upload` | File upload to Vertex AI |

### 4.8 Chrome Extension
| Function | Purpose |
|----------|---------|
| `extension-pair` | Pairing code generation |
| `extension-exchange` | Token exchange from pairing code |
| `extension-projects` | List user projects |
| `extension-tasks` | List user tasks |
| `extension-domains` | CRUD allowed domains |
| `extension-task-create` | Task creation with SHA-256 dedupe |
| `capture-web` | Quick web capture |
| `smart-capture-web` | AI-powered web capture with PII redaction |

### 4.9 Other
| Function | Purpose |
|----------|---------|
| `invite-check` | Beta invite validation |
| `team-analytics` | Team performance analytics |

---

## 5. Database Schema

### 5.1 Table Count
**40+ tables** with Row Level Security enabled on all user-data tables. Every table is scoped via `auth.uid() = user_id`.

### 5.2 Key Tables by Module

**Planning:** `tasks`, `reminders`, `meetings`, `notes_daily`  
**Projects:** `projects`, `project_notes`, `project_links`, `project_milestones`, `project_accomplishments`, `project_documents`, `project_inbox_items`, `project_partner_memory` (implicit), `project_partner_scores` (implicit)  
**Finance:** `finance_entries`, `finance_budget_items`, `finance_budget_events`, `finance_notes`, `finance_profiles`, `debts`, `income_streams`, `opportunities`  
**Banking:** `bank_accounts`, `bank_statement_imports`, `bank_transactions`, `merchant_rules`  
**Email:** `email_accounts`, `email_messages`, `email_oauth_tokens`, `email_inbox_items`  
**Invest:** `invest_watchlists`, `invest_watchlist_items`, `invest_manual_holdings`, `invest_paper_trades`, `invest_alerts`, `market_prices_cache`, `market_news_cache`  
**Knowledge Base:** `kb_workspaces`, `kb_files`, `kb_query_log`  
**System:** `beta_testers`, `invites`, `notifications`, `activity_log`, `ai_call_log`, `assistant_runs`, `executive_context`, `attachments`, `clients`, `entity_client_links`, `entity_tags`, `compliance_reminders`  
**Extension:** `extension_pairing_codes`, `extension_tokens`  
**Solutions:** `business_cases`, `financial_models`, `funding_cache`, `funding_packs`

### 5.3 Security Model
- **RLS** on all user-data tables (`auth.uid() = user_id`)
- **Soft delete** pattern (`deleted_at` column) across all tables
- **POPIA compliance**: PII redacted before any AI processing
- **No secrets** in application code or logs
- **Deduplication**: SHA-256 based dedupe keys for tasks and source contexts

---

## 6. AI Architecture

### 6.1 Provider Routing
```
Request → ai-gateway
  ├── GOV workspace → Vertex Bridge ONLY
  ├── BYOK connected → User's own keys (OpenAI ↔ Gemini failover)
  ├── Beta Assist Mode → Lovable AI (managed, counter-decremented)
  └── No keys, no assist → HARD BLOCK
```

### 6.2 Supported Models
| Model | Use Case |
|-------|----------|
| `google/gemini-2.5-flash` | Speed-critical (briefings, extraction) |
| `google/gemini-2.5-pro` | Complex reasoning (audits, strategy) |
| `openai/gpt-5` | High-accuracy fallback |
| `openai/gpt-5-mini` | Cost-efficient fallback |

### 6.3 Safety Controls
- Snapshot cap: 3,000 chars (executive), 8,000 chars (smart capture)
- PII redaction before every AI call (SA ID numbers, emails, phones)
- Truncation logged in `ai_call_log`
- Verification badges on ungrounded outputs
- Confirm-before-create for all AI-generated actions
- No hallucinated funding — verified programs only with source URLs

---

## 7. Chrome Extension

**Manifest V3** extension with:
- Content script: floating "V" FAB on allowed domains
- Side panel: Capture, Projects, Tasks, Settings tabs
- Smart Capture: AI-powered page analysis → task checklist
- Quick Capture: URL/title/highlight save
- Pairing: 6-digit code exchange for authentication
- Domain allowlist management

**Location:** `/chrome-extension/`

---

## 8. Authentication & Access Control

| Layer | Implementation |
|-------|----------------|
| User Auth | Email/password via Supabase Auth |
| Row Security | RLS on every table |
| AI Access | BYOK keys or Beta Assist (counter-based) |
| Extension | Token-based auth via pairing codes |
| Beta Gate | `beta_testers` table with `is_active` flag |
| Invite System | Token-based invites with cohort tagging |

---

## 9. File Structure Overview

```
src/
├── ai/                    # AI orchestration & services
├── components/
│   ├── ai/                # AI status banners, verification badges
│   ├── clients/           # Client/matter tagging
│   ├── compliance/        # Compliance widgets
│   ├── email/             # Email UI components (7 files)
│   ├── finance/           # Finance UI components
│   ├── guide/             # Page guide system
│   ├── plan/              # Plan Hub components (10 files)
│   ├── projects/          # Project components (10 files)
│   ├── settings/          # Settings components
│   ├── solutions/         # Solution/tender components (9 files)
│   ├── ui/                # shadcn/ui components (50+ files)
│   └── voice/             # Voice input components
├── hooks/                 # Custom hooks (auth, mobile, dictation, etc.)
├── integrations/supabase/ # Auto-generated client & types
├── lib/                   # Utilities, voice parser
├── pages/                 # 20 page components
└── services/              # 18 service modules (data layer)

supabase/
├── config.toml            # Supabase configuration
└── functions/             # 46 edge functions

chrome-extension/          # Chrome Extension (Manifest V3)
```

---

## 10. Environment & Secrets

### 10.1 Environment Variables (auto-managed)
- `VITE_SUPABASE_URL` — Backend URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Anon key
- `VITE_SUPABASE_PROJECT_ID` — Project ID

### 10.2 Required Secrets (Lovable Cloud)
| Secret | Used By |
|--------|---------|
| `GOOGLE_CLIENT_ID` | Gmail OAuth |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth |
| `GMAIL_REDIRECT_URI` | Gmail OAuth callback |
| Various AI keys (optional) | BYOK AI access |

---

## 11. Deployment

| Item | Detail |
|------|--------|
| **Platform** | Lovable Cloud |
| **Preview URL** | `https://id-preview--4b19e05a-df85-4973-8c17-57c703b2d98c.lovable.app` |
| **Production URL** | `https://vantoos-ai-core.lovable.app` |
| **Edge Functions** | Auto-deployed on push |
| **Database Migrations** | Managed via Lovable Cloud migration tool |
| **CI/CD** | Lovable's built-in deployment pipeline |

---

## 12. Known Limitations & Technical Debt

1. **TanStack React Query** — Not yet universally adopted; some pages use direct `useState` + `useEffect` patterns for data fetching
2. **Framer Motion** — Listed as planned but not yet integrated for animations
3. **Mobile PWA** — Basic responsive design in place; full PWA optimisation pending
4. **Push Notifications** — Not yet implemented
5. **Multi-currency** — System defaults to ZAR; multi-currency support planned
6. **Email body rendering** — Full HTML body rendering is basic; rich email display could be improved
7. **Offline support** — No service worker or offline caching

---

## 13. Recommended Next Steps

### Immediate (Week 1-2)
1. Complete TanStack React Query migration for consistent server state management
2. Add loading skeletons across all modules for perceived performance
3. Implement error boundaries at module level

### Short-term (Month 1)
4. Mobile PWA with service worker for offline task/note creation
5. Push notifications for reminders and compliance deadlines
6. Document/contract management module
7. Email-to-itinerary import for Travel module

### Medium-term (Month 2-3)
8. Multi-currency support with exchange rate integration
9. Team collaboration features (shared projects, delegated tasks)
10. Shopping ↔ Budget category linking
11. Advanced email analytics and response time tracking

---

## 14. Documentation Suite

| Document | Purpose | Location |
|----------|---------|----------|
| `PRODUCT_SPEC.md` | Full product & technical specification | Project root |
| `TECHNICAL_BLUEPRINT.md` | Engineer-only execution blueprint | Project root |
| `EXECUTIVE_PLAYBOOK.md` | User onboarding & sovereignty guide | Project root |
| `SA_EXECUTIVE_SPEC.md` | SA-specific executive requirements | Project root |
| `FINANCE_SPEC.md` | Finance module specification | Project root |
| `ROUTES.md` | Route map documentation | Project root |
| `PARITY.md` | Feature parity tracking | Project root |
| `AI_PROVIDERS.md` | AI provider documentation | Project root |
| `README.md` | Project overview | Project root |
| Investor Report | Standalone HTML report | `public/VantoOS_Full_Product_Report_March2026.html` |

---

## 15. Handover Checklist

- [ ] Access to Lovable Cloud project granted to receiving team
- [ ] All secrets documented and transferred securely
- [ ] Google Cloud Console OAuth credentials transferred
- [ ] Chrome Extension developer account access transferred
- [ ] Domain/DNS configuration documented (if custom domain)
- [ ] Beta tester list and invite tokens reviewed
- [ ] AI call usage and billing reviewed
- [ ] Database backup verified

---

*This report was generated on 5 March 2026. For questions, refer to the documentation suite listed in Section 14 or contact the development team.*

*© 2026 VantoOS. All rights reserved.*
