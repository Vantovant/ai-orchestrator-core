# VantoOS Flagship Features — Complete Specification & Capabilities Report

**Version:** 1.0  
**Date:** 2026-03-06  
**Author:** VantoOS Engineering  
**Status:** Production (Executive Beta)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Feature 1: Email Smart Extract](#2-email-smart-extract)
3. [Feature 2: WhatsApp Smart Extract (Chrome Extension)](#3-whatsapp-smart-extract)
4. [Feature 3: Web Smart Capture (Chrome Extension)](#4-web-smart-capture)
5. [Shared Architecture](#5-shared-architecture)
6. [Security & Privacy](#6-security--privacy)
7. [Acceptance Criteria Matrix](#7-acceptance-criteria-matrix)

---

## 1. Executive Summary

VantoOS is an executive operating system purpose-built for South African entrepreneurs. Its three flagship AI features transform raw digital communications — emails, WhatsApp conversations, and web pages — into structured, actionable intelligence. Each feature enforces strict **evidence grounding** (no AI hallucinations), **PII redaction** (South African ID numbers, phone numbers, bank accounts), and **data sovereignty** (BYOK encryption, no data leaves without user keys).

### What Makes These Features Unique

| Capability | Email Smart Extract | WhatsApp Smart Extract | Web Smart Capture |
|---|---|---|---|
| AI-powered analysis | ✅ | ✅ | ✅ |
| Evidence-grounded claims | ✅ | ✅ (PhD-grade) | ✅ |
| Money direction detection | ✅ (Income/Expense/Fee/Transfer) | ✅ | ❌ |
| Task extraction | ✅ (via routing) | ✅ (with evidence quotes) | ✅ (max 5) |
| PII redaction (SA-focused) | ✅ | ✅ | ✅ |
| Project linking | ✅ | ✅ (Plan + Project dual save) | ✅ (Project inbox) |
| Deduplication | ✅ (prompt version + account) | ✅ (SHA-256 per chat+date) | ✅ (SHA-256 dedupe key) |
| Offline/degraded mode | ✅ (cached extracts) | ❌ (requires AI) | ✅ (Quick Capture fallback) |

---

## 2. Email Smart Extract

### 2.1 Overview

Email Smart Extract is an AI-powered email intelligence engine that classifies incoming emails, detects financial transactions, extracts entities (merchants, amounts, dates), and recommends routing actions — all within the VantoOS Email triage interface.

### 2.2 Technical Specification

#### Edge Function
- **Name:** `email-smart-extract`
- **Auth:** Bearer JWT (standard Supabase auth)
- **Method:** POST
- **Prompt Version:** v2.1

#### Request Payload
```json
{
  "email_id": "uuid",
  "force_rerun": false,
  "selected_account": {
    "last4": "1234",
    "account_type": "current",
    "account_id": "uuid"
  }
}
```

#### AI System Prompt (v2.1)
The system prompt implements a strict **Money Direction Classifier** with 5 rules:
1. **INCOME** — Money credited/received into user's selected account (matches `last4`)
2. **EXPENSE** — Money paid/debited from user's account to external party
3. **BANK FEE** — Explicit bank charges, service fees
4. **TRANSFER** — Internal movement between user's own accounts
5. **UNKNOWN** — Direction unclear (confidence < 0.55, `ui_action: "none"`)

#### Output Schema (Strict Contract)
```json
{
  "email_id": "string",
  "detected_type": "expense|invoice|subscription|travel|task|meeting|fyi|other",
  "confidence": 0.0,
  "summary": "string",
  "money_direction": {
    "transaction_type": "income|expense|transfer|bank_fee|unknown",
    "direction": "in|out|neutral",
    "amount": null,
    "currency": "ZAR",
    "datetime": null,
    "reference": null,
    "counterparty": null,
    "category": "string",
    "confidence": 0.0,
    "reason": "max 18 words",
    "ui_action": "create_income|create_expense|none"
  },
  "entities": {
    "merchant": null,
    "amount": null,
    "currency": "ZAR",
    "transaction_type": null,
    "date": null,
    "account_hint": null,
    "reference": null,
    "category_suggestion": null,
    "vendor_email": null,
    "subscription_hint": null,
    "line_items": [],
    "counterparty": null
  },
  "suggested_routes": [
    {
      "target": "finance_expense|finance_income|task|meeting|reminder|notes|project",
      "account_id": null,
      "project_id": null,
      "category": null,
      "confidence": 0.0,
      "reason": "string"
    }
  ],
  "requires_user_confirmation": true
}
```

#### Key Capabilities

1. **Smart Caching** — Extracts are cached by `(email_id, prompt_version, selected_account_last4)`. Cache is invalidated when the user changes their selected bank account or the prompt version is upgraded.

2. **Account-Aware Intelligence** — The AI receives the user's bank account details (last4, type) and all known accounts, preventing mislabeling (e.g., a commission credit being classified as an expense).

3. **Routing Consistency Enforcement** — Post-AI sanitization ensures that if `money_direction.ui_action == "create_income"`, a `finance_income` route exists in `suggested_routes` (and vice versa for expenses). Mismatches are auto-corrected.

4. **PII Redaction** — Before AI processing:
   - SA ID numbers (13 digits)
   - Phone numbers (+27 and 0XX formats)
   - Bank account numbers (8-12 digits)

5. **Entity Extraction** — Merchants, amounts, currencies, dates, references, and line items (for invoices).

6. **Schema Sanitization** — Output is stripped of any extra keys not in the contract to prevent prompt injection drift.

### 2.3 Frontend Integration

#### Email Page (`/email`)
- **Superhuman-style triage** with keyboard shortcuts (J/K navigate, E archive, S snooze, W waiting-on, X star)
- **Focus mode** — filters out low-priority categories (fyi, spam)
- **Unread/Unhandled toggles** — zero-inbox workflow
- **Smart Extract panel** — slides open per email showing:
  - Detected type badge
  - AI summary
  - Money direction with dynamic button labels ("Create Income" / "Create Expense")
  - Suggested routes with one-click action
  - "✓ Created" confirmation after action is taken
- **Account Switcher** — multi-Gmail account support with per-account sync
- **5-step onboarding checklist** (Connect → Sync → View Inbox → Filter → Shortcuts)
- **Key Coach** — contextual keyboard shortcut hints

#### Gmail Integration
- **OAuth 2.0** via `gmail-auth-start` / `gmail-auth-callback` edge functions
- **Incremental sync** via `gmail-sync` using Gmail History API
- **Message fetching** via `gmail-get` / `gmail-list`
- **Disconnect** via `gmail-disconnect`
- Encrypted OAuth tokens stored in `email_oauth_tokens` table

### 2.4 Database Tables
| Table | Purpose |
|---|---|
| `email_accounts` | Connected Gmail accounts with OAuth tokens |
| `email_messages` | Synced email metadata (subject, sender, snippet, labels) |
| `email_extracts` | Cached AI extract results per email |
| `email_action_log` | Audit trail of user actions on emails |
| `email_inbox_items` | Inbox triage state |
| `email_oauth_tokens` | Encrypted Gmail OAuth credentials |

### 2.5 What It Can Do (User Perspective)

1. ✅ **Connect multiple Gmail accounts** and sync emails automatically
2. ✅ **Triage emails like Superhuman** with keyboard shortcuts and focus mode
3. ✅ **AI-classify every email** as expense, invoice, subscription, task, meeting, or FYI
4. ✅ **Detect income vs expense** with account-aware intelligence (knows which bank account you're viewing)
5. ✅ **Extract financial data** — amount, merchant, date, reference — and create finance entries with one click
6. ✅ **Route emails to tasks, meetings, reminders, or project notes** based on AI recommendations
7. ✅ **Track handled/unhandled status** for zero-inbox workflow
8. ✅ **Snooze, star, archive, and set follow-up dates** with keyboard shortcuts
9. ✅ **Filter by unread only, focus mode (hide spam/FYI), or unhandled only**
10. ✅ **View snoozed and waiting-on queues** separately

---

## 3. WhatsApp Smart Extract (Chrome Extension)

### 3.1 Overview

The WhatsApp Smart Extract is a Chrome Extension flagship feature that captures WhatsApp Web conversations and produces **PhD-grade AI analysis** — including executive summaries, evidence-grounded key points, stakeholder identification, risk/opportunity analysis, sentiment analysis, and actionable task extraction with evidence quotes.

### 3.2 Technical Specification

#### Edge Function
- **Name:** `smart-capture-whatsapp`
- **Auth:** `x-extension-token` (Chrome extension) or Bearer JWT
- **Method:** POST

#### Request Payload
```json
{
  "chat_key": "wa:contact-name-hash",
  "chat_title": "Contact Name",
  "messages": [
    { "text": "message content", "direction": "incoming|outgoing", "timestamp": "HH:MM" }
  ],
  "selected_text": "optional highlighted text",
  "user_context": { "locale": "ZA", "currency_default": "ZAR" }
}
```

#### AI Analysis Output (PhD-Grade)
```json
{
  "summary": "2-4 sentence executive summary backed by evidence",
  "key_points": ["3-7 bullet-point insights"],
  "sentiment": "One-line sentiment analysis",
  "stakeholders": [{ "name": "Person", "role": "Inferred role" }],
  "risks": ["Potential risks identified"],
  "opportunities": ["Potential opportunities identified"],
  "confidence": 0.85,
  "needs_verification": false,
  "evidence": [
    { "claim": "Specific claim", "quote": "Direct transcript quote", "source": "MSG3 - John" }
  ],
  "extracted_actions": [
    {
      "title": "Action title",
      "action_type": "task|meeting|reminder|notes",
      "priority": "low|medium|high|critical",
      "suggested_due_date": "2026-03-10",
      "details": "Extra context",
      "evidence_quotes": ["Direct quote from transcript"],
      "message_refs": ["MSG3", "MSG7"]
    }
  ],
  "money_direction": {
    "transaction_type": "income|expense|bank_fee|transfer|unknown",
    "amount": null,
    "currency": "ZAR",
    "ui_action": "create_income|create_expense|none",
    "confidence": 0.0
  },
  "draft_reply": "Optional suggested reply text"
}
```

#### Anti-Hallucination Rules (Enforced)
1. **Every claim MUST reference a direct `[MSG#]` quote** from the transcript
2. **Actions without `evidence_quotes` are dropped** (hard gate post-AI)
3. **Money direction only set if money patterns detected** in transcript text (R/$/€ amounts, bank keywords)
4. **Low-confidence money direction (`< 0.75`)** has `ui_action` forced to `"none"`

#### Auth Paths
| Auth Method | AI Call Path |
|---|---|
| Extension token (`x-extension-token`) | Direct provider call (Gemini/OpenAI) using user's encrypted keys from `user_ai_keys` |
| Bearer JWT | Forward to `ai-gateway` which handles BYOK/beta routing |

This dual-path architecture was implemented because the `ai-gateway` validates user JWTs, which aren't available in extension-token flows.

### 3.3 Chrome Extension Architecture

#### Components
| File | Role |
|---|---|
| `background.js` | Service worker: tab management, message routing, session persistence |
| `whatsapp-content-script.js` | DOM scraping: chat title detection, transcript extraction, Vanto Bar overlay |
| `sidepanel.js` | UI logic: transcript preview, AI analysis display, action application |
| `sidepanel.html` | Side panel markup |
| `manifest.json` | MV3 manifest with `sidePanel`, `scripting`, `storage` permissions |

#### Chat Detection Flow
1. Content script detects active chat via `#pane-side [aria-selected=true] span[title]`
2. Broadcasts `WHATSAPP_CHAT_CONTEXT` to background script
3. Background stores in `waContextByTabId` + `chrome.storage.session` (survives SW sleep)
4. Side panel fetches via `GET_WHATSAPP_CONTEXT`
5. **Fallback:** If background context fails, side panel uses `chrome.scripting.executeScript` to directly scrape DOM

#### Transcript Extraction
- **Selector:** `#main [data-pre-plain-text]` (authoritative source)
- **Fallback selectors:** `.selectable-text`, `[dir=ltr]`, `[dir]`, `innerText`
- **Scroll-nudge retry:** Handles WhatsApp's DOM virtualization (lazy loading)
- **Message limit:** Last 25-30 messages
- **Noise filtering:** Strips "forwarded", "voice call", UI labels

### 3.4 User Workflow (3-Step)

1. **Transcript Preview** — User sees clean, scrollable transcript of last 25 messages. Must manually verify before proceeding. *(Anti-data-leakage gate)*

2. **PhD Analysis** — User clicks "🚀 Send to AI". AI produces evidence-grounded analysis. Each claim is paired with a direct transcript quote. Evidence is displayed inline. If AI fails, a red error banner shows the exact issue (402 = missing keys, 502 = provider error).

3. **Apply to VantoOS** — User selects which extracted actions to apply (tasks, meetings, reminders). Dual-save:
   - **Plan Note** (always) — Raw transcript + AI output saved to `notes_daily`
   - **Project Note** (if project selected) — Saved via `capture-web` endpoint to project inbox

### 3.5 What It Can Do (User Perspective)

1. ✅ **Capture any WhatsApp Web conversation** with a single click
2. ✅ **Preview transcript before AI processing** — verify accuracy, cancel if wrong
3. ✅ **PhD-grade executive analysis** — summary, key points, sentiment, stakeholders, risks, opportunities
4. ✅ **Evidence-grounded claims** — every statement backed by a direct transcript quote
5. ✅ **Extract actionable tasks, meetings, and reminders** with evidence and priority levels
6. ✅ **Detect financial transactions** in chat (amounts, payments, invoices)
7. ✅ **Save to Plan diary** — full transcript preserved as daily note
8. ✅ **Save to Project** — link conversation analysis to a specific project
9. ✅ **SHA-256 deduplication** — re-capturing the same chat on the same day merges, doesn't duplicate
10. ✅ **One-click action creation** — apply extracted tasks/meetings/reminders directly to VantoOS
11. ✅ **Draft reply suggestion** — AI-generated response suggestion
12. ✅ **Manual quick actions** — create task/meeting/reminder/note from chat without AI
13. ✅ **Handled status tracking** — see which chats have been processed
14. ✅ **Fallback chat detection** — "Detect from Page" button if automatic detection fails

---

## 4. Web Smart Capture (Chrome Extension)

### 4.1 Overview

Web Smart Capture is the Chrome Extension's AI-powered web page analysis tool. It scrapes structured page data (headings, text blocks, tables, forms, selected text), sends it through PII redaction and AI analysis, and saves the result to a project inbox with evidence-backed summaries and extracted tasks.

### 4.2 Technical Specification

#### Edge Functions
| Function | Purpose |
|---|---|
| `smart-capture-web` | AI-powered analysis with evidence grounding |
| `capture-web` | Quick capture (URL + title + highlight, no AI) |

#### `smart-capture-web` Request
```json
{
  "url": "https://example.com/page",
  "title": "Page Title",
  "snapshot": {
    "selectedText": "user-highlighted text",
    "metaDescription": "meta tag content",
    "headings": ["H1 text", "H2 text"],
    "textBlocks": ["paragraph 1", "paragraph 2"],
    "tables": [["header1", "header2"], ["data1", "data2"]],
    "formFields": [],
    "entities": ["detected entities"]
  },
  "project_id": "uuid (optional)",
  "metadata": { "source": "chrome-extension-smart" }
}
```

#### `smart-capture-web` Response
```json
{
  "action": "created|merged",
  "source_context_id": "uuid",
  "inbox_item_id": "uuid|null",
  "project_id": "uuid|null",
  "suggested_project_id": "uuid|null",
  "deep_link_url": "https://vantoos.../projects?id=...",
  "summary": "AI-generated summary",
  "evidence": [
    { "claim": "...", "quote": "...", "source": "heading/paragraph" }
  ],
  "extracted_actions": [
    { "title": "...", "priority": "medium", "category": "..." }
  ],
  "needs_verification": true,
  "verification_reasons": ["..."],
  "redaction_toast": false,
  "ai_status": "ok|degraded",
  "provider_used": "gemini|openai",
  "ai_provider_failed": false
}
```

#### `capture-web` (Quick Capture) Request
```json
{
  "url": "https://example.com",
  "title": "Page Title",
  "selected_text": "highlighted text",
  "page_summary": "meta description",
  "project_id": "uuid (optional)",
  "metadata": { "source": "chrome-extension" }
}
```

### 4.3 Key Capabilities

1. **Domain Allowlist** — Only captures from user-approved domains (`user_allowed_domains` table). Chrome permissions are requested per-domain.

2. **Dual Capture Modes:**
   - **Quick Capture** — Saves URL, title, and selected text. No AI. Instant.
   - **Smart Capture** — Scrapes full page structure, runs AI analysis, extracts tasks, provides evidence-backed summary.

3. **Snapshot Truncation** — Page content capped at 8,000 characters. Progressive trimming: text blocks → tables → headings.

4. **PII Redaction** — SA ID numbers, emails, phone numbers stripped before AI processing.

5. **Project Suggestion** — AI suggests which project a captured page relates to (fuzzy name matching against user's projects).

6. **Source Context Deduplication** — SHA-256 key from `(userId, projectId, url, normalizedText)`. Re-capturing the same content merges instead of duplicating.

7. **Project Inbox Items** — When a project is selected, creates an inbox item linked to the source context for in-project review.

8. **Evidence Grounding** — Every summary claim must be backed by a direct page quote. Unverified claims trigger `needs_verification: true` badge.

9. **Confirmation Gate** — When verification is needed, user must check "I confirm this summary matches the page evidence" before applying tasks.

10. **Graceful Degradation** — If AI fails, Quick Capture data is still saved with a basic summary.

### 4.4 Auth Paths (Fixed)

| Auth Method | AI Call Path |
|---|---|
| Extension token (`x-extension-token`) | Direct provider call using user's encrypted keys (bypasses ai-gateway JWT issue) |
| Bearer JWT | Forward to `ai-gateway` with user JWT |

*Note: This was a critical bug fix. The original implementation called `ai-gateway` with the service role key, which failed JWT validation. Extension-token requests now call AI providers directly.*

### 4.5 What It Can Do (User Perspective)

1. ✅ **Quick Capture any web page** — save URL, title, and selected text instantly
2. ✅ **Smart Capture with AI** — full page analysis with summary, evidence, and task extraction
3. ✅ **Domain allowlist** — only captures from approved domains (privacy control)
4. ✅ **Chrome permission management** — grant/revoke browser access per domain
5. ✅ **Evidence-grounded summaries** — each claim backed by a page quote
6. ✅ **Extract up to 5 actionable tasks** with priority levels
7. ✅ **Auto-suggest project** — AI matches page content to existing projects
8. ✅ **Save to project inbox** — captured pages appear in the project's inbox tab
9. ✅ **Deduplication** — re-capturing the same page content merges, doesn't duplicate
10. ✅ **PII scrubbing** — sensitive SA data redacted before AI processing
11. ✅ **Deep linking** — "View in VantoOS" button opens the exact project with the captured item highlighted
12. ✅ **Graceful degradation** — if AI is unavailable, basic capture still saves

---

## 5. Shared Architecture

### 5.1 AI Provider Routing

All three features use a multi-tier AI provider hierarchy:

```
Request → Feature Edge Function
  ├── Extension token auth → Direct provider call (Gemini → OpenAI fallback)
  ├── JWT auth → ai-gateway
  │     ├── BYOK keys available → User's provider (Gemini/OpenAI)
  │     ├── Beta Assist mode → Lovable AI (managed, counter-decremented)
  │     └── No keys, no assist → HARD BLOCK (402)
  └── GOV/NDA workspace → Vertex Bridge ONLY
```

### 5.2 BYOK (Bring Your Own Key) Security

- Keys encrypted at rest using server-side `AI_KEYS_ENCRYPTION_SECRET`
- Only last 4 characters stored for UI display
- Plaintext keys never logged or returned to client
- Keys resolved server-side per request, never exposed to frontend

### 5.3 Evidence Grounding Contract

All AI features enforce the same anti-hallucination rules:
1. Every claim must have a supporting quote from the source material
2. Ungrounded claims are forbidden — AI must set `needs_verification: true`
3. Actions without evidence quotes are dropped (hard gate)
4. UI displays evidence inline and shows verification badges

### 5.4 PII Redaction (SA-Focused)

Applied before any AI call across all features:
| Pattern | Example | Replacement |
|---|---|---|
| SA ID numbers | `8501015009087` | `[REDACTED]` |
| International phone | `+27 82 123 4567` | `[REDACTED]` |
| Local phone | `082 123 4567` | `[REDACTED]` |
| Email addresses | `user@example.com` | `[REDACTED]` |
| Bank account numbers | `123456789012` | `[REDACTED]` |

### 5.5 Deduplication Strategy

| Feature | Dedupe Key Formula | Behavior |
|---|---|---|
| Email Extract | `(email_id, prompt_version, selected_account_last4)` | Cache hit → return cached |
| WhatsApp | `SHA-256(userId\|chat_key\|today)` | Merge into existing daily note |
| Web Capture | `SHA-256(userId\|projectId\|url\|normalizedText)` | Merge source context |
| Task Creation | `SHA-256(userId\|projectId\|normalizedTitle\|source)` | Upsert with `last_touched_at` |

---

## 6. Security & Privacy

### 6.1 Data Sovereignty ("Trust Moat")

- **No managed AI keys** in production — users must bring their own (BYOK)
- **Beta Assist mode** is temporary (counter-limited, expires)
- **GOV/NDA workspaces** block all managed AI modes
- **All AI calls logged** in `ai_call_log` with provider, mode, userId, duration
- **PII redacted before AI** — sensitive data never leaves the user's control boundary

### 6.2 Authentication

| Method | Used By | Validation |
|---|---|---|
| Bearer JWT | Web app | `supabase.auth.getUser()` |
| Extension token | Chrome extension | SHA-256 hash lookup in `extension_tokens` table |
| Service role key | Internal edge function calls | Restricted to server-side only |

### 6.3 RLS (Row-Level Security)

All tables enforce RLS policies ensuring users can only read/write their own data. Admin access uses `has_role()` security definer function.

---

## 7. Acceptance Criteria Matrix

### Email Smart Extract

| # | Test | Expected |
|---|---|---|
| 1 | Open email → Smart Extract | AI returns classified type + summary |
| 2 | Bank notification (credit) | `money_direction.ui_action = "create_income"` |
| 3 | Bank notification (debit) | `money_direction.ui_action = "create_expense"` |
| 4 | Change selected bank account → re-extract | New result with updated direction |
| 5 | Click "Create Income" | Finance entry created, button shows "✓ Created" |
| 6 | Re-open same email | Cached result returned instantly |
| 7 | No AI keys | `AI_BLOCKED` status returned |
| 8 | PII in email body | Redacted before AI processing |

### WhatsApp Smart Extract

| # | Test | Expected |
|---|---|---|
| 1 | Open WhatsApp chat → Smart Extract | Transcript preview shows messages |
| 2 | Click "Send to AI" | PhD analysis with summary, key_points, sentiment, evidence |
| 3 | Verify evidence | Each claim has a `[MSG#]` quote reference |
| 4 | Apply tasks | Tasks created with evidence_quotes |
| 5 | No AI keys → Analyze | Clear "Connect AI Keys" error (not fake analysis) |
| 6 | Send to VantoOS (no project) | Plan Note created in notes_daily |
| 7 | Send to VantoOS (with project) | Plan Note + Project capture created |
| 8 | Re-capture same chat same day | Merged into existing note |
| 9 | Chat detection fails | "Detect from Page" button works |
| 10 | Money patterns in chat | `money_direction` populated with correct type |

### Web Smart Capture

| # | Test | Expected |
|---|---|---|
| 1 | Quick Capture on allowed domain | Source context created, deep link shown |
| 2 | Smart Capture on allowed domain | AI summary + evidence + tasks extracted |
| 3 | Domain not in allowlist | 403 error: "Domain not in allowlist" |
| 4 | Select project → capture | Project inbox item created |
| 5 | Re-capture same page | Merged (dedupe key match) |
| 6 | PII on page | Redacted before AI, toast shown |
| 7 | AI fails | Quick Capture data still saved, "degraded" status |
| 8 | Apply extracted tasks | Tasks created with dedupe keys |
| 9 | No AI keys | 402 error with "Connect AI Keys" message |
| 10 | Needs verification | Confirmation checkbox required before applying tasks |

---

## Appendix: Edge Function Reference

| Function | Auth | Feature |
|---|---|---|
| `email-smart-extract` | Bearer JWT | Email AI analysis |
| `gmail-auth-start` | Bearer JWT | Gmail OAuth initiation |
| `gmail-auth-callback` | None (OAuth redirect) | Gmail OAuth completion |
| `gmail-sync` | Bearer JWT | Incremental email sync |
| `gmail-list` | Bearer JWT | List emails from Gmail API |
| `gmail-get` | Bearer JWT | Fetch single email body |
| `gmail-disconnect` | Bearer JWT | Revoke Gmail access |
| `smart-capture-whatsapp` | Extension token / JWT | WhatsApp AI analysis |
| `capture-whatsapp` | Extension token / JWT | WhatsApp quick save to Plan notes |
| `smart-capture-web` | Extension token / JWT | Web page AI analysis |
| `capture-web` | Extension token / JWT | Web page quick capture |
| `extension-pair` | None | Pairing code exchange |
| `extension-exchange` | None | Token exchange |
| `extension-projects` | Extension token | List user projects |
| `extension-tasks` | Extension token | List user tasks |
| `extension-task-create` | Extension token | Create task with dedupe |
| `extension-domains` | Extension token | CRUD allowed domains |
| `assistant-help` | Extension token / JWT | Context-aware Q&A |
| `ai-gateway` | Bearer JWT / Service key | Central AI router |
| `ai-status` | Bearer JWT | Check AI availability |
| `redact-sensitive` | Service key | PII scrubbing |

---

*This document is the authoritative reference for VantoOS's three flagship AI features. It should be updated whenever edge function contracts, AI prompts, or frontend workflows change.*
