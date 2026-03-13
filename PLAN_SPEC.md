# Plan Hub — Deep Technical Specification

> **Route:** `/plan` with tabs `?tab=today|tasks|reminders|meetings|calendar|notes`
> **File:** `src/pages/PlanPage.tsx` (816 lines — master orchestrator)

---

## 1. Architecture Overview

The Plan Hub is the consolidated command center for all personal productivity. It merges Tasks, Reminders, Meetings, Calendar, and Notes (Daily Diary) into a single tabbed interface with cross-entity interactions.

### Component Tree

```
PlanPage.tsx (orchestrator)
├── SecretaryBriefing.tsx          — AI morning briefing (auto-triggers daily)
├── VoiceInput / VoiceConfirmation — Natural language voice commands
├── PlanCommandBar.tsx             — ⌘K universal search & quick-create
├── QuickAddFab                    — Mobile floating action button
├── Tabs
│   ├── TodayTab (inline)          — Executive "Your Day" dashboard
│   ├── Tasks list (inline)        — Full task list with search/filter/sort
│   ├── Reminders list (inline)    — Reminder list with status filters
│   ├── Meetings list (inline)     — Meeting list with search
│   ├── CalendarTab (inline)       — Day/Week/Month calendar view
│   └── NotesTab.tsx               — Daily diary with structured journal
│       ├── DictationMic.tsx       — Voice-to-text dictation
│       ├── NoteSelectionMenu.tsx  — Highlight-to-convert contextual menu
│       └── ActionExtractor.tsx    — AI extraction pipeline
├── TaskDetailDrawer.tsx           — Slide-out task detail/edit panel
├── ReminderDetailDrawer.tsx       — Slide-out reminder detail panel
└── MeetingDetailDrawer.tsx        — Slide-out meeting detail panel
```

---

## 2. Data Layer

### Database Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `tasks` | `id, title, status, priority, due_date, start_date, completed_at, project_id, dedupe_key, note_id, source, estimated_minutes, last_touched_at, order_index` | All user tasks |
| `reminders` | `id, title, reminder_time, is_done, task_id, project_id` | Time-based alerts |
| `meetings` | `id, title, start_time, end_time, location, attendees, notes, project_id` | Calendar events |
| `notes_daily` | `id, note_date, content, structured_mode, structure_json, links_json` | Daily diary entries |
| `user_preferences` | `preference_key, preference_value` | Secretary mode settings |
| `compliance_reminders` | `id, label, type, due_date, is_done` | Regulatory deadlines |

### Service Layer

| Service | File | Methods |
|---------|------|---------|
| `taskService` | `src/services/taskService.ts` | `list(sort)`, `create(task)`, `update(id, updates)`, `softDelete(id)`, `bulkUpsert(tasks)` |
| `reminderService` | `src/services/reminderService.ts` | `list()`, `create(reminder)`, `toggleDone(id, is_done)`, `update(id, updates)`, `softDelete(id)` |
| `meetingService` | `src/services/meetingService.ts` | `list()`, `create(meeting)`, `update(id, updates)`, `softDelete(id)` |
| `notesService` | `src/services/notesService.ts` | `getByDate(date)`, `upsert(date, content, mode, json)`, `listRecent(limit)` |
| `secretaryService` | `src/services/secretaryService.ts` | `getSettings()`, `saveSettings()`, `runBriefing()`, `runPreMeetingPrep(meetingId)`, `runEodReview(date)` |

### React Query Keys

```typescript
["tasks", taskSort]      // Sort: "latest" | "due_date" | "priority"
["reminders"]
["meetings"]
["projects"]             // For project name lookup
["daily-note", date]     // Per-date note cache
```

---

## 3. Tab Specifications

### 3.1 Today Tab

**Purpose:** Executive "Your Day" dashboard showing the most important items at a glance.

**Sections:**
1. **Stats Cards** (3-column grid):
   - Today's Meetings count
   - Urgent Reminders count (within 48 hours)
   - Top Priorities count (up to 5 non-done tasks)

2. **Top Priorities** — Top 5 open tasks sorted by priority (`critical > high > medium > low`), each clickable to open `TaskDetailDrawer`

3. **Today's Meetings** — Meetings where `start_time` is same day as now, clickable to open `MeetingDetailDrawer`

4. **Urgent Reminders** — Non-done reminders within 48h window, clickable to open `ReminderDetailDrawer`

5. **Compliance Widget** — `ComplianceWidget` in compact mode showing upcoming regulatory deadlines

