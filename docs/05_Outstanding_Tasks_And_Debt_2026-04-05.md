# VantoOS — Outstanding Tasks, Known Issues & Technical Debt

**Document:** 05 — Outstanding Tasks & Technical Debt  
**Date:** 5 April 2026  
**Version:** 1.0  

---

## 1. Outstanding Tasks

### 1.1 High Priority

| # | Task | Module | Status |
|---|------|--------|--------|
| 1 | Migrate all pages to TanStack React Query (replace raw useState/useEffect data fetching) | Global | In Progress — partially adopted |
| 2 | Add loading skeletons across all modules | UI | Not Started |
| 3 | Implement error boundaries at module level | Global | Not Started |
| 4 | Task/Reminder deduplication hardening — edge cases with rapid creation | Plan | Partially Done |
| 5 | Email body HTML rendering improvements (rich formatting, inline images) | Email | Not Started |
| 6 | PWA service worker — offline task/note creation queue | Global | Not Started |
| 7 | Push notifications for reminders and compliance deadlines | Plan / Compliance | Not Started |
| 8 | Multi-currency support with live exchange rates | Finance | Not Started |
| 9 | Team collaboration — shared projects, delegated tasks | Projects / Team | Not Started |
| 10 | Shopping ↔ Budget category linking | Shopping / Finance | Not Started |

### 1.2 Medium Priority

| # | Task | Module | Status |
|---|------|--------|--------|
| 11 | Email-to-itinerary import for Travel module | Travel | Not Started |
| 12 | Advanced email analytics and response time tracking | Email | Not Started |
| 13 | Document/contract management module | Projects | Not Started |
| 14 | Framer Motion integration for page transitions and micro-interactions | UI | Not Started |
| 15 | Knowledge Base — batch upload progress indicator | Knowledge Base | Not Started |
| 16 | Investor Report — dynamic generation (replace static HTML) | Reports | Not Started |
| 17 | Calendar tab — external calendar sync (Google Calendar, Outlook) | Plan | Not Started |
| 18 | Finance CSV export — include budget events and debt summary | Finance | Not Started |

### 1.3 Low Priority

| # | Task | Module | Status |
|---|------|--------|--------|
| 19 | Dark mode fine-tuning across all modules | UI | Partial |
| 20 | Keyboard shortcut cheat sheet — global (not just Email) | Global | Not Started |
| 21 | Chrome Extension — WhatsApp capture improvements | Extension | Partial |
| 22 | Admin Health — historical trend charts | Admin | Not Started |
| 23 | User onboarding wizard beyond email (full product tour) | Onboarding | Not Started |

---

## 2. Known Issues to Investigate

### 2.1 Critical

| # | Issue | Module | Details |
|---|-------|--------|---------|
| 1 | Task deduplication — rapid bulk creation can bypass dedupe_key checks | Plan | Race condition when multiple tasks created within same transaction window |
| 2 | Gmail OAuth token refresh — occasional 401 on long-idle sessions | Email | Token expiry edge case; may need proactive refresh before API calls |

### 2.2 High

| # | Issue | Module | Details |
|---|-------|--------|---------|
| 3 | Meeting detail drawer — agenda field doesn't persist on rapid open/close | Plan | State reset timing issue in MeetingDetailDrawer |
| 4 | Background AI Advisor — can fire duplicate requests if notes are edited during pending response | Plan | useMeetingAdvisor debounce/cooldown race condition |
| 5 | Finance entries — deleting an entry doesn't update the monthly summary card until page refresh | Finance | Missing React Query invalidation |
| 6 | Bank import — OFX files with non-standard date formats may fail silently | Finance | Parser needs broader date format handling |

### 2.3 Medium

| # | Issue | Module | Details |
|---|-------|--------|---------|
| 7 | Email sync — large inboxes (1000+ messages) may hit Supabase default row limit | Email | Need pagination or cursor-based sync |
| 8 | Project accomplishments — "Done" tasks don't always auto-populate accomplishments on first status change | Projects | Event timing — may need a database trigger |
| 9 | Voice dictation — Android Chrome intermittently drops `onresult` events during long sessions | Plan / Notes | Web Speech API browser inconsistency; see LIVE_TRANSCRIPTION_SPEC.md |
| 10 | Knowledge Base query — slow response on large corpora (>100 files) | Knowledge Base | Vector search latency; may need index optimisation |
| 11 | Invest Market Pulse — cached data can show stale prices if edge function times out | Invest | Fallback to cache doesn't indicate staleness to user |

### 2.4 Low

| # | Issue | Module | Details |
|---|-------|--------|---------|
| 12 | Sidebar navigation — active state flickers on route transitions | UI | React Router re-render timing |
| 13 | Chrome Extension — side panel occasionally shows blank on first open | Extension | Content script injection timing |
| 14 | Compliance widget — timezone offset can show wrong "days until due" | Compliance | Server vs client timezone mismatch |

---

## 3. Coming Soon Features

### 3.1 Next Release (v1.1 — Target: May 2026)

| Feature | Module | Description |
|---------|--------|-------------|
| **Offline Mode** | Global | Service worker with IndexedDB queue for tasks, notes, reminders — sync on reconnect |
| **Push Notifications** | Plan / Compliance | Browser push for upcoming reminders, compliance deadlines, meeting alerts |
| **Loading Skeletons** | UI | Shimmer placeholders across all data-loading states |
| **Error Boundaries** | Global | Module-level error boundaries with retry and fallback UI |

### 3.2 v1.2 — Target: June 2026

