import { useState, useEffect, useMemo } from "react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckSquare, Bell, Calendar, BookOpen, Plus, Search, Target, Sparkles, Mic } from "lucide-react";
import VoiceInput from "@/components/voice/VoiceInput";
import type { Task } from "@/services/taskService";
import type { Reminder } from "@/services/reminderService";
import type { Meeting } from "@/services/meetingService";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  reminders: Reminder[];
  meetings: Meeting[];
  onClickTask: (t: Task) => void;
  onClickReminder: (r: Reminder) => void;
  onClickMeeting: (m: Meeting) => void;
  onAdd: (type: "task" | "reminder" | "meeting") => void;
  onTabChange: (tab: string) => void;
  onVoiceTranscript: (text: string) => void;
}

export default function PlanCommandBar({
  open, onClose, tasks, reminders, meetings,
  onClickTask, onClickReminder, onClickMeeting, onAdd, onTabChange, onVoiceTranscript,
}: Props) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
        else onClose(); // parent toggles
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const run = (fn: () => void) => { fn(); onClose(); };

  const filteredTasks = useMemo(() =>
    (tasks ?? []).filter(t => t.title.toLowerCase().includes(search.toLowerCase())).slice(0, 5),
    [tasks, search]
  );
  const filteredReminders = useMemo(() =>
    (reminders ?? []).filter(r => r.title.toLowerCase().includes(search.toLowerCase())).slice(0, 5),
    [reminders, search]
  );
  const filteredMeetings = useMemo(() =>
    (meetings ?? []).filter(m => m.title.toLowerCase().includes(search.toLowerCase())).slice(0, 5),
    [meetings, search]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="overflow-hidden p-0 max-w-lg">
        <Command className="rounded-lg border shadow-md" shouldFilter={false}>
          <div className="flex items-center border-b border-border">
            <CommandInput
              placeholder="Search tasks, reminders, meetings..."
              value={search}
              onValueChange={setSearch}
              className="flex-1"
            />
            <div className="pr-2">
              <VoiceInput onTranscript={(text) => { onVoiceTranscript(text); onClose(); }} compact />
            </div>
          </div>
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {/* Quick Create */}
            <CommandGroup heading="Quick Create">
              <CommandItem onSelect={() => run(() => onAdd("task"))}>
                <Plus className="mr-2 h-4 w-4" /> New Task
              </CommandItem>
              <CommandItem onSelect={() => run(() => onAdd("reminder"))}>
                <Plus className="mr-2 h-4 w-4" /> New Reminder
              </CommandItem>
              <CommandItem onSelect={() => run(() => onAdd("meeting"))}>
                <Plus className="mr-2 h-4 w-4" /> New Meeting
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* Navigate */}
            <CommandGroup heading="Navigate">
              <CommandItem onSelect={() => run(() => onTabChange("today"))}>
                <Target className="mr-2 h-4 w-4" /> Today
              </CommandItem>
              <CommandItem onSelect={() => run(() => onTabChange("tasks"))}>
                <CheckSquare className="mr-2 h-4 w-4" /> Tasks
              </CommandItem>
              <CommandItem onSelect={() => run(() => onTabChange("reminders"))}>
                <Bell className="mr-2 h-4 w-4" /> Reminders
              </CommandItem>
              <CommandItem onSelect={() => run(() => onTabChange("meetings"))}>
                <Calendar className="mr-2 h-4 w-4" /> Meetings
              </CommandItem>
              <CommandItem onSelect={() => run(() => onTabChange("calendar"))}>
                <Calendar className="mr-2 h-4 w-4" /> Calendar
              </CommandItem>
              <CommandItem onSelect={() => run(() => onTabChange("notes"))}>
                <BookOpen className="mr-2 h-4 w-4" /> Notes
              </CommandItem>
            </CommandGroup>

            {/* Search Results */}
            {search && filteredTasks.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Tasks">
                  {filteredTasks.map(t => (
                    <CommandItem key={t.id} onSelect={() => run(() => onClickTask(t))}>
                      <CheckSquare className="mr-2 h-4 w-4 text-primary" />
                      <span className="truncate">{t.title}</span>
                      {t.due_date && <span className="ml-auto text-xs text-muted-foreground">{format(new Date(t.due_date), "MMM d")}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {search && filteredReminders.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Reminders">
                  {filteredReminders.map(r => (
                    <CommandItem key={r.id} onSelect={() => run(() => onClickReminder(r))}>
                      <Bell className="mr-2 h-4 w-4 text-warning" />
                      <span className="truncate">{r.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{format(new Date(r.reminder_time), "MMM d")}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {search && filteredMeetings.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Meetings">
                  {filteredMeetings.map(m => (
                    <CommandItem key={m.id} onSelect={() => run(() => onClickMeeting(m))}>
                      <Calendar className="mr-2 h-4 w-4 text-accent-foreground" />
                      <span className="truncate">{m.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{format(new Date(m.start_time), "MMM d")}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
