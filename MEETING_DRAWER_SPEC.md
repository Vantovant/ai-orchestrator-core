# Meeting Detail Drawer — Technical Specification

> **Component:** `src/components/plan/MeetingDetailDrawer.tsx`  
> **Service:** `src/services/meetingService.ts`  
> **Hook:** `src/hooks/useMeetingAdvisor.ts` (internal)  
> **Last Updated:** March 2026

---

## 1. Component Overview

The **Meeting Detail Drawer** is a slide-out panel that provides comprehensive meeting management within the Plan Hub. It serves as the primary interface for viewing, editing, and enriching meeting data with AI-powered assistance.

### Purpose
- View and edit meeting details (title, time, location, attendees)
- Manage meeting notes and agenda with real-time AI assistance
- Extract actionable tasks from meeting notes without losing original content
- Track meeting completion status
- Receive strategic guidance during active meetings

### Position in Architecture
```
PlanPage.tsx
├── MeetingDetailDrawer (slide-out panel)
│   ├── Header (title, time, status)
│   ├── Meta Fields (location, attendees)
│   ├── Notes Section (editable + AI features)
│   │   ├── ActionExtractor (task creation)
│   │   └── AI Advisor Panel (live suggestions)
│   └── Footer Actions (save, delete, prep)
```

---

## 2. UI Layout & Structure

### Drawer Configuration
| Property | Value |
|----------|-------|
| Width | Desktop: 480px / Mobile: 100vw |
| Anchor | Right side slide-in |
| Backdrop | Dimmed overlay with click-to-close |
| Animation | 300ms ease-out slide |

### Layout Zones

```
┌─────────────────────────────────────┐
│ ✕  [Meeting Title - Editable]       │  ← Header
│    [Date/Time - Editable]           │
├─────────────────────────────────────┤
│ Location: [____________]            │  ← Meta Fields
│ Attendees: [___________]            │
├─────────────────────────────────────┤
│ AI Advisor ▼                        │  ← Collapsible Panel
│ • Ask about budget timeline         │
│ • Clarify decision-maker roles      │
├─────────────────────────────────────┤
│ 📝 Meeting Notes & Agenda           │  ← Main Content
│ ┌─────────────────────────────────┐ │
│ │ [Editable Text Area]             │ │
│ │ - Discuss Q2 roadmap            │ │
│ │ - Review proposal draft         │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ [Extract Actions] [🤖 AI Prep]    │  ← Action Bar
├─────────────────────────────────────┤
│ ☐ Mark as Complete                  │  ← Status
│ [Save Changes] [Delete Meeting]   │  ← Footer
└─────────────────────────────────────┘
```

### Responsive Behavior
| Viewport | Behavior |
|----------|----------|
| Desktop (>768px) | Slide-out from right, 480px width |
| Mobile (<768px) | Bottom sheet, full width, rounded top corners |
| Very Small (<360px) | Full screen takeover |

---

## 3. Data Layer

### Meeting Interface
```typescript
interface Meeting {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_time: string;        // ISO 8601
  end_time: string;          // ISO 8601
  location: string | null;
  attendees: string[] | null;  // JSON array
  notes: string | null;      // Meeting agenda/notes
  project_id: string | null;
  is_done: boolean;          // Completion status
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface MeetingInsert {
  title: string;
  start_time: string;
  end_time: string;
  description?: string;
  location?: string;
  attendees?: string[];
  notes?: string;
  project_id?: string;
  is_done?: boolean;
}
```

### Service Methods

```typescript
// meetingService.ts
export const meetingService = {
  async list(): Promise<Meeting[]>
  async create(meeting: MeetingInsert): Promise<Meeting>
  async update(id: string, updates: Partial<MeetingInsert>): Promise<Meeting>
  async toggleDone(id: string, is_done: boolean): Promise<Meeting>
  async softDelete(id: string): Promise<void>
}
```

### React Query Keys
```typescript
["meetings"]                    // Full meeting list
["meeting", id]                 // Single meeting (optional caching)
["projects"]                    // Project name lookup for badges
```

---

## 4. Core Features

### 4.1 Meeting Editing

All fields are editable inline within the drawer:

