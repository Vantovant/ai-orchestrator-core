import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Pencil, Mic } from "lucide-react";
import { useState } from "react";
import type { ParsedVoiceCommand } from "@/lib/voiceCommandParser";
import { format } from "date-fns";

const INTENT_LABELS: Record<string, string> = {
  create_task: "Create Task",
  create_reminder: "Create Reminder",
  create_meeting: "Create Meeting",
  add_expense: "Add Expense",
  add_income: "Add Income",
  run_briefing: "Run Daily Briefing",
  open_page: "Navigate",
  unknown: "Unknown Command",
};

interface Props {
  command: ParsedVoiceCommand;
  onConfirm: (edited: ParsedVoiceCommand) => void;
  onCancel: () => void;
}

export default function VoiceConfirmation({ command, onConfirm, onCancel }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(command.title ?? "");

  return (
    <Card className="border-primary/30 bg-primary/5 animate-in slide-in-from-bottom-2">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">I heard:</span>
          <span className="text-xs text-muted-foreground italic">"{command.raw}"</span>
        </div>

        <div className="rounded-lg bg-background border border-border p-3 space-y-1">
          <p className="text-xs font-semibold text-primary">{INTENT_LABELS[command.intent]}</p>
          {editing ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
          ) : (
            <p className="text-sm font-medium">{title || command.title}</p>
          )}
          {command.date && (
            <p className="text-xs text-muted-foreground">
              📅 {format(command.date, "EEE, MMM d 'at' h:mm a")}
            </p>
          )}
          {command.location && (
            <p className="text-xs text-muted-foreground">
              📍 {command.location}
            </p>
          )}
          {command.duration && command.intent === "create_meeting" && (
            <p className="text-xs text-muted-foreground">
              ⏱ {command.duration} min
            </p>
          )}
          {command.amount != null && (
            <p className="text-xs text-muted-foreground">
              💰 {command.currency ?? "ZAR"} {command.amount.toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="gap-1 flex-1"
            onClick={() => onConfirm({ ...command, title: title || command.title })}
          >
            <Check className="h-3.5 w-3.5" /> Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setEditing(!editing)}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={onCancel}
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
