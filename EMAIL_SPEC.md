# 📧 EMAIL MODULE — DEEP TECHNICAL SPEC

## 1. Architecture Overview

```
EmailPage.tsx (750 lines — master orchestrator)
├── AccountSwitcher       — Gmail account dropdown, unified/filtered view
├── EmailList             — Inbox rows with star toggle, badges, handled indicator
├── EmailDetail           — Single email view with toolbar + sticky panels
│   ├── HandledStamp      — Action audit trail (reads email_action_log)
│   └── SmartExtractPanel — AI-powered entity extraction + routing
├── CommandBar            — ⌘K palette (archive, snooze, create task/meeting/reminder)
├── CheatSheet            — Keyboard shortcut reference modal
├── KeyCoach              — Contextual shortcut hints strip
└── OnboardingTutorial    — 5-step first-run checklist
```

## 2. Database Tables (6 tables)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `email_accounts` | Gmail OAuth connections | `email_address`, `status`, `token_encrypted`, `refresh_token_encrypted`, `history_id`, `last_sync_at` |
| `email_messages` | Synced email metadata | `sender`, `subject`, `snippet`, `body_preview`, `is_read`, `is_starred`, `is_archived`, `snoozed_until`, `waiting_on`, `category`, `urgency`, `intent` |
| `email_oauth_tokens` | Decoupled token storage | `access_token`, `refresh_token`, `token_expiry`, `scopes` |
| `email_extracts` | AI analysis cache | `detected_type`, `confidence`, `entities_json`, `suggested_routes_json`, `money_direction`, `prompt_version`, `selected_account_last4` |
| `email_action_log` | Handled audit trail | `email_id`, `action_type`, `related_id` (FK to created entity) |
| `email_inbox_items` | Inbox status tracking | `source_id`, `status`, `project_id`, `account_id` |

All tables have RLS: `auth.uid() = user_id` for ALL operations. Soft-delete via `deleted_at`.

## 3. Edge Functions (Backend)

| Function | Purpose |
|----------|---------|
| `gmail-auth-start` | Initiates OAuth flow, returns `auth_url` |
| `gmail-auth-callback` | Handles OAuth redirect, stores tokens, creates `email_accounts` row |
| `gmail-sync` | Incremental sync via Gmail API (idempotent upsert on `account_id + message_id`) |
| `gmail-get` | Fetches single email body on demand |
| `gmail-list` | Paginated email query with search (server-side) |
| `gmail-disconnect` | Revokes tokens, soft-deletes account |
| `email-smart-extract` | **AI analysis engine** (see §5 below) |

## 4. Email Lifecycle & State Machine

```
[Gmail API] → gmail-sync → email_messages (metadata)
                               ↓
                         EmailPage loads
                               ↓
                    ┌─────────────────────────┐
                    │     EMAIL STATES         │
                    │                         │
                    │  Inbox (default)        │
                    │  ├→ Archive (E)         │
                    │  ├→ Snooze (S)          │──→ Returns to inbox when snoozed_until ≤ now()
                    │  ├→ Star (X)            │
                    │  ├→ Waiting On (W)      │──→ Shows in "Waiting On" tab
                    │  └→ Triage actions:     │
                    │      ├ Task (T)         │──→ Creates task in Plan
                    │      ├ Meeting (M)      │──→ Creates meeting in Plan
                    │      ├ Reminder         │──→ Creates reminder in Plan
                    │      ├ Finance Expense  │──→ Creates finance_entries row
                    │      └ Finance Income   │──→ Creates finance_entries row
                    └─────────────────────────┘
                               ↓
                    Every action → email_action_log
                               ↓
                    HandledStamp reads log → shows ✅
                    EmailList shows green "✓" badge
```

## 5. Smart Extract — AI Pipeline (SYSTEM_PROMPT V2.1)

### Flow

