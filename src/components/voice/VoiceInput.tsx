import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, MicOff, HelpCircle, History, Trash2, Send } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getVoiceHistory, clearVoiceHistory, type VoiceHistoryEntry } from "@/lib/voiceHistory";
import { format } from "date-fns";

interface Props {
  onTranscript: (text: string) => void;
  className?: string;
  compact?: boolean;
}

const VOICE_EXAMPLES = [
  "Add task: call client tomorrow 10am",
  "I need to review the contract by Friday",
  "Remind me to pay UIF tomorrow 9am",
  "I spent R650 on fuel today",
  "Schedule a meeting with team Friday 2pm",
  "What's my plan today",
  "Open finance",
];

const MAX_RETRIES = 1;

export default function VoiceInput({ onTranscript, className = "", compact = false }: Props) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [hint, setHint] = useState("");
  const [historyEntries, setHistoryEntries] = useState<VoiceHistoryEntry[]>([]);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-ZA";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript || interimTranscript);
      if (finalTranscript) {
        const trimmed = finalTranscript.trim();
        if (trimmed.length < 3) {
          // Too short — retry once
          if (retryCount < MAX_RETRIES) {
            setRetryCount((c) => c + 1);
            setHint("Didn't catch that — try again");
            setTranscript("");
            try { recognition.start(); } catch {}
            return;
          }
        }
        setHint("");
        setRetryCount(0);
        setEditText(trimmed);
        setEditMode(true);
        setIsListening(false);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      if (retryCount < MAX_RETRIES) {
        setRetryCount((c) => c + 1);
        setHint("Didn't catch that — try again");
        try { recognition.start(); } catch {}
      }
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;

    return () => {
      try { recognition.stop(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop on blur
  useEffect(() => {
    const handleBlur = () => {
      if (isListening && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        setIsListening(false);
      }
    };
    window.addEventListener("blur", handleBlur);
    const handleVisibility = () => { if (document.hidden) handleBlur(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isListening]);

  const toggle = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript("");
      setHint("");
      setRetryCount(0);
      setEditMode(false);
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  const handleParse = useCallback(() => {
    const text = editText.trim();
    if (text) {
      onTranscript(text);
      setEditMode(false);
      setEditText("");
      setTranscript("");
    }
  }, [editText, onTranscript]);

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditText("");
    setTranscript("");
  }, []);

  if (!supported) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isListening ? "destructive" : "outline"}
              size={compact ? "icon" : "default"}
              onClick={toggle}
              className={`${compact ? "h-9 w-9" : "gap-2"} ${isListening ? "animate-pulse" : ""}`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {!compact && (isListening ? "Stop" : "Voice")}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium mb-1">Voice Examples:</p>
            <ul className="text-xs space-y-0.5">
              {VOICE_EXAMPLES.map((e, i) => (
                <li key={i}>"{e}"</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Listening indicator + hint */}
      {isListening && (
        <span className="text-sm text-muted-foreground italic animate-in fade-in truncate max-w-[200px]">
          {hint || transcript || "Listening…"}
        </span>
      )}
      {!isListening && hint && !editMode && (
        <span className="text-sm text-destructive animate-in fade-in">{hint}</span>
      )}

      {/* Editable transcript box */}
      {editMode && (
        <div className="flex items-center gap-1.5 animate-in slide-in-from-left-2">
          <Input
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="h-8 text-sm w-48 md:w-64"
            placeholder="Edit transcript…"
            onKeyDown={(e) => { if (e.key === "Enter") handleParse(); if (e.key === "Escape") handleCancelEdit(); }}
            autoFocus
          />
          <Button size="icon" variant="default" className="h-8 w-8" onClick={handleParse} title="Parse">
            <Send className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancelEdit} title="Cancel">
            ✕
          </Button>
        </div>
      )}

      {/* History popover */}
      <Popover onOpenChange={(open) => { if (open) setHistoryEntries(getVoiceHistory()); }}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <History className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" side="bottom" align="end">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">Voice History</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs text-muted-foreground"
              onClick={() => { clearVoiceHistory(); setHistoryEntries([]); }}
            >
              <Trash2 className="h-3 w-3" /> Clear
            </Button>
          </div>
          <ScrollArea className="h-48">
            {historyEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No voice history yet</p>
            ) : (
              <div className="space-y-1">
                {historyEntries.map((entry, i) => (
                  <div key={i} className="rounded border border-border p-2 text-xs space-y-0.5">
                    <p className="truncate font-medium">"{entry.transcript}"</p>
                    <div className="flex justify-between text-muted-foreground">
                      <span className="capitalize">{entry.intent.replace(/_/g, " ")}</span>
                      <span>{format(new Date(entry.timestamp), "HH:mm")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
