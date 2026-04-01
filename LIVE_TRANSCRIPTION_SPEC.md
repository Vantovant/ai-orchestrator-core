# VantoOS Live Transcription — Full Technical Specification

> Complete specification for the live voice-to-text transcription system used in VantoOS Plan Hub Notes.
> Includes platform behavior, Android troubleshooting guide, and AI integration pathway.

---

## 1. System Overview

The Live Transcription system converts spoken audio to text in real time, displaying interim (partial) text as the user speaks and committing finalized text to the note body. It is built on the browser's **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`).

### 1.1 Design Goals

| Goal                        | How It's Achieved                                              |
|-----------------------------|----------------------------------------------------------------|
| Real-time live preview      | `interimResults = true` — shows partial text as user speaks    |
| Long-form dictation         | `continuous = true` + auto-restart on session end              |
| No API key required         | Uses browser-native speech engine (free, zero config)          |
| Duplicate-free output       | 4-step dedup pipeline (index tracking, normalize, delta, emit) |
| Works on mobile             | Touch-friendly UI, visibility guards, Android-specific fixes   |
| Portable/reusable           | Decoupled hook (`useDictation`) + thin UI (`DictationMic`)     |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Host Component                           │
│              (NotesTab / ProjectNotes / Any)                  │
│                                                              │
│   ┌────────────────────────────────────────────────────────┐ │
│   │           DictationMic (UI Layer)                      │ │
│   │   • Start/Stop toggle button                           │ │
│   │   • Live interim text display                          │ │
│   │   • Pulsing animation during listening                 │ │
│   │   • Undo last appended segment                         │ │
│   └───────────────┬────────────────────────────────────────┘ │
│                   │  onAppend(text) / onUndo()               │
│   ┌───────────────▼────────────────────────────────────────┐ │
│   │          useDictation Hook (Core Engine)               │ │
│   │   • Creates & manages SpeechRecognition instance       │ │
│   │   • Continuous restart loop (250ms delay)              │ │
│   │   • Index-based + substring deduplication              │ │
│   │   • Separates interim vs final results                 │ │
│   │   • Tab visibility guard                               │ │
│   └───────────────┬────────────────────────────────────────┘ │
│                   │                                          │
│   ┌───────────────▼────────────────────────────────────────┐ │
│   │       Browser SpeechRecognition API                    │ │
│   │   • Chrome/Edge: Google cloud servers                  │ │
│   │   • Safari: On-device Apple engine                     │ │
│   │   • Android Chrome: Google servers via device mic      │ │
│   └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Core Engine — `useDictation` Hook

**File:** `src/hooks/useDictation.ts`

### 3.1 Configuration

```typescript
const recognition = new SpeechRecognition();
recognition.continuous = true;       // Keep session alive across pauses
recognition.interimResults = true;   // Show live partial text
recognition.lang = "en-ZA";         // South African English
```

### 3.2 Live Transcription Data Flow

```
User speaks into microphone
        │
        ▼
┌─────────────────────────────────┐
│  Browser captures audio chunks  │
│  Sends to speech engine         │
│  (Google servers on Chrome/Edge,│
│   Apple on-device on Safari)    │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  recognition.onresult fires     │
│  with SpeechRecognitionEvent    │
│                                 │
│  event.results[i] contains:     │
│    .isFinal (boolean)           │
│    [0].transcript (string)      │
│    [0].confidence (number)      │
└────────┬────────────────────────┘
         │
         ├── isFinal = false ──► setInterimText(text)
         │                       (shown live in UI, NOT saved)
         │
         └── isFinal = true ───► Deduplication Pipeline
                                  │
                                  ▼
                          ┌───────────────────┐
                          │ 1. Index tracking  │ Skip if index already committed
                          │ 2. Normalize       │ Collapse whitespace, trim
                          │ 3. Substring delta │ Remove overlap with last commit
                          │ 4. Emit            │ onTranscript(finalText)
                          └───────────────────┘
```

### 3.3 Interim vs Final — What the User Sees