| Feature | Module | Description |
|---------|--------|-------------|
| **Multi-Currency** | Finance | ZAR, USD, EUR, GBP with live exchange rate integration |
| **Calendar Sync** | Plan | Google Calendar and Outlook bi-directional sync |
| **Document Management** | Projects | Upload, tag, version control for contracts and project documents |
| **Email Analytics** | Email | Response time tracking, volume trends, sender priority scoring |

### 3.3 v1.3 — Target: August 2026

| Feature | Module | Description |
|---------|--------|-------------|
| **Team Collaboration** | Projects / Team | Shared projects, task delegation, team activity feeds |
| **Advanced Reporting** | Dashboard | Custom report builder with export to PDF/CSV |
| **WhatsApp Integration** | Extension | Full two-way WhatsApp capture and action extraction |
| **Mobile Native Shell** | Global | Capacitor/TWA wrapper for App Store / Play Store distribution |

### 3.4 v2.0 — Target: Q4 2026

| Feature | Module | Description |
|---------|--------|-------------|
| **Voice Command Mode** | Global | Full voice navigation and action execution |
| **AI Workflow Automation** | AI | User-defined automation rules (if X then Y) powered by AI |
| **Client Portal** | Projects | Read-only project status portal for external stakeholders |
| **API / Webhooks** | Platform | Public API for third-party integrations |

---

## 4. Technical Debt

### 4.1 Architecture

| # | Debt Item | Severity | Details | Recommended Fix |
|---|-----------|----------|---------|-----------------|
| 1 | **Inconsistent data fetching** | High | Mix of useState/useEffect and TanStack React Query across pages | Standardise on React Query with custom hooks per entity |
| 2 | **No error boundaries** | High | Unhandled errors crash entire app | Add React ErrorBoundary at route and module level |
| 3 | **Large page components** | Medium | Some pages (PlanPage, FinancePage) are 500+ lines | Extract into feature-specific containers and hooks |
| 4 | **Service layer inconsistency** | Medium | Some services return raw Supabase responses, others transform data | Standardise return types with typed response wrappers |
| 5 | **No integration tests** | High | Only basic unit tests exist (p0-trust-moat.test.ts) | Add Vitest integration tests for critical flows |

### 4.2 Frontend

| # | Debt Item | Severity | Details | Recommended Fix |
|---|-----------|----------|---------|-----------------|
| 6 | **Dual toast systems** | Low | Both Sonner and shadcn Toast are installed and used | Consolidate to one (recommend Sonner) |
| 7 | **No Framer Motion** | Low | Listed as planned but never integrated | Add for page transitions and key micro-interactions |
| 8 | **Inline styles in index.html** | Low | PWA install banners use inline CSS/JS | Extract to dedicated PWA install component |
| 9 | **Hardcoded strings** | Medium | UI text is hardcoded throughout components | Consider i18n library if multi-language is planned |
| 10 | **No lazy loading for routes** | Medium | All pages imported eagerly in App.tsx | Add React.lazy() with Suspense for code splitting |

### 4.3 Backend / Edge Functions

| # | Debt Item | Severity | Details | Recommended Fix |
|---|-----------|----------|---------|-----------------|
| 11 | **No shared utility layer** | Medium | Edge functions duplicate common code (auth checks, CORS, error handling) | Create shared Deno modules imported across functions |
| 12 | **AI gateway error handling** | Medium | Some AI failures return generic 500 errors | Add structured error codes and retry guidance |
| 13 | **No rate limiting** | High | Edge functions have no per-user rate limiting | Add rate limiting via database counter or middleware |
| 14 | **Gmail token storage** | Medium | OAuth tokens stored as plain text in database columns | Encrypt at rest using Supabase vault or application-level encryption |
| 15 | **No database indexes audit** | Medium | Query performance not optimised for scale | Run EXPLAIN ANALYZE on key queries; add indexes for user_id + date patterns |

### 4.4 Security

| # | Debt Item | Severity | Details | Recommended Fix |
|---|-----------|----------|---------|-----------------|
| 16 | **No CSP headers** | Medium | Content Security Policy not configured | Add CSP meta tag or headers |
| 17 | **Extension token expiry** | Low | Extension tokens have long expiry (90 days) | Reduce to 30 days with silent refresh |
| 18 | **No audit log for admin actions** | Medium | Admin health page actions not logged | Add admin action logging to activity_log |

### 4.5 DevOps

| # | Debt Item | Severity | Details | Recommended Fix |
|---|-----------|----------|---------|-----------------|
| 19 | **No CI/CD pipeline tests** | High | Deployments have no automated test gate | Add Vitest run as pre-deploy check |
| 20 | **No database backup verification** | Medium | Backups exist but no restore testing | Schedule quarterly restore drills |
| 21 | **No performance monitoring** | Medium | No APM or performance tracking | Add web vitals reporting |
| 22 | **No staging environment** | High | Changes deploy directly to production | Set up staging branch with preview deployment |

---

## 5. Priority Matrix

```
                    URGENT              NOT URGENT
              ┌─────────────────┬─────────────────┐
   IMPORTANT  │ Task dedupe fix │ React Query     │
              │ Gmail token     │ migration       │
              │ refresh         │ Error boundaries │
              │ Rate limiting   │ Integration     │
              │                 │ tests           │
              ├─────────────────┼─────────────────┤
   NOT        │ Finance refresh │ Framer Motion   │
   IMPORTANT  │ bug             │ Dual toast      │
              │ Android voice   │ cleanup         │
              │ drops           │ i18n prep       │
              └─────────────────┴─────────────────┘
```

---

*Generated 5 April 2026 — VantoOS Development Team*  
*© 2026 VantoOS. All rights reserved.*
