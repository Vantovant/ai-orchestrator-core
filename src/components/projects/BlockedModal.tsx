import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  projectName: string;
  onSubmit: (data: { reason: string; blockedBy: string; unblockEta: string | null; notes: string }) => void;
  isPending?: boolean;
}

export default function BlockedModal({ open, onClose, projectName, onSubmit, isPending }: Props) {
  const [reason, setReason] = useState("");
  const [blockedBy, setBlockedBy] = useState("");
  const [unblockEta, setUnblockEta] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      reason,
      blockedBy,
      unblockEta: unblockEta || null,
      notes,
    });
    setReason("");
    setBlockedBy("");
    setUnblockEta("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Mark "{projectName}" as Blocked
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-medium">Block Reason *</label>
            <Textarea
              placeholder="What's blocking this project?"
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
              rows={2}
            />
          </div>
          <div>
            <label className="text-xs font-medium">Blocked By (person/team) *</label>
            <Input
              placeholder="Who needs to unblock this?"
              value={blockedBy}
              onChange={e => setBlockedBy(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium">Unblock ETA (optional)</label>
            <Input type="date" value={unblockEta} onChange={e => setUnblockEta(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium">Notes</label>
            <Textarea
              placeholder="Additional context..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <Button type="submit" variant="destructive" className="w-full" disabled={isPending}>
            {isPending ? "Marking Blocked..." : "Mark Blocked & Create Unblock Task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