| Phase                  | What Happens                                    | What User Sees                           |
|------------------------|-------------------------------------------------|------------------------------------------|
| **Speaking**           | Browser sends interim results every ~200-500ms  | Live italic text: "Meeting with..."      |
| **Pause/breath**       | Browser finalizes the segment                   | Text committed to note, interim clears   |
| **Keeps speaking**     | New interim results arrive                      | New live text appears                    |
| **Long pause (>5s)**   | Browser may end session                         | Engine auto-restarts in 250ms            |
| **Presses Stop**       | `shouldContinueRef = false`                     | Button returns to "Dictate", state idle  |

### 3.4 Continuous Restart Mechanism

Browsers silently terminate speech sessions after ~60 seconds or during network hiccups. The engine handles this transparently:

```typescript
recognition.onend = () => {
  if (shouldContinueRef.current) {
    setTimeout(() => {
      if (shouldContinueRef.current) {
        committedIndicesRef.current.clear();  // Reset for fresh session
        try { recognition.start(); } catch {}
      }
    }, 250);  // Prevent InvalidStateError
    return;
  }
  setState("idle");
  setInterimText("");
};
```

**Key details:**
- 250ms delay prevents `InvalidStateError` from calling `.start()` too fast
- `committedIndicesRef` is cleared because each new session resets result indices to 0
- User never sees this restart — it's seamless

### 3.5 Deduplication Pipeline (4 Steps)

```typescript
// Step 1: Index tracking — only process each result index once
if (!committedIndicesRef.current.has(i)) {
  committedIndicesRef.current.add(i);
  newFinal += transcript;
}

// Step 2: Normalize — collapse whitespace
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Step 3: Substring delta — remove overlap with previous commit
let toAppend = normalized;
if (lastCommittedRef.current && normalized.startsWith(lastCommittedRef.current)) {
  toAppend = normalize(normalized.slice(lastCommittedRef.current.length));
}

// Step 4: Emit — send clean text to host component
if (toAppend) {
  lastCommittedRef.current = normalized;
  setLastAppended(toAppend);
  onTranscriptRef.current(toAppend);
}
```

### 3.6 Tab Visibility Guard

```typescript
// Stops recognition when tab/app goes to background
const handleHidden = () => {
  if (document.hidden && shouldContinueRef.current) {
    shouldContinueRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
    setState("idle");
    setInterimText("");
  }
};
document.addEventListener("visibilitychange", handleHidden);
```

**Why this matters on mobile:** Android aggressively suspends background tabs. Without this guard, the engine enters a broken restart loop when the user switches apps.

---

## 4. Platform Behavior Matrix

### 4.1 Desktop

| Browser        | Live Interim | Continuous Restart | Notes                         |
|----------------|--------------|--------------------|-------------------------------|
| Chrome 33+     | ✅ Smooth    | ✅ Works           | Best support, Google servers  |
| Edge 79+       | ✅ Smooth    | ✅ Works           | Same Chromium engine          |
| Safari 14.1+   | ✅ Works     | ⚠️ Shorter sessions | Apple on-device, 30s limit   |
| Firefox        | ❌ No API    | ❌                 | `supported = false`, UI hides |

### 4.2 Mobile — The Critical Differences

| Platform             | Live Interim | Continuous | Known Issues                             |
|----------------------|--------------|------------|------------------------------------------|
| **Android Chrome**   | ⚠️ Delayed   | ⚠️ Fragile  | See Section 5 below                      |
| **Android Edge**     | ⚠️ Delayed   | ⚠️ Fragile  | Same Chromium base, same issues           |
| **Android WebView**  | ❌ Often fails | ❌         | Many WebView builds lack the API          |
| **iOS Safari**       | ✅ Works     | ⚠️ Short   | Stops on screen lock, 30s sessions        |
| **iOS Chrome**       | ✅ Works     | ⚠️ Short   | Uses Safari's engine underneath (WKWebView)|

---

## 5. Android-Specific Issues & Solutions

### 5.1 Problem: Interim Results Not Showing on Android

**Root cause:** Android Chrome's `SpeechRecognition` implementation has different timing behavior than desktop. Specifically:

1. **Interim results fire less frequently** — Desktop Chrome sends interim results every ~200ms. Android Chrome batches them and may send every ~500-1000ms or only on finalization.

2. **`continuous = true` behaves differently** — On Android, the browser often ignores `continuous` and stops after the first final result, treating it like `continuous = false`.

3. **`onend` fires immediately after first final result** — Instead of staying open for more speech, Android terminates the session.

### 5.2 Solution: Android-Resilient Configuration

Here is exactly how VantoOS handles this:

```typescript
// The auto-restart in onend is the KEY fix for Android
recognition.onend = () => {
  if (shouldContinueRef.current) {
    setTimeout(() => {
      if (shouldContinueRef.current) {
        committedIndicesRef.current.clear();
        try { recognition.start(); } catch {}
      }
    }, 250);  // Android needs this delay — do NOT reduce below 200ms
    return;
  }
  setState("idle");
  setInterimText("");
};
```

**Why this works on Android:** Even though Android kills the session after each final result, the `onend` handler immediately restarts it. The user sees a tiny gap (~250ms) but the experience feels continuous.

### 5.3 Additional Android Tips for Your Other Project

If you are building a separate project and struggling with Android live transcription, apply these exact fixes:

#### Tip 1: Increase Restart Delay to 300-500ms on Android

```typescript
// Detect Android
const isAndroid = /android/i.test(navigator.userAgent);
const RESTART_DELAY = isAndroid ? 400 : 250;

recognition.onend = () => {
  if (shouldContinue) {
    setTimeout(() => {
      if (shouldContinue) {
        try { recognition.start(); } catch {}
      }
    }, RESTART_DELAY);
    return;
  }
};
```

**Why:** Android's audio subsystem takes longer to release the microphone. 250ms sometimes causes `InvalidStateError` on Android.

#### Tip 2: Force `continuous = false` on Android and Self-Restart

```typescript
const isAndroid = /android/i.test(navigator.userAgent);

const recognition = new SpeechRecognition();
recognition.continuous = !isAndroid;  // false on Android
recognition.interimResults = true;
```

**Why:** Android Chrome partially supports `continuous = true` but behaves unpredictably. Using `continuous = false` and relying on auto-restart gives more consistent behavior.

#### Tip 3: Handle the Android "Not Allowed" Error

```typescript
recognition.onerror = (e) => {
  if (e.error === "not-allowed") {
    // Android requires explicit microphone permission
    // The user must grant mic access in Chrome settings
    showPermissionPrompt();
    return;
  }
  if (e.error === "no-speech" || e.error === "aborted") return;
  // ... handle other errors
};
```

#### Tip 4: Keep Screen Awake During Dictation

Android may throttle background audio when the screen dims:

```typescript
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch {}
}

function releaseWakeLock() {
  wakeLock?.release();
  wakeLock = null;
}

// Call requestWakeLock() when starting dictation
// Call releaseWakeLock() when stopping
```

#### Tip 5: Commit Interim Text on Stop (Android Safety Net)

On Android, pressing Stop may not trigger a final result for in-progress speech. Save the interim text as a fallback:

```typescript
const stop = useCallback(() => {
  shouldContinueRef.current = false;

  // Android safety net: commit interim text if we have it
  const currentInterim = interimTextRef.current;
  if (currentInterim && currentInterim.length > 3) {
    onTranscriptRef.current(currentInterim);
  }

  try { recognitionRef.current?.stop(); } catch {}
  setState("idle");
  setInterimText("");
}, []);
```

#### Tip 6: Add User Feedback for Listening State

On Android, the gap between sessions can confuse users. Add visual feedback:

```typescript
// Show a pulsing dot or animation during listening
{isListening && (
  <span className="animate-pulse text-red-500">●</span>
)}

// Show interim text prominently — this confirms mic is active
{isListening && (
  <span className="italic text-muted-foreground">
    {interimText || "Listening… speak now"}
  </span>
)}
```

---

## 6. Complete State Machine