**Quick Create:** Desktop shows inline buttons for Task/Reminder/Meeting. Mobile uses `QuickAddFab`.

### 3.2 Tasks Tab

**Features:**
- **Search** — Real-time text filter on task titles
- **Filter** — All / Pending / Done / Critical / High
- **Sort** — Latest (default, by `last_touched_at`) / Due Date / Priority
- **Project filter** — Via `project_id` query param (from note extract navigation)
- **Highlight** — `highlight` query param causes matching task cards to pulse with `ring-2 ring-primary animate-pulse` for 4 seconds
- **Import banner** — Shows origin info when navigated from note extraction (`source=note_extract`)
- **Inline checkbox** — Toggle done/pending without opening drawer
- **Project badge** — Shows linked project name with `FolderKanban` icon

**Task Priority Colors:**
```typescript
critical: "bg-destructive text-destructive-foreground"
high:     "bg-warning text-warning-foreground"
medium:   "bg-primary text-primary-foreground"
low:      "bg-muted text-muted-foreground"
```

### 3.3 Reminders Tab

**Features:**
- **Filter** — All / Upcoming / Done / Overdue
- **Inline checkbox** — Toggle done status
- **Project badge** — Shows linked project name
- **Time display** — Shows `reminder_time` formatted as `MMM d, h:mm a`

### 3.4 Meetings Tab

**Features:**
- **Search** — Real-time text filter on meeting titles
- **Time & Location** — Shows start time and location with icons
- **Project badge** — Shows linked project name

### 3.5 Calendar Tab

**Views:** Day / Week / Month (toggle buttons)

**Navigation:** Chevron left/right buttons navigate by period (day/week/month depending on view)

**Event Sources:**
| Source | Color | Filter |
|--------|-------|--------|
| Meetings | `bg-primary` | All meetings by `start_time` |
| Reminders | `bg-warning` | Non-done reminders by `reminder_time` |
| Tasks | `bg-accent` | Tasks with `due_date`, not done |

**Month View:** Grid layout (7 columns), shows up to 3 events per cell with "+N more" overflow. Today highlighted with `bg-primary/5 ring-1 ring-primary/20`.

**Day/Week View:** Card-based layout with full event list per day. Today gets `ring-1 ring-primary/30` styling.

**Click handling:** All events are clickable and open the appropriate detail drawer.

### 3.6 Notes Tab

**File:** `src/components/plan/NotesTab.tsx` (270 lines)

**Features:**

#### Date Navigation
- Chevron left/right to navigate dates
- "Today" badge when viewing current date

#### Two Modes
1. **Freeform** — Single large textarea (12 rows), monospace font
2. **Structured Journal** — 7 categorized fields + smaller freeform area (4 rows)

**Structured Fields:**
```typescript
wins:      "🏆 Wins"
risks:     "⚠️ Risks"
decisions: "🔨 Decisions"
people:    "👥 People"
ideas:     "💡 Ideas"
gratitude: "🙏 Gratitude"
followups: "📋 Follow-ups"
```

#### Autosave System (`useNotesSync` hook)

**File:** `src/hooks/useNotesSync.ts` (191 lines)

| Feature | Implementation |
|---------|---------------|
| **Debounce** | 1500ms after last keystroke |
| **Offline support** | Falls back to `localStorage` draft (`notes_draft_{date}`) |
| **Cross-device sync** | Supabase Realtime subscription on `notes_daily` table filtered by `note_date` |
| **Window focus refetch** | Re-queries when tab regains focus (only if no dirty changes) |
| **Auto-reconnect** | Syncs dirty content when coming back online via `window.online` event |
| **Save status** | `idle → saving → saved / error / offline` |

**Save Status Badge:**
```
saving  → Loader2 spin + "Saving…"
saved   → Check icon + "Saved at HH:mm"
error   → AlertCircle + "Retry" (clickable)
offline → WifiOff + "Offline — saved locally"
```

#### Voice Dictation
- `DictationMic` component appends transcribed text
- Undo support — removes last dictation segment
- In structured mode, appends to `followups` field

#### Highlight-to-Convert (`NoteSelectionMenu`)
- Select text in freeform textarea → contextual menu appears
- Options: "Make Task" / "Make Reminder"
- Task: `taskService.create({ title: selectedText, source: "notes" })`
- Reminder: `reminderService.create({ title: selectedText, reminder_time: now + 1 hour })`

#### AI Action Extraction (`ActionExtractor`)

**File:** `src/components/plan/ActionExtractor.tsx` (424 lines)

