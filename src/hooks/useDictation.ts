import { useState, useEffect, useCallback, useRef } from "react";

export type DictationState = "idle" | "listening" | "transcribing";

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

export function useDictation({ onTranscript, continuous = true }: UseDictationOptions): UseDictationReturn {
  const [state, setState] = useState<DictationState>("idle");
  const [supported, setSupported] = useState(true);
  const [interimText, setInterimText] = useState("");
  const [lastAppended, setLastAppended] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

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
      let finalTranscript = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim += t;
        }
      }
      setInterimText(interim);

      if (finalTranscript) {
        const trimmed = finalTranscript.trim();
        if (trimmed) {
          setLastAppended(trimmed);
          onTranscriptRef.current(trimmed);
        }
        setInterimText("");
      }
    };

    recognition.onerror = (e: any) => {
      // Ignore no-speech / aborted errors in continuous mode
      if (e.error === "no-speech" || e.error === "aborted") return;
      setState("idle");
    };

    recognition.onend = () => {
      // In continuous mode, auto-restart if still in listening state
      if (recognitionRef.current?._shouldContinue) {
        try { recognition.start(); } catch {}
        return;
      }
      setState("idle");
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognitionRef.current._shouldContinue = false;

    return () => {
      recognitionRef.current._shouldContinue = false;
      try { recognition.stop(); } catch {}
    };
  }, [continuous]);

  // Stop on visibility change
  useEffect(() => {
    const handleHidden = () => {
      if (document.hidden && state === "listening") {
        stop();
      }
    };
    document.addEventListener("visibilitychange", handleHidden);
    return () => document.removeEventListener("visibilitychange", handleHidden);
  }, [state]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setInterimText("");
    recognitionRef.current._shouldContinue = true;
    try {
      recognitionRef.current.start();
      setState("listening");
    } catch {}
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current._shouldContinue = false;
    try { recognitionRef.current.stop(); } catch {}
    setState("idle");
    setInterimText("");
  }, []);

  const undoLast = useCallback(() => {
    // Caller handles actual undo; we just clear the reference
    const text = lastAppended;
    setLastAppended(null);
    return text;
  }, [lastAppended]);

  return { state, supported, interimText, start, stop, lastAppended, undoLast };
}