| Field | Input Type | Validation |
|-------|------------|------------|
| Title | Text input | Required, max 200 chars |
| Start/End Time | DateTime picker | End must be after start |
| Location | Text input | Optional |
| Attendees | Tag input (comma-separated) | Auto-split on comma |
| Notes | Textarea (8 rows) | Preserves newlines |
| Project | Select dropdown | Optional FK to projects |

**Auto-save Behavior:**
- Individual field blur triggers `meetingService.update()`
- Notes textarea uses 1500ms debounce
- Optimistic UI updates with rollback on error

### 4.2 Meeting Notes & Agenda

**Textarea Specifications:**
- Min height: 200px (desktop), 150px (mobile)
- Font: Monospace for consistent formatting
- Placeholder: "Add agenda items, notes, or discussion points..."
- Features: Auto-expand on input

**Data Flow:**
```
User Types → Debounce 1500ms → meetingService.update()
                    ↓
            Trigger AI Advisor (3000ms debounce)
```

### 4.3 AI Pre-Meeting Prep

**Trigger:** "🤖 AI Prep" button in action bar

**Edge Function:** `plan-ai-secretary` with action `"prep"`

**Payload:**
```typescript
{
  action: "prep",
  meetingId: string,
  title: string,
  start_time: string,
  attendees: string[],
  project_id?: string
}
```

**Response Format:**
```typescript
{
  agenda: string[];           // Suggested agenda items
  risks: string[];            // Potential risks to address
  talking_points: string[];   // Key discussion topics
  prep_questions: string[];   // Questions to prepare for
}
```

**UI Integration:**
- Results injected into notes textarea as formatted markdown
- User can edit/modify before saving
- Preserves existing notes (prepends with separator)

**Example Injection:**
```markdown
---
🤖 AI-Generated Prep (2026-03-13 09:30)

**Agenda:**
- Review Q2 budget allocation
- Discuss timeline risks

**Talking Points:**
- Emphasize cost savings
- Address resource constraints

---

[User's original notes follow...]
```

### 4.4 Action Extraction

**Purpose:** Convert meeting notes into actionable tasks without losing original text.

**Trigger:** "Extract Actions" button

**Edge Function:** `plan-ai-extract-actions`

**Payload:**
```typescript
{
  text: string,              // Full notes content
  context: "meeting",        // Source context
  meeting_id: string,
  project_id?: string
}
```

**Review Dialog:**
- Modal showing extracted items
- Each item has: type (task/reminder), title, priority, due_date
- Checkboxes to select which items to create
- Estimated time display

**Creation Flow:**
```
Extracted Items
      ↓
[taskService.bulkUpsert()]
      ↓
Deduplication Check (SHA-256 key)
      ↓
Create/Merge → Return WriteReceipt
      ↓
Invalidate ["tasks"] query
      ↓
Show success toast with counts
```

**Deduplication Key:**
```typescript
// SHA-256 of: user_id | project_id | meeting_id | normalized_title
const dedupeKey = hash(`${userId}|${projectId}|${meetingId}|${normalizedTitle}`);
```

**Critical Rule:** Original meeting notes are **never** modified or deleted during extraction.

### 4.5 Background AI Advisor

**Hook:** `useMeetingAdvisor(meetingId, notesText)`

**Behavior:**
- Debounce: 3000ms after last keystroke
- Max calls: Once per 10 seconds (rate limiting)
- Triggers only when notes length > 50 characters

**Edge Function:** `plan-ai-secretary` with action `"meeting_advisor"`

**Request:**
```typescript
{
  action: "meeting_advisor",
  meeting_id: string,
  notes_text: string,        // Last 2000 chars only
  title: string,
  attendees: string[]
}
```

**Response:**
```typescript
{
  suggestions: string[];     // Strategic advice, questions
  risks: string[];          // Identified concerns
  opportunities: string[]; // Actionable insights
}
```

**UI Display:**
- Collapsible panel above notes (default: collapsed)
- Amber accent color for visibility
- One-click copy for any suggestion
- Dismiss individual suggestions

**Example Suggestions:**
```
💡 Advisor Suggestions
─────────────────────
→ Ask about decision-maker authority
→ Clarify budget approval timeline
→ Propose pilot program approach
```

### 4.6 Meeting Completion

**Checkbox Location:** Footer of drawer

**States:**
| State | Visual |
|-------|--------|
| Pending | ☐ Unchecked, label "Mark as Complete" |
| Done | ☑ Checked, label "Completed", green tint |