```
                    ┌──────────┐
                    │   IDLE   │ ◄──── Initial state
                    └────┬─────┘
                         │ User presses Start
                         ▼
                    ┌──────────┐
             ┌─────│LISTENING │◄────────────────┐
             │     └────┬─────┘                  │
             │          │                        │
             │     onresult fires                │
             │          │                        │
             │     ┌────▼──────┐                 │
             │     │ isFinal?  │                 │
             │     └────┬──┬───┘                 │
             │          │  │                     │
             │    No    │  │  Yes                │
             │          │  │                     │
             │          ▼  ▼                     │
             │   Update  Dedup Pipeline          │
             │   interim  │                      │
             │   text     ▼                      │
             │          Emit to host             │
             │          (onTranscript)            │
             │          │                        │
             │     ┌────▼──────┐                 │
             │     │ onend     │                 │
             │     └────┬──┬───┘                 │
             │          │  │                     │
             │  shouldContinue?                  │
             │     false │  │ true               │
             │          │  │                     │
             │          ▼  └─── wait 250ms ──────┘
             │     ┌────────┐    restart
             │     │  IDLE  │
             │     └────────┘
             │
             │ User presses Stop
             │ OR tab hidden
             │ OR fatal error
             ▼
        ┌──────────┐
        │   IDLE   │
        └──────────┘
```

---

## 7. Error Handling Matrix

| Error Code         | Platform     | Behavior                                | User Impact          |
|--------------------|--------------|-----------------------------------------|----------------------|
| `no-speech`        | All          | Ignored, session continues              | None                 |
| `aborted`          | All          | Ignored, auto-restart kicks in          | None                 |
| `not-allowed`      | Android/iOS  | Stop listening, show permission prompt  | Must grant mic access|
| `network`          | Chrome       | Stop listening (needs internet)         | Show offline message |
| `audio-capture`    | All          | Mic hardware issue                      | Show error toast     |
| `service-not-allowed` | Firefox   | `supported = false`, UI hidden          | Feature unavailable  |

---

## 8. How Text Flows from Voice to Note

```
Voice Audio
    │
    ▼
useDictation hook
    │ onTranscript("meeting with client about contract")
    │
    ▼
DictationMic component
    │ handleTranscript → onAppend(text)
    │ toast.success("Dictation added to note")
    │
    ▼
NotesTab (host component)
    │ setContent(prev => prev + " " + text)
    │
    ▼
useNotesSync hook
    │ Debounced 1500ms autosave
    │
    ▼
Supabase notes table
    │ Upsert with user_id + note_date key
    │
    ▼
Persisted across devices via Realtime sync
```

---

## 9. AI Integration Layer

### 9.1 Post-Dictation AI Processing

After text is committed to the note, the AI layer can process it:

```
Committed note text
    │
    ├──► ActionExtractor component
    │    Scans for task/meeting/reminder patterns
    │    Creates entities in their respective tables
    │    Does NOT modify the original note text
    │
    ├──► Background AI Advisor (meetings only)
    │    Debounced 3000ms, min 50 chars
    │    Calls plan-ai-secretary with action: "meeting_advisor"
    │    Shows contextual suggestions in collapsible panel
    │
    └──► Manual "Extract + Apply"
         User clicks to extract actions from note
         Calls plan-ai-extract-actions edge function
         Creates tasks/meetings/reminders with dedup keys
```

### 9.2 AI-Enhanced Transcription (Future Path)

For professional-grade transcription that works reliably on ALL platforms including Android:

| Approach                  | How                                                  | Benefit                           |
|---------------------------|------------------------------------------------------|-----------------------------------|
| **ElevenLabs Scribe**     | WebSocket realtime transcription via `useScribe` hook | Low-latency, works on all browsers|
| **Google Cloud STT**      | Edge function with audio upload                      | Highest accuracy, speaker diarization |
| **Whisper (OpenAI)**      | Edge function, batch processing                      | Excellent accuracy, 90+ languages |
| **On-device (future)**    | Web Neural Network API                               | Offline, privacy-first           |