**Pipeline:**
1. **Extract** — Sends note content to `plan-ai-extract-actions` edge function
2. **Review** — User sees suggestions with checkboxes (type, title, priority, due date)
3. **Apply** — Bulk upserts tasks via `taskService.bulkUpsert()`, creates reminders individually

**Deduplication:**
```typescript
// SHA-256 dedupe key = hash(user_id | project_id | note_id | normalized_title)
function makeDedupe(userId, projectId, noteId, text): string {
  // djb2 hash of concatenated components
}
```

**Bulk Upsert Logic:**
- If `dedupe_key` exists in DB → **merge** (update description, priority, due_date, touch timestamp)
- If new → **create** with `source: "note_extract"`
- Per-item status tracking: `idle → queued → created / merged / failed`

**Post-Apply Verification:**
- Counts open tasks in project (`completed_at IS NULL AND status NOT IN (done, completed, cancelled)`)
- Builds `WriteReceipt` with created/merged/failed counts
- Awaits full `refetchQueries` before navigating to Tasks tab

**Receipt System (`WriteReceipt`):**
```typescript
interface WriteReceiptData {
  status: "success" | "warning" | "error";
  summary: string;
  affected_ids: string[];
  verification_message?: string;
}
```

#### End-of-Day Review (Secretary Mode)
- Available when Secretary Mode is ON and viewing today's date
- Calls `plan-ai-secretary` edge function with `action: "eod"`
- Displays: Completed / Slipped / Tomorrow's Top 3 / Action Items
- Copy button for sharing via WhatsApp

---

## 4. Secretary Mode

**Toggle:** Header switch with Sparkles icon, persisted in `user_preferences` table under key `secretary_mode_settings`.

### Settings
```typescript
interface SecretarySettings {
  secretary_mode: boolean;
  morning_briefing: boolean;
  pre_meeting_prompts: boolean;
  end_of_day_review: boolean;
}
```

### Morning Briefing (`SecretaryBriefing.tsx`)

**Auto-trigger:** Fires once per day when Secretary Mode is ON. Checks `last_briefing_date` in `user_preferences` to avoid repeats.

**Edge Function:** `plan-ai-secretary` with `action: "briefing"`

**Output Sections:**
- 🎯 Top Priorities
- 📅 Today's Meetings
- ⚠️ Conflicts & Suggestions
- ⚡ 3 Commands for Today

**Controls:** Refresh, Dismiss, Copy to WhatsApp

### Pre-Meeting Prep
- Calls `plan-ai-secretary` with `action: "prep"` and `meetingId`
- Available from `MeetingDetailDrawer`

### End-of-Day Review
- Calls `plan-ai-secretary` with `action: "eod"` and `date`
- Available in Notes tab when viewing today

---

## 5. Command Bar (`PlanCommandBar.tsx`)

**Trigger:** `⌘K` keyboard shortcut or Search button in header

**Sections:**
1. **Quick Create** — New Task / New Reminder / New Meeting
2. **Navigate** — Jump to any tab (Today, Tasks, Reminders, Meetings, Calendar, Notes)
3. **Search Results** — Filtered tasks, reminders, meetings (top 5 each) matching search query

**Features:**
- Voice input integrated in search bar
- Fuzzy text matching on titles
- Click any result to open its detail drawer

---

## 6. Detail Drawers

### TaskDetailDrawer

**File:** `src/components/plan/TaskDetailDrawer.tsx` (211 lines)

| Feature | Detail |
|---------|--------|
| **View mode** | Title, description, priority badge, status badge, due date, created date, source |
| **Edit mode** | Inline form for title, description, priority, due date |
| **Project link** | Clickable link to project page (`/projects?open={project_id}`) |
| **Toggle done** | Mark Done / Mark Pending button |
| **Snooze** | +3h / Tomorrow (+24h) / Next Week (+168h) — updates `due_date` |
| **Convert** | "Convert to Reminder" — creates reminder with task's title and due date |
| **Delete** | Soft delete with confirmation |

### ReminderDetailDrawer

| Feature | Detail |
|---------|--------|
| **Toggle done** | Checkbox to mark complete |
| **Convert to Meeting** | Pre-fills meeting form with reminder title, auto-detects video links |
| **Delete** | Soft delete |
| **Meeting created callback** | Invalidates meetings query |

### MeetingDetailDrawer

| Feature | Detail |
|---------|--------|
| **View/Edit** | Title, start/end time, location, attendees, notes |
| **Pre-meeting prep** | AI preparation (Secretary Mode) |
| **Delete** | Soft delete |

