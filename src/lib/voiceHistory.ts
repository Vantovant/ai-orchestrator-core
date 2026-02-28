// Client-side voice transcript history (last 20, localStorage-backed)

const STORAGE_KEY = "voice_transcript_history";
const MAX_ENTRIES = 20;

export interface VoiceHistoryEntry {
  transcript: string;
  intent: string;
  timestamp: number;
}

export function getVoiceHistory(): VoiceHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addVoiceHistoryEntry(entry: Omit<VoiceHistoryEntry, "timestamp">): void {
  const history = getVoiceHistory();
  history.unshift({ ...entry, timestamp: Date.now() });
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearVoiceHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
