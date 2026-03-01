import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bell, Clock, Trash2, Save, X } from "lucide-react";
import { format } from "date-fns";
import type { Reminder } from "@/services/reminderService";

interface Props {
  reminder: Reminder | null;
  open: boolean;
  onClose: () => void;
  onToggle: (id: string, isDone: boolean) => void;
  onDelete: (id: string) => void;
}

export default function ReminderDetailDrawer({ reminder, open, onClose, onToggle, onDelete }: Props) {
  if (!reminder) return null;

  const isPast = new Date(reminder.reminder_time) < new Date();

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-warning" />
            Reminder Details
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          <div>
            <h3 className={`text-lg font-semibold ${reminder.is_done ? "line-through text-muted-foreground" : ""}`}>
              {reminder.title}
            </h3>
            {reminder.description && <p className="text-sm text-muted-foreground mt-1">{reminder.description}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-muted-foreground">When</span>
              <p className="text-sm mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(reminder.reminder_time), "MMM d, h:mm a")}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Status</span>
              <div className="mt-1">
                <Badge variant={reminder.is_done ? "secondary" : isPast ? "destructive" : "outline"}>
                  {reminder.is_done ? "Done" : isPast ? "Overdue" : "Upcoming"}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Created</span>
              <p className="text-sm mt-1">{format(new Date(reminder.created_at), "MMM d, yyyy")}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => onToggle(reminder.id, !reminder.is_done)}>
              {reminder.is_done ? "Mark Not Done" : "Mark Done"}
            </Button>
            <Button variant="destructive" size="sm" className="gap-1" onClick={() => { onDelete(reminder.id); onClose(); }}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
