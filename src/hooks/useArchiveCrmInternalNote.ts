// Step 5E — narrow archive mutation. Updates exactly four fields.
// No edge function. No external API. Server guard is source of truth.

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ArchiveArgs = {
  noteId: string;
  currentStatus: "recorded" | "corrected";
  archiveReason: string;
};

export function useArchiveCrmInternalNote() {
  const [submitting, setSubmitting] = useState(false);

  const archive = async (args: ArchiveArgs): Promise<{ ok: true } | { ok: false; error: string }> => {
    setSubmitting(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes?.user?.id) {
        return { ok: false, error: "not_authenticated" };
      }
      const archived_by = userRes.user.id;
      const archived_at = new Date().toISOString();
      const archive_reason = args.archiveReason.trim();

      const { error } = await supabase
        .from("vos_crm_internal_notes")
        .update({
          note_status: "archived",
          archived_at,
          archived_by,
          archive_reason,
        })
        .eq("id", args.noteId)
        .eq("note_status", args.currentStatus);

      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } finally {
      setSubmitting(false);
    }
  };

  return { archive, submitting };
}