**ElevenLabs Scribe** is the recommended upgrade path because:
1. It uses WebSocket — works identically on desktop and Android
2. No browser API dependency — bypasses all Android quirks
3. Provides word-level timestamps
4. Voice Activity Detection (VAD) built in

Implementation pattern:
```typescript
// Token generation via edge function
const { data } = await supabase.functions.invoke("elevenlabs-scribe-token");

// Client-side realtime transcription
const scribe = useScribe({
  modelId: "scribe_v2_realtime",
  commitStrategy: "vad",
  onPartialTranscript: (data) => setInterimText(data.text),
  onCommittedTranscript: (data) => onAppend(data.text),
});

await scribe.connect({ token: data.token, microphone: { noiseSuppression: true } });
```

---

## 10. Complete File Inventory

| File                                    | Role                                  | Lines |
|-----------------------------------------|---------------------------------------|-------|
| `src/hooks/useDictation.ts`             | Core transcription engine (hook)      | 160   |
| `src/components/plan/DictationMic.tsx`  | UI wrapper (button + interim display) | 76    |
| `src/components/voice/VoiceInput.tsx`   | Voice Commands (separate system)      | 251   |
| `src/lib/voiceCommandParser.ts`         | NLP intent parser (not dictation)     | —     |
| `src/hooks/useNotesSync.ts`             | Autosave to Supabase (1500ms)         | —     |
| `src/components/plan/NotesTab.tsx`      | Host component for diary notes        | —     |
| `src/components/plan/ActionExtractor.tsx`| AI action extraction from notes      | —     |

---

## 11. Quick-Start Guide for Porting to Another Project

### Step 1: Copy These Files
```
src/hooks/useDictation.ts        → your-project/src/hooks/useDictation.ts
src/components/plan/DictationMic.tsx → your-project/src/components/DictationMic.tsx
```

### Step 2: Install Dependencies
The engine has zero external dependencies. It only needs React and your UI library (Button, Tooltip from shadcn/ui).

### Step 3: Wire Up
```typescript
import DictationMic from "@/components/DictationMic";

function MyNotesPage() {
  const [content, setContent] = useState("");

  return (
    <div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write or dictate..."
      />
      <DictationMic
        onAppend={(text) => setContent(prev => prev ? `${prev} ${text}` : text)}
        compact
      />
    </div>
  );
}
```

### Step 4: Android Hardening (Apply All Tips from Section 5)
```typescript
// In your copy of useDictation.ts, add:
const isAndroid = /android/i.test(navigator.userAgent);
const RESTART_DELAY = isAndroid ? 400 : 250;

// Use RESTART_DELAY in the onend handler
// Set continuous = !isAndroid
// Add wake lock request/release
// Add interim-text-on-stop safety net
```

### Step 5: Test
1. Desktop Chrome — should work immediately
2. Desktop Edge — should work immediately
3. Android Chrome — apply Section 5 tips, test with screen on/off
4. iOS Safari — test, expect shorter sessions

---

## 12. Troubleshooting Checklist

| Symptom                                    | Likely Cause                        | Fix                                           |
|--------------------------------------------|-------------------------------------|------------------------------------------------|
| No interim text on Android                 | `continuous = true` breaking Android| Set `continuous = false`, rely on auto-restart  |
| Dictation stops after first sentence       | Browser kills session, no restart   | Ensure `onend` auto-restart is implemented     |
| Duplicate text appearing                   | Missing index tracking or delta check| Implement full 4-step dedup pipeline           |
| "Not allowed" error                        | Mic permission not granted          | Prompt user, check `navigator.permissions`     |
| Works on Wi-Fi, fails on mobile data       | Network too slow for Google servers | Add timeout handling, consider offline fallback |
| Text disappears when switching apps        | Tab visibility killed the session   | Visibility guard saves state before stopping   |
| Button stuck on "Listening" (no response)  | Session started but mic blocked     | Add timeout: if no result in 5s, show error    |
| Interim text shows but nothing commits     | `isFinal` never fires (rare)       | Add manual commit timer (e.g., 10s of interim) |