```
EmailDetail opens → SmartExtractPanel mounts
  → emailExtractService.extract(emailId)
    → POST /email-smart-extract
      1. Check cache (email_extracts table)
         - Cache hit if: prompt_version matches AND selected_account_last4 matches
         - Cache miss → proceed to AI
      2. Fetch email metadata from email_messages
      3. Fetch user's bank_accounts for context
      4. Redact PII (SA ID numbers, phone numbers, account numbers)
      5. Call ai-gateway with SYSTEM_PROMPT + user context
      6. Parse JSON response (strict: no markdown wrapping)
      7. Sanitize: strip unknown keys (ALLOWED_TOP_KEYS, ALLOWED_ENTITY_KEYS, ALLOWED_MONEY_DIR_KEYS)
      8. Enforce routing consistency:
         - ui_action=create_income → must have finance_income route
         - ui_action=create_expense → must have finance_expense route
      9. Match account_hint to real bank_account IDs
      10. Upsert into email_extracts (keyed on user_id + email_id)
      → Return { extract, cached: false }
```

### AI Classification Output

```typescript
{
  detected_type: "expense|invoice|subscription|travel|task|meeting|fyi|other",
  confidence: 0.0-1.0,
  summary: string,
  money_direction: {
    transaction_type: "income|expense|transfer|bank_fee|unknown",
    direction: "in|out|neutral",
    amount: number | null,
    currency: "ZAR",
    category: string,
    confidence: number,
    reason: string,           // max 18 words
    ui_action: "create_income|create_expense|none"
  },
  entities: { merchant, amount, currency, reference, account_hint, ... },
  suggested_routes: [{ target, account_id, category, confidence, reason }],
  requires_user_confirmation: boolean
}
```

### Safety Guards

- Unknown direction → finance actions **hidden** in UI (suppressed from `safeRoutes`)
- `confidence < 0.75` → shows VerificationBadge (ungrounded warning)
- PII redaction before AI call (regex: SA ID, phone, long numbers)
- Contract sanitization post-AI (only whitelisted keys pass through)

## 6. Triage Mode

When enabled:
- **Sorting**: Unread first → Starred → Date (newest)
- **Focus filter**: Hides `fyi` and `spam` categories
- **Unread filter**: Shows only `is_read === false`
- **Unhandled filter**: Shows only emails NOT in `handledEmailIds` set
- **Auto-advance**: After archive/snooze, cursor moves to next email
- **Compact mode**: EmailList renders with reduced padding

## 7. Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `J/K` | List | Navigate down/up |
| `Enter` | List | Open selected email |
| `E` | Both | Archive |
| `S` | Both | Snooze (tomorrow 8 AM) |
| `W` | Both | Mark Waiting On |
| `X` | Both | Toggle Star |
| `T` | Detail | Create Task |
| `M` | Detail | Create Meeting |
| `U` | Both | Toggle Unread filter |
| `Esc` | Detail | Back to list |
| `⌘K` | Both | Open Command Bar |
| `?` | Both | Open Cheat Sheet |

---

# 🔗 EMAIL → PLAN INTEGRATION — FULL SPEC

## Connection Architecture

```
Email Page                          Plan Page (/plan)
─────────                          ──────────────────
handleCreateTask()     ──→   taskService.create()    ──→   tasks table
handleCreateMeeting()  ──→   meetingService.create() ──→   meetings table
handleCreateReminder() ──→   reminderService.create()──→   reminders table
         │
         └──→ emailActionLogService.log()  ──→   email_action_log table
                                                    ↓
                                            HandledStamp reads this
                                            EmailList shows ✓ badge
```

## Email → Task

```typescript
// EmailPage.tsx line 387-399
const handleCreateTask = async () => {
  const result = await taskService.create({
    title: email.subject,                    // Subject becomes task title
    description: `From: ${email.sender}\n\n${email.snippet}`,
    source: "email",                         // Traceability tag
  });
  await logAction(email.id, "task", result.id);  // Audit trail with FK
};
```

**What gets created in `tasks` table:**
- `title` = email subject
- `description` = "From: sender\n\nsnippet"
- `source` = `"email"` (distinguishes from manual, voice, note-extracted tasks)
- `status` = `"todo"` (default)
- `priority` = `"medium"` (default)
- `project_id` = null (unlinked — user assigns later in Plan)
- `dedupe_key` = null (no dedup for email-created tasks)

**In Plan page**: Task appears in the Tasks tab, "Your Day" timeline, and "Today's Top 3" if prioritized.

## Email → Meeting

