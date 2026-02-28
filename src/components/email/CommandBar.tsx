import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Archive, Clock, CheckSquare, CalendarPlus, Bell, Eye, Search, Inbox, Mic } from "lucide-react";
import VoiceInput from "@/components/voice/VoiceInput";
import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  hasSelected: boolean;
  onAction: (action: string, payload?: any) => void;
}

export default function CommandBar({ open, onClose, hasSelected, onAction }: Props) {
  const run = (action: string, payload?: any) => {
    onAction(action, payload);
    onClose();
  };

  // Snooze helpers
  const tomorrowAt8 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  };
  const laterToday = () => {
    const d = new Date();
    d.setHours(d.getHours() + 3, 0, 0, 0);
    return d.toISOString();
  };
  const nextWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="overflow-hidden p-0 max-w-lg">
        <Command className="rounded-lg border shadow-md">
          <div className="flex items-center border-b border-border">
            <CommandInput placeholder="Type a command or search..." className="flex-1" />
            <div className="pr-2">
              <VoiceInput onTranscript={(text) => { run("voice_command", text); }} compact />
            </div>
          </div>
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {hasSelected && (
              <CommandGroup heading="Actions">
                <CommandItem onSelect={() => run("archive")}>
                  <Archive className="mr-2 h-4 w-4" /> Archive
                  <span className="ml-auto text-xs text-muted-foreground">E</span>
                </CommandItem>
                <CommandItem onSelect={() => run("create_task")}>
                  <CheckSquare className="mr-2 h-4 w-4" /> Create Task from Email
                  <span className="ml-auto text-xs text-muted-foreground">T</span>
                </CommandItem>
                <CommandItem onSelect={() => run("create_meeting")}>
                  <CalendarPlus className="mr-2 h-4 w-4" /> Create Meeting from Email
                  <span className="ml-auto text-xs text-muted-foreground">M</span>
                </CommandItem>
                <CommandItem onSelect={() => run("create_reminder")}>
                  <Bell className="mr-2 h-4 w-4" /> Create Reminder
                </CommandItem>
              </CommandGroup>
            )}

            {hasSelected && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Snooze">
                  <CommandItem onSelect={() => run("snooze", tomorrowAt8())}>
                    <Clock className="mr-2 h-4 w-4" /> Tomorrow 8:00 AM
                  </CommandItem>
                  <CommandItem onSelect={() => run("snooze", laterToday())}>
                    <Clock className="mr-2 h-4 w-4" /> Later today
                  </CommandItem>
                  <CommandItem onSelect={() => run("snooze", nextWeek())}>
                    <Clock className="mr-2 h-4 w-4" /> Next week
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Status">
                  <CommandItem onSelect={() => run("waiting_on")}>
                    <Eye className="mr-2 h-4 w-4" /> Mark Waiting On
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
            <CommandGroup heading="Views">
              <CommandItem onSelect={() => run("view", "inbox")}>
                <Inbox className="mr-2 h-4 w-4" /> Inbox
              </CommandItem>
              <CommandItem onSelect={() => run("view", "snoozed")}>
                <Clock className="mr-2 h-4 w-4" /> Snoozed
              </CommandItem>
              <CommandItem onSelect={() => run("view", "waiting")}>
                <Eye className="mr-2 h-4 w-4" /> Waiting On
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
