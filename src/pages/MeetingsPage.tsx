import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { meetingService, type MeetingInsert } from "@/services/meetingService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";

type FilterOption = "all" | "pending" | "done";

export default function MeetingsPage() {
  const qc = useQueryClient();
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: meetingService.list });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");

  const createMut = useMutation({
    mutationFn: (m: MeetingInsert) => meetingService.create(m),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); setOpen(false); setTitle(""); setStartTime(""); setEndTime(""); setLocation(""); toast.success("Meeting created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => meetingService.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("Meeting deleted"); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meetings</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-4 w-4" />Add Meeting</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Meeting</DialogTitle></DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate({
                  title,
                  start_time: new Date(startTime).toISOString(),
                  end_time: new Date(endTime).toISOString(),
                  location: location || undefined,
                });
              }}
            >
              <Input placeholder="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <div className="grid grid-cols-2 gap-2">
                <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </div>
              <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
              <Button type="submit" className="w-full" disabled={createMut.isPending}>Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {meetings.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : meetings.data?.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No meetings scheduled</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {meetings.data?.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <span className="text-sm font-medium">{m.title}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(m.start_time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {m.location && (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.location}</span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(m.id)}>
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