```typescript
// EmailPage.tsx line 402-419
const handleCreateMeeting = async () => {
  const start = new Date();
  start.setDate(start.getDate() + 1);      // Default: tomorrow
  start.setHours(10, 0, 0, 0);             // 10:00 AM
  const end = new Date(start);
  end.setHours(11);                         // 1 hour duration

  const result = await meetingService.create({
    title: email.subject,
    description: `From: ${email.sender}\n\n${email.snippet}`,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  });
  await logAction(email.id, "meeting", result.id);
};
```

**In Plan page**: Meeting appears in Calendar tab and triggers a database trigger that auto-creates a reminder 1 hour before `start_time`.

## Email → Reminder

```typescript
// EmailPage.tsx line 422-435
const handleCreateReminder = async () => {
  const time = new Date();
  time.setDate(time.getDate() + 1);
  time.setHours(9, 0, 0, 0);               // Tomorrow 9 AM

  const result = await reminderService.create({
    title: `Follow up: ${email.subject}`,    // "Follow up:" prefix
    description: `From: ${email.sender}`,
    reminder_time: time.toISOString(),
  });
  await logAction(email.id, "reminder", result.id);
};
```

**In Plan page**: Reminder appears in Reminders tab with "Convert to Meeting" option.

## Email → Finance (via Smart Extract)

```typescript
// EmailPage.tsx line 438-540
// Two handlers: handleCreateExpense + handleCreateIncome

// Deduplication: checks finance_entries.source_email_id BEFORE insert
// If duplicate detected (23505 or pre-check), shows info toast + backfills action log
// Amount, category, date, merchant all pre-filled from AI extraction

const result = await financeEntryService.create({
  type: "expense" | "income",
  category: route.category || moneyDir.category || entities.category_suggestion,
  amount: Math.abs(moneyDir.amount ?? entities.amount),
  entry_date: moneyDir.datetime || entities.date || today,
  notes: `${merchant} – ${reference} (from email: ${subject})`,
  source: "email",
  source_email_id: emailId,               // Links back for traceability
});
```

**Unique constraint**: `source_email_id` ensures one finance entry per email. Conflict handling catches both pre-check and 23505 DB errors.

## Shared Data Flow — The "Handled" System

```
Action occurs (Task/Meeting/Reminder/Finance/Archive/Snooze/Star/WaitingOn)
    ↓
emailActionLogService.log(emailId, actionType, relatedId)
    ↓
INSERT INTO email_action_log (user_id, email_id, action_type, related_id)
    ↓
State updates:
  1. handledEmailIds Set gains emailId → EmailList shows ✓ badge
  2. handledRefreshKey increments → HandledStamp re-fetches → shows audit trail
  3. Finance backfill: on email open, if finance_entries exists but no action_log → auto-inserts log
```

## Command Bar (⌘K) as Bridge

The CommandBar provides the same Plan-creation actions available in detail view:
- `Create Task from Email` → same `handleCreateTask()`
- `Create Meeting from Email` → same `handleCreateMeeting()`
- `Create Reminder` → same `handleCreateReminder()`
- Plus: Snooze presets (tomorrow 8AM, later today, next week), archive, waiting on
- Voice input supported via VoiceInput component

## What the Plan Page Sees

The Plan hub (`/plan`) reads from the **same tables** the Email page writes to:

| Plan Tab | Table | Email writes via |
|----------|-------|-----------------|
| Tasks | `tasks` | `taskService.create()` with `source: "email"` |
| Meetings | `meetings` | `meetingService.create()` |
| Reminders | `reminders` | `reminderService.create()` |
| Calendar | `meetings` | Same — meetings appear on calendar |
| Notes | `notes` | (Not yet connected from email) |

**No shared React state** between pages — all coordination happens through the database. Each page independently queries its tables. The Plan page's React Query cache refreshes on mount/focus.

---

## Summary Stats

- **750 lines** in EmailPage.tsx (orchestrator)
- **349 lines** in SmartExtractPanel (AI UI)
- **469 lines** in email-smart-extract edge function (AI backend)
- **6 database tables** dedicated to email
- **7 edge functions** for Gmail integration
- **10 keyboard shortcuts** for triage
- **4 entity types** created from email → Plan (Task, Meeting, Reminder, Finance)
- **1 audit log** (`email_action_log`) tracks every action with FK to created entity
