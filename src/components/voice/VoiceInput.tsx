import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  onTranscript: (text: string) => void;
  className?: string;
  compact?: boolean;
}

const VOICE_EXAMPLES = [
  "Add task: call client tomorrow 10am",
  "Add expense: fuel R650 today",
  "Add income: salary R25000 on 25th",
  "Create meeting: briefing with team Friday 2pm",
  "Remind me to pay UIF tomorrow 9am",
  "Run briefing",
];

export default function VoiceInput({ onTranscript, className = "", compact = false }: Props) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
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
        onTranscript(finalTranscript.trim());
        setIsListening(false);
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;

    return () => {
      try { recognition.stop(); } catch {}
    };
  }, [onTranscript]);

  // Stop on blur
  useEffect(() => {
    const handleBlur = () => {
      if (isListening && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        setIsListening(false);
      }
    };
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) handleBlur();
    });
    return () => {
      window.removeEventListener("blur", handleBlur);
    };
  }, [isListening]);

  const toggle = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  if (!supported) {
    return null; // Don't show mic button if unsupported
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

      {isListening && transcript && (
        <span className="text-sm text-muted-foreground italic animate-in fade-in truncate max-w-[200px]">
          {transcript}…
        </span>
      )}
    </div>
  );
}
