// Step 5E — Archive dialog for a single CRM internal note.
// Internal-only. No external surface. Server guard re-validates.

import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { validateArchiveReason } from "@/lib/vos/archiveReasonValidation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  onConfirm: (reason: string) => void;
};

export function ArchiveNoteDialog({ open, onOpenChange, submitting, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const validation = useMemo(() => validateArchiveReason(reason), [reason]);
  const inlineWarning =
    !validation.ok && reason.trim().length > 0
      ? validation.code === "banned_word"
        ? `The word "${validation.detail}" is not allowed in archive reasons. Please rephrase.`
        : validation.code === "pii"
        ? `Possible personal data detected (${validation.detail}). Remove before archiving.`
        : "Minimum 5 characters."
      : null;

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason("");
    onOpenChange(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this internal observation?</AlertDialogTitle>
          <AlertDialogDescription>
            Archiving is permanent. The note remains in the audit trail and cannot be sent, edited, or deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Archive is internal only. No external system, customer, or contact will be notified.
            This action will not generate any outbound activity.
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="archive-reason">Archive reason</Label>
            <Textarea
              id="archive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='e.g. "Pilot completed; observation no longer needed for active review."'
              rows={4}
              maxLength={500}
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground">
              Internal language only. No customer-facing wording. No personal data.
            </p>
            {inlineWarning && (
              <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                {inlineWarning}
              </p>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              if (validation.ok && !submitting) onConfirm(reason.trim());
            }}
            disabled={!validation.ok || submitting}
          >
            {submitting ? "Archiving…" : "Archive note"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
