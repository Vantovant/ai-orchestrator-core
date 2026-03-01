import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDictation } from "@/hooks/useDictation";
import { toast } from "sonner";

interface Props {
  onAppend: (text: string) => void;
  onUndo?: () => void;
  compact?: boolean;
}

export default function DictationMic({ onAppend, onUndo, compact = false }: Props) {
  const handleTranscript = useCallback((text: string) => {
    onAppend(text);
    toast.success("Dictation added to note");
  }, [onAppend]);

  const { state, supported, interimText, start, stop, lastAppended, undoLast } = useDictation({
    onTranscript: handleTranscript,
    continuous: true,
  });

  const handleUndo = useCallback(() => {
    undoLast();
    onUndo?.();
  }, [undoLast, onUndo]);

  if (!supported) return null;

  const isListening = state === "listening";

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isListening ? "destructive" : "outline"}
              size={compact ? "icon" : "default"}
              onClick={isListening ? stop : start}
              className={`${compact ? "h-9 w-9" : "gap-2"} ${isListening ? "animate-pulse" : ""}`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {!compact && (isListening ? "Stop" : "Dictate")}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium text-sm">Dictate to Notes</p>
            <p className="text-xs text-muted-foreground">Speak freely. We'll type it into your note.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isListening && (
        <span className="text-sm text-muted-foreground italic animate-in fade-in truncate max-w-[220px]">
          {interimText || "Listening…"}
        </span>
      )}

      {lastAppended && !isListening && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleUndo}>
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo last dictation</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