**Behavior:**
- Toggle calls `meetingService.toggleDone(id, !is_done)`
- Updates meeting list immediately (optimistic)
- Completed meetings shown with strikethrough in list
- Filterable in Meetings tab (All / Upcoming / Done)

---

## 5. Integration Points

### With Projects
- Project badge shows linked project name
- Clicking badge navigates to `/projects?open={project_id}`
- Extracted tasks inherit meeting's `project_id`

### With Tasks
- Action extraction creates tasks in main database
- Tasks appear in Tasks tab with `source: "meeting_extract"`
- Bidirectional linking planned (task → source meeting)

### With Reminders
- Meeting creation auto-generates 1-hour reminder (DB trigger)
- Reminder deletion linked to meeting soft-delete

### With Secretary Service
```typescript
// secretaryService.ts methods used:
async runPreMeetingPrep(meetingId: string): Promise<PrepResult>
async runMeetingAdvisor(meetingId: string, notes: string): Promise<AdvisorResult>
```

---

## 6. State Management

### Local State
```typescript
interface DrawerState {
  meeting: Meeting | null;           // Current meeting data
  isEditing: boolean;              // Edit mode flag
  hasUnsavedChanges: boolean;        // Dirty state for notes
  aiAdvisorOpen: boolean;            // Panel visibility
  extractedActions: ExtractedItem[]; // Pending extraction
  isExtracting: boolean;             // Loading state
  isRunningPrep: boolean;            // AI prep loading
  advisorSuggestions: string[];      // Current AI advice
}
```

### Query Invalidation
```typescript
// After updates:
queryClient.invalidateQueries({ queryKey: ["meetings"] });

// After task extraction:
queryClient.invalidateQueries({ queryKey: ["tasks"] });
```

---

## 7. Edge Functions

### plan-ai-secretary
**Actions Supported:**
- `"prep"` — Pre-meeting preparation
- `"meeting_advisor"` — Real-time suggestions

**PII Handling:**
- All notes text redacted before sending to AI
- PII replaced with `[REDACTED]` tokens
- Redaction logged in `kb_query_log`

### plan-ai-extract-actions
**Purpose:** Extract tasks/reminders from text

**Rate Limiting:**
- Max 10 extractions per minute per user
- Max 2000 characters per request

---

## 8. Database Schema

### meetings Table
```sql
CREATE TABLE public.meetings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    location text,
    attendees jsonb,
    notes text,
    project_id uuid REFERENCES projects(id),
    is_done boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- RLS Policies
CREATE POLICY "Users can CRUD own meetings"
ON meetings FOR ALL
TO authenticated
USING (auth.uid() = user_id);
```

### Auto-Reminder Trigger
```sql
-- Creates reminder 1 hour before meeting
CREATE OR REPLACE FUNCTION auto_create_meeting_reminder()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO reminders (user_id, title, reminder_time, task_id)
    VALUES (
        NEW.user_id,
        '📅 Meeting in 1 hour: ' || NEW.title,
        NEW.start_time - interval '1 hour',
        NEW.id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| Save fails | Toast error, rollback optimistic update |
| AI prep fails | Toast error, don't block UI |
| Extraction fails | Show error in review dialog |
| Advisor fails | Silent fail, retry on next keystroke |
| Network offline | Queue changes, sync on reconnect |

---

## 10. Future Enhancements

- [ ] **Meeting Templates** — Pre-defined agendas for recurring meeting types
- [ ] **Transcription Integration** — Import from meeting recording services
- [ ] **Follow-up Tasks** — Auto-suggest follow-up based on meeting outcomes
- [ ] **Attendee Linking** — Connect attendees to Contacts/Clients module
- [ ] **Meeting Recurrence** — Support for recurring meeting series
- [ ] **Shared Meetings** — Multi-user meeting visibility

---

## 11. Related Documentation

- `PLAN_SPEC.md` — Plan Hub architecture
- `EMAIL_SPEC.md` — Email-to-meeting conversion
- `src/services/meetingService.ts` — Service implementation
- `src/hooks/useMeetingAdvisor.ts` — Custom hook (inline)
- `supabase/functions/plan-ai-secretary/index.ts` — AI edge function

---

*Document Version: 1.0*  
*Component Owner: Plan Hub Module*
