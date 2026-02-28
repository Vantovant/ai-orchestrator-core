import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reminderService, type ReminderInsert } from "@/services/reminderService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Bell } from "lucide-react";
import { toast } from "sonner";

export default function RemindersPage() {
  const qc = useQueryClient();
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: reminderService.list });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");

  const createMut = useMutation({
    mutationFn: (r: ReminderInsert) => reminderService.create(r),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders"] }); setOpen(false); setTitle(""); setTime(""); toast.success("Reminder created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_done }: { id: string; is_done: boolean }) => reminderService.toggleDone(id, is_done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => reminderService.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders"] }); toast.success("Reminder deleted"); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reminders</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-4 w-4" />Add Reminder</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Reminder</DialogTitle></DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => { e.preventDefault(); createMut.mutate({ title, reminder_time: new Date(time).toISOString() }); }}
            >
              <Input placeholder="Reminder title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <Input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} required />
              <Button type="submit" className="w-full" disabled={createMut.isPending}>Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {reminders.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : reminders.data?.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No reminders</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {reminders.data?.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={r.is_done} onChange={() => toggleMut.mutate({ id: r.id, is_done: !r.is_done })} className="h-4 w-4" />
                  <div>
                    <span className={`text-sm font-medium ${r.is_done ? "line-through text-muted-foreground" : ""}`}>{r.title}</span>
                    <p className="text-xs text-muted-foreground">
                      <Bell className="mr-1 inline h-3 w-3" />
                      {new Date(r.reminder_time).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
