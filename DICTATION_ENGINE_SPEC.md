# VantoOS Dictation Engine — Technical Specification

> Portable voice-to-text transcription module used inside the Plan Hub Notes system.
> This document describes the engine in isolation so it can be reused in any other module.

---

## 1. Overview

The Dictation Engine converts spoken audio into text in real time using the browser's built-in Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). It is designed for **long-form executive dictation** (30–60+ seconds), not short voice commands.

**Key characteristics:**
- Zero external API dependency (runs entirely in-browser)
- Continuous listening with automatic session restart
- Live interim text display while speaking
- Duplicate-proof committed text pipeline
- One-click undo of last appended segment
- Graceful degradation (hides UI if browser lacks support)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│                  Host Component                  │
│         (e.g. NotesTab, ProjectNotes)            │
│                                                  │
│   ┌───────────────────────────────────────────┐  │
│   │         DictationMic (UI Layer)           │  │
│   │  • Start/Stop button                      │  │
│   │  • Interim text display                   │  │
│   │  • Undo button                            │  │
│   └──────────────┬────────────────────────────┘  │
│                  │ onAppend(text)                 │
│                  │ onUndo()                       │
│   ┌──────────────▼────────────────────────────┐  │
│   │       useDictation Hook (Engine)          │  │
│   │  • SpeechRecognition lifecycle            │  │
│   │  • Continuous restart loop                │  │
│   │  • Dedup + normalization pipeline         │  │
│   │  • Interim vs final text separation       │  │
│   └──────────────┬────────────────────────────┘  │
│                  │                                │
│   ┌──────────────▼────────────────────────────┐  │
│   │    Browser SpeechRecognition API          │  │
│   │  • webkitSpeechRecognition (Chrome)       │  │
│   │  • SpeechRecognition (Edge/Safari)        │  │
│   └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 3. Core Engine — `useDictation` Hook

**File:** `src/hooks/useDictation.ts`

### 3.1 Interface

```typescript
interface UseDictationOptions {
  onTranscript: (text: string) => void;  // Called with each finalized text segment
  continuous?: boolean;                   // Default: true — keeps listening after pauses
}

interface UseDictationReturn {
  state: "idle" | "listening";
  supported: boolean;          // false if browser lacks SpeechRecognition
  interimText: string;         // Live preview of what's being heard (not saved)
  start: () => void;           // Begin listening
  stop: () => void;            // Stop listening
  lastAppended: string | null; // Most recent committed text (for undo)
  undoLast: () => void;        // Clear lastAppended reference
}
```

### 3.2 SpeechRecognition Configuration

| Setting            | Value    | Why                                              |
|--------------------|----------|--------------------------------------------------|
| `continuous`       | `true`   | Keeps session alive for long-form dictation       |
| `interimResults`   | `true`   | Shows live text while user is still speaking      |
| `lang`             | `en-ZA`  | South African English locale                      |

### 3.3 Text Processing Pipeline

```
Audio Input
    │
    ▼
┌─────────────────────────┐
│  SpeechRecognition API  │
│  fires `onresult`       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Step 1: Index-Based Dedup         │
│                                     │
│  Each result has a numeric index.   │
│  Track committed indices in a Set.  │
│  Only process final results whose   │
│  index has NOT been committed yet.  │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Step 2: Normalize                 │
│                                     │
│  Collapse whitespace, trim edges.   │
│  normalize(text) →                  │
│    text.replace(/\s+/g, " ").trim() │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Step 3: Substring Dedup           │
│                                     │
│  If new text starts with last       │
│  committed text, only take the      │
│  delta (new portion). Prevents      │
│  the browser from re-sending        │
│  already-committed content.         │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Step 4: Emit                      │
│                                     │
│  Call onTranscript(finalText)       │
│  Update lastAppended for undo      │
│  Clear interim display             │
└─────────────────────────────────────┘
```

### 3.4 Continuous Restart Mechanism

The Web Speech API silently ends sessions after ~60 seconds of audio or on network hiccups. The engine handles this transparently:

```
User presses Start
    │
    ▼
shouldContinueRef = true
recognition.start()
state = "listening"
    │
    ▼
┌─────────────────────────┐
│  recognition.onend      │◄──── Browser auto-stops session
│                         │
│  if shouldContinueRef:  │
│    wait 250ms           │
│    clear committed      │
│    indices              │
│    recognition.start()  │──── Seamless restart
│                         │
│  else:                  │
│    state = "idle"       │──── User pressed Stop
└─────────────────────────┘
```

**Why 250ms delay?** Some browsers throw if you call `.start()` immediately after `.onend`. The delay prevents `InvalidStateError`.

**Why clear committed indices?** Each new recognition session resets its internal result index counter to 0, so the tracking Set must also reset.

### 3.5 Error Handling

| Error Type   | Behavior                                    |
|--------------|---------------------------------------------|
| `no-speech`  | Ignored — user is just pausing              |
| `aborted`    | Ignored — transient browser interruption    |
| All others   | Stop listening, set state to idle           |

### 3.6 Tab Visibility Guard

