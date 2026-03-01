import { useState, useEffect, useCallback, useRef } from "react";

export type DictationState = "idle" | "listening";

interface UseDictationOptions {
  onTranscript: (text: string) => void;
  continuous?: boolean;
}

interface UseDictationReturn {
  state: DictationState;
  supported: boolean;
  interimText: string;
  start: () => void;
  stop: () => void;
  lastAppended: string | null;
  undoLast: () => void;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function useDictation({ onTranscript, continuous = true }: UseDictationOptions): UseDictationReturn {
  const [state, setState] = useState<DictationState>("idle");
  const [supported, setSupported] = useState(true);
  const [interimText, setInterimText] = useState("");
  const [lastAppended, setLastAppended] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Track committed text to prevent duplicates
  const lastCommittedRef = useRef<string>("");
  // Flag: should we keep listening (auto-restart on browser end)?
  const shouldContinueRef = useRef(false);
  // Track which result indices have been committed within a session
  const committedIndicesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = "en-ZA";

    recognition.onresult = (event: any) => {
      let newFinal = "";
      let newInterim = "";

      // Scan ALL results but only commit each final index once
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          if (!committedIndicesRef.current.has(i)) {
            committedIndicesRef.current.add(i);
            newFinal += transcript;
          }
        } else {
          newInterim += transcript;
        }
      }

      // Show interim text live (never saved to note)
      setInterimText(normalize(newInterim));

      if (newFinal) {
        const normalized = normalize(newFinal);
        if (normalized && normalized !== lastCommittedRef.current) {
          // Substring dedup: if new text starts with last committed, only take delta
          let toAppend = normalized;
          if (lastCommittedRef.current && normalized.startsWith(lastCommittedRef.current)) {
            toAppend = normalize(normalized.slice(lastCommittedRef.current.length));
          }
          if (toAppend) {
            lastCommittedRef.current = normalized;
            setLastAppended(toAppend);
            onTranscriptRef.current(toAppend);
          }
        }
        setInterimText("");
      }
    };

    recognition.onerror = (e: any) => {
      // Ignore transient errors in continuous mode
      if (e.error === "no-speech" || e.error === "aborted") return;
      shouldContinueRef.current = false;
      setState("idle");
    };

    recognition.onend = () => {
      // Auto-restart if user hasn't pressed stop
      if (shouldContinueRef.current) {
        setTimeout(() => {
          if (shouldContinueRef.current) {
            // Clear committed indices for the fresh recognition session
            committedIndicesRef.current.clear();
            try { recognition.start(); } catch {}
          }
        }, 250);
        return;
      }
      setState("idle");
      setInterimText("");
    };

    recognitionRef.current = recognition;

    return () => {
      shouldContinueRef.current = false;
      try { recognition.stop(); } catch {}
    };
  }, [continuous]);

  // Stop on tab hidden
  useEffect(() => {
    const handleHidden = () => {
      if (document.hidden && shouldContinueRef.current) {
        shouldContinueRef.current = false;
        try { recognitionRef.current?.stop(); } catch {}
        setState("idle");
        setInterimText("");
      }
    };
    document.addEventListener("visibilitychange", handleHidden);
    return () => document.removeEventListener("visibilitychange", handleHidden);
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    lastCommittedRef.current = "";
    committedIndicesRef.current.clear();
    setInterimText("");
    shouldContinueRef.current = true;
    try {
      recognitionRef.current.start();
      setState("listening");
    } catch {}
  }, []);

  const stop = useCallback(() => {
    shouldContinueRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
    setState("idle");
    setInterimText("");
  }, []);

  const undoLast = useCallback(() => {
    setLastAppended(null);
  }, []);

  return { state, supported, interimText, start, stop, lastAppended, undoLast };
}
