import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDictation } from "@/hooks/useDictation";

interface ChatDictationProps {
  onAppend: (text: string) => void;
  className?: string;
}

export default function ChatDictation({ onAppend, className = "" }: ChatDictationProps) {
  const handleTranscript = useCallback((text: string) => {
    onAppend(text);
  }, [onAppend]);

  const { state, supported, interimText, start, stop } = useDictation({
    onTranscript: handleTranscript,
    continuous: true,
  });

  if (!supported) return null;

  const isListening = state === "listening";

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isListening ? "destructive" : "ghost"}
              size="icon"
              onClick={isListening ? stop : start}
              className={`h-9 w-9 shrink-0 ${isListening ? "animate-pulse" : "text-muted-foreground hover:text-foreground"}`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isListening ? "Stop dictation" : "Dictate message"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isListening && interimText && (
        <span className="text-xs text-muted-foreground italic animate-in fade-in truncate max-w-[140px]">
          {interimText}
        </span>
      )}
    </div>
  );
}
