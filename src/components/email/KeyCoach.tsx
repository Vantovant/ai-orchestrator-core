import { cn } from "@/lib/utils";

interface Props {
  context: "list" | "detail";
  triageMode?: boolean;
}

const LIST_KEYS = [
  { key: "J/K", label: "Navigate" },
  { key: "Enter", label: "Open" },
  { key: "E", label: "Archive" },
  { key: "S", label: "Snooze" },
  { key: "W", label: "Waiting" },
  { key: "X", label: "Star" },
  { key: "U", label: "Unread" },
  { key: "⌘K", label: "Command" },
  { key: "?", label: "Help" },
];

const DETAIL_KEYS = [
  { key: "Esc", label: "Back" },
  { key: "E", label: "Archive" },
  { key: "S", label: "Snooze" },
  { key: "W", label: "Waiting" },
  { key: "X", label: "Star" },
  { key: "T", label: "Task" },
  { key: "M", label: "Meeting" },
  { key: "⌘K", label: "Command" },
];

export default function KeyCoach({ context, triageMode }: Props) {
  const keys = context === "detail" ? DETAIL_KEYS : LIST_KEYS;

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-muted/30 border-t border-border/30">
      {triageMode && (
        <span className="text-[10px] font-medium text-primary mr-2">⚡ TRIAGE</span>
      )}
      {keys.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono font-medium">{key}</kbd>
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
