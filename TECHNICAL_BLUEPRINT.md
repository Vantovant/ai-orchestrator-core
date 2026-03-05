# VantoOS — Technical Execution Blueprint (Engineer-Only)

## Overview

This document covers the complete technical architecture for VantoOS Executive Beta, including edge functions, database schema, deduplication logic, provider routing, and acceptance test procedures.

---

## 1. Edge Functions Inventory

| Function | Auth | Purpose |
|---|---|---|
| `ai-gateway` | Service key / Bearer | Central AI router with BYOK enforcement, GOV vertex routing, failover |
| `smart-capture-web` | x-extension-token / Bearer | AI-powered web capture with PII redaction, snapshot truncation |
| `assistant-help` | x-extension-token / Bearer | Context-aware Q&A for extension side panel |
| `capture-web` | x-extension-token / Bearer | Quick capture (URL/title/highlight) |
| `extension-task-create` | x-extension-token / Bearer | Task creation with SHA-256 dedupe |
| `extension-pair` | None | Pairing code exchange |
| `extension-exchange` | None | Token exchange from pairing code |
| `extension-projects` | x-extension-token | List user projects |
| `extension-tasks` | x-extension-token | List user tasks (GET only) |
| `extension-domains` | x-extension-token | CRUD allowed domains |
| `snapshot-build` | Service key | Build executive snapshot for AI |
| `run-assistant` | Service key | Run executive assistant |
| `finance-mentor` | Service key | Finance AI mentor |
| `redact-sensitive` | Service key | PII scrubbing |

---

## 2. Database Schema (Key Tables)

### `beta_testers`
```sql
CREATE TABLE public.beta_testers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  cohort_tag text NOT NULL DEFAULT 'beta20',
  is_active boolean NOT NULL DEFAULT true,
  assisted_ai_remaining integer NOT NULL DEFAULT 10,
  assisted_ai_used integer NOT NULL DEFAULT 0,
  assisted_ai_expires_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**RLS:** Users read/update own record. Admins manage all (via `has_role()`).

### `tasks` — Dedupe Index
```sql
CREATE UNIQUE INDEX idx_tasks_dedupe_key_unique
  ON public.tasks (user_id, project_id, dedupe_key)
  WHERE deleted_at IS NULL;
```

### `user_ai_keys`
Stores encrypted BYOK keys. `use_own_keys` boolean gates AI access.

### `ai_call_log`
Audit trail for every AI call: provider, mode (byok/assisted/blocked), duration, error codes.

---

## 3. Provider Routing Architecture

```
Request → ai-gateway
  ├── GOV workspace → vertex_bridge ONLY (no public API)
  ├── BYOK connected → user key providers (OpenAI → Gemini or vice versa)
  ├── Beta Assist Mode → Lovable AI (if beta tester + remaining > 0)
  └── No keys, no assist → HARD BLOCK (ai_status: "blocked")
```

### Failover Logic
1. Primary provider attempt (30s timeout)
2. If fails → try secondary provider from user's key set
3. If all fail → return `ai_status: "error"` with graceful message
4. Smart Capture graceful degradation: save Quick Capture data even if AI fails

### Beta Assist Mode
- Only for users in `beta_testers` with `is_active=true` and `assisted_ai_remaining > 0`
- Uses Lovable AI gateway (managed key) — NOT user's key
- Decrements counter after successful response
- Logged as `mode='assisted'` in `ai_call_log`
- NEVER available in GOV/NDA workspaces

---

## 4. Deduplication Logic

### Source Context Dedupe
```
dedupe_key = SHA-256(user_id | project_id | url | normalized_selected_text)[0:24]
```

### Task Dedupe
```
dedupe_key = SHA-256(user_id | project_id | normalized_title | source_context_id | source)[0:24]
```
Unique constraint: `(user_id, project_id, dedupe_key) WHERE deleted_at IS NULL`

Behavior: Insert on new key, update `last_touched_at` on conflict → return `action: "created" | "merged"`.

---

## 5. PII Redaction

Pre-AI redaction patterns (SA-focused):
- SA ID numbers: `\b\d{13}\b`
- Emails: standard email regex
- Phone (intl): `\+27\s?\d[\d\s-]{7,12}`
- Phone (local): `\b0[1-9]\d[\d\s-]{7,10}\b`

Redaction happens BEFORE any AI call. UI shows toast: "🔒 Sensitive PII scrubbed prior to AI processing."

---

## 6. Token Discipline

- Executive snapshots: 3,000 char hard cap
- Smart Capture snapshots: 8,000 char cap → progressive trimming (text blocks → tables → headings)
- Truncation logged: `was_truncated` flag in `ai_call_log`

---

## 7. Chrome Extension Architecture

### Content Script (`content-script.js`)
- Injected ONLY on allowed domains (background checks storage)
- Floating "V" button (FAB) → sends `OPEN_SIDE_PANEL` message
- If not paired, shows tooltip instead

### Background (`background.js`)
- Handles `OPEN_SIDE_PANEL` → `chrome.sidePanel.open()`
- Handles `CAPTURE_TAB` (quick) and `SMART_CAPTURE_TAB` (AI)
- Monitors tab updates to inject/remove FAB

### Side Panel (`sidepanel.js`)
- Tabs: Capture | Projects | Tasks | Settings
- Smart Capture → task checklist → Apply Selected → receipt
- Help "?" modal with Ask Assistant

---

## 8. Acceptance Test Matrix

| # | Test | Expected | Verify |
|---|---|---|---|
| 1 | No key, not beta | BYOK gate UI, no AI calls | `ai_call_log` shows `blocked_missing_byok` |
| 2 | No key, beta tester (remaining=10) | Assisted mode runs, remaining→9 | `ai_call_log` shows `mode=assisted` |
| 3 | No key, beta (remaining=0) | Hard gate, no managed calls | Same as test 1 |
| 4 | Non-beta, no key | BYOK gate immediately | No `assisted` entries |
| 5 | OpenAI key works | `provider=openai` | Check `ai_call_log` |
| 6 | OpenAI fails + Gemini exists | `provider=gemini` | Check failover in log |
| 7 | All keys fail | Quick Capture saved, AI skipped | Toast shown, `source_context` created |
| 8 | GOV workspace | `provider=vertex_bridge` only | No OpenAI/Gemini calls logged |
| 9 | GOV + beta assist | Blocked (no assisted in GOV) | BYOK/vertex required |
| 10 | PII detected | Redaction toast shown | `redaction_toast: true` in response |
| 11 | Ungrounded output | Needs verification badge | `needs_verification: true` |
| 12 | Apply tasks (first time) | Tasks created | `action: "created"` |
| 13 | Apply tasks (duplicate) | Tasks merged | `action: "merged"` |
| 14 | Allowed domain | FAB appears, opens side panel | Visual check |
| 15 | Non-allowed domain | No FAB | Visual check |