---

## 7. Voice Command System

**Parser:** `src/lib/voiceCommandParser.ts`

**Supported Intents:**
| Intent | Example | Action |
|--------|---------|--------|
| `create_task` | "I need to review the report tomorrow" | Creates task with parsed title and date |
| `create_reminder` | "Remind me to call John at 3pm" | Creates reminder with parsed time |
| `create_meeting` | "Schedule a meeting with Sarah at 2pm for 30 minutes" | Creates meeting with duration |
| `add_expense` | "Spent R500 on groceries" | Creates finance entry |
| `add_income` | "Received R10000 from client" | Creates finance entry |
| `open_page` | "Open email" | Navigates to page |
| `run_briefing` | "Give me my briefing" | Navigates to dashboard |

**Flow:**
1. `VoiceInput` captures transcript via Web Speech API
2. `parseVoiceCommand()` extracts intent, title, date, duration, location, amount
3. `VoiceConfirmation` card shows parsed command for review
4. User confirms → entity created via appropriate service
5. All relevant query keys invalidated

---

## 8. Database Triggers

### Auto Meeting Reminder
```sql
-- Trigger: auto_create_meeting_reminder
-- On INSERT/UPDATE of meetings table
-- Creates a reminder 1 hour before meeting start_time
-- Title: "📅 Meeting in 1 hour: {title}"
-- Description: "auto-meeting-{meeting_id}" (used as identifier for cleanup)
```

### Auto Delete Meeting Reminder
```sql
-- Trigger: auto_delete_meeting_reminder
-- On UPDATE of meetings table when deleted_at changes from NULL to non-NULL
-- Deletes the auto-created reminder
```

---

## 9. Cross-Module Integration

### Plan → Email
- Tasks created from emails have `source: "email"` tag
- Email action log tracks `email_id → task_id` mapping

### Plan → Projects
- Tasks, reminders, and meetings can have `project_id` FK
- Project name displayed via lookup map from `projects` table
- TaskDetailDrawer links to project page
- Note extraction can target a specific project via `project_id` param

### Plan → Finance
- Voice commands support `add_expense` and `add_income` intents
- Creates `finance_entries` via `financeEntryService`

### Plan → Notes → Tasks (Extract + Apply Pipeline)
1. User writes notes (freeform or structured)
2. AI extracts actionable items (tasks, reminders)
3. User reviews and selects items to apply
4. `bulkUpsert` creates/merges tasks with dedupe protection
5. `WriteReceipt` shows results with verification count
6. Auto-navigates to Tasks tab with highlight param

### Plan → WhatsApp/Web Capture
- Chrome extension captures content and creates tasks/reminders
- Same `dedupe_key` system prevents duplicates
- Same `WriteReceipt` pattern for feedback

---

## 10. Mobile Optimizations

| Feature | Implementation |
|---------|---------------|
| **Quick Add FAB** | Fixed bottom-right floating button (hidden on desktop) with expandable menu for Task/Reminder/Meeting + Voice |
| **Tab scrolling** | Horizontal scroll on tab bar with `-mx-4 px-4` overflow |
| **Bottom nav** | App-level bottom nav (Home, Plan, Email, Finance, More) |
| **Touch targets** | All clickable items use `active:scale-[0.99]` for tactile feedback |
| **Responsive grid** | Stats cards use `grid-cols-3`, calendar cells use `min-h-[80px] md:min-h-[100px]` |

---

## 11. Legacy Route Redirects

| Old Route | Redirects To |
|-----------|-------------|
| `/tasks` | `/plan?tab=tasks` |
| `/reminders` | `/plan?tab=reminders` |
| `/meetings` | `/plan?tab=meetings` |
| `/calendar` | `/plan?tab=calendar` |

---

## 12. Edge Functions

| Function | Purpose | Trigger |
|----------|---------|---------|
| `plan-ai-secretary` | Morning briefing, pre-meeting prep, EOD review | Secretary Mode actions |
| `plan-ai-extract-actions` | Extract tasks/reminders from note text | "Extract Actions" button in Notes tab |

---

## 13. Query Param API

| Param | Type | Purpose |
|-------|------|---------|
| `tab` | string | Active tab (`today\|tasks\|reminders\|meetings\|calendar\|notes`) |
| `highlight` | CSV string | Comma-separated IDs to pulse-highlight in task list |
| `source` | string | Origin of navigation (e.g., `note_extract`) |
| `note_date` | string | Date of source note (shown in import banner) |
| `project_id` | string | Filter tasks by project |