When the browser tab becomes hidden:
1. Set `shouldContinueRef = false`
2. Stop recognition
3. Set state to idle
4. Clear interim text

**Why?** Browsers suspend audio capture on hidden tabs. Without this guard, the engine would enter a broken restart loop.

---

## 4. UI Layer — `DictationMic` Component

**File:** `src/components/plan/DictationMic.tsx`

### 4.1 Props

```typescript
interface Props {
  onAppend: (text: string) => void;  // Append transcribed text to note content
  onUndo?: () => void;               // Optional: called when user undoes last segment
  compact?: boolean;                  // Smaller button for tight layouts
}
```

### 4.2 UI States

| State                        | Display                                             |
|------------------------------|-----------------------------------------------------|
| Not supported                | Component returns `null` (hidden)                   |
| Idle                         | Outline button with Mic icon + "Dictate" label      |
| Listening                    | Red pulsing button with MicOff icon + "Stop" label  |
| Listening + interim text     | Italic text preview: "Meeting with John about..."   |
| Listening + no speech yet    | Italic text: "Listening…"                           |
| After stop, has lastAppended | Ghost Undo button appears                           |

### 4.3 Toast Feedback

Every successful transcription fires: `toast.success("Dictation added to note")`

---

## 5. Integration Pattern

### 5.1 How Notes Uses Dictation

```typescript
// Inside NotesTab
const handleDictationAppend = (text: string) => {
  // Append to existing note content with a space separator
  setContent(prev => prev ? `${prev} ${text}` : text);
};

<DictationMic onAppend={handleDictationAppend} compact />
```

The host component owns the text state. The dictation engine only **appends** — it never replaces or manages the full document.

### 5.2 Reuse in Another Module

To add dictation to any component:

```typescript
import DictationMic from "@/components/plan/DictationMic";

function MyComponent() {
  const [text, setText] = useState("");

  return (
    <>
      <textarea value={text} onChange={e => setText(e.target.value)} />
      <DictationMic
        onAppend={(spoken) => setText(prev => `${prev} ${spoken}`)}
        onUndo={() => {/* optional: remove last segment */}}
        compact
      />
    </>
  );
}
```

Or use the hook directly for custom UI:

```typescript
import { useDictation } from "@/hooks/useDictation";

const { state, supported, interimText, start, stop } = useDictation({
  onTranscript: (text) => appendToMyField(text),
  continuous: true,
});
```

---

## 6. Difference from Voice Commands

| Aspect              | Dictation (Notes)            | Voice Commands (Header)       |
|---------------------|------------------------------|-------------------------------|
| Purpose             | Long-form text capture       | Short intent parsing          |
| Engine              | `useDictation` hook          | Inline in `VoiceInput`        |
| `continuous`        | `true`                       | `false`                       |
| Output              | Raw text appended to note    | Parsed into task/reminder     |
| Auto-restart        | Yes (seamless)               | No (single-shot)              |
| Noise filtering     | None needed                  | Min length + retry logic      |
| Edit before submit  | No (direct append)           | Yes (editable transcript box) |

---

## 7. Browser Compatibility

| Browser         | Support | Notes                                    |
|-----------------|---------|------------------------------------------|
| Chrome 33+      | ✅      | Best support, uses Google servers         |
| Edge 79+        | ✅      | Chromium-based, same as Chrome            |
| Safari 14.1+    | ✅      | On-device processing, shorter sessions    |
| Firefox         | ❌      | No SpeechRecognition API                  |
| Mobile Chrome   | ✅      | Works but tab-visibility rules apply      |
| Mobile Safari   | ⚠️      | Works but may stop on screen lock         |

The `supported` flag from the hook handles graceful degradation automatically.

---

## 8. Known Limitations

1. **Network dependency (Chrome):** Chrome sends audio to Google servers for recognition. No internet = no transcription.
2. **Session time limit:** Browsers cap sessions at ~60s. The auto-restart mechanism handles this but creates a brief ~250ms gap.
3. **No punctuation intelligence:** The API returns raw spoken text. Punctuation depends on the browser's speech model.
4. **Single language:** Hardcoded to `en-ZA`. Changing locale requires modifying the hook.
5. **No speaker diarization:** Cannot distinguish between multiple speakers.

---

## 9. Future Enhancement Path

| Enhancement                  | Approach                                           |
|------------------------------|----------------------------------------------------|
| Multi-language support       | Pass `lang` as a hook option                       |
| Cloud-grade transcription    | Swap browser API for ElevenLabs Scribe via edge fn |
| Punctuation + formatting     | Post-process with AI via `plan-ai-secretary`       |
| Speaker identification       | Requires external API (ElevenLabs, Deepgram)       |
| Offline support              | Safari's on-device model; no Chrome equivalent     |

---

## 10. File Inventory

| File                                    | Role                          |
|-----------------------------------------|-------------------------------|
| `src/hooks/useDictation.ts`             | Core engine (hook)            |
| `src/components/plan/DictationMic.tsx`  | UI wrapper component          |
| `src/components/voice/VoiceInput.tsx`   | Voice Commands (separate)     |
| `src/lib/voiceCommandParser.ts`         | Intent parser (not dictation) |
