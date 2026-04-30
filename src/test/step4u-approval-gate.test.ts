// Step 4U — Pure mapper unit tests for the Approval Curator.
// Verifies deterministic mapping, allow-list compliance, and safety phrasing.

import { describe, it, expect } from "vitest";

function buildApproval(d: {
  id: string;
  source_proposal_id: string;
  app_id: string;
  event_name: string | null;
  dry_run_type: string;
  dry_run_status: string;
}) {
  if (d.dry_run_status === "archived" || d.dry_run_status === "dismissed") return null;
  if (d.dry_run_type === "manual_review_preview") {
    return {
      source_dry_run_id: d.id, source_proposal_id: d.source_proposal_id,
      app_id: d.app_id, event_name: d.event_name,
      approval_type: "review_status_approval",
      approval_title: "Review status approval request",
      approval_summary: "Admin decision record only. No action taken. Records human intent.",
    };
  }
  if (d.dry_run_type === "no_action_preview") {
    return {
      source_dry_run_id: d.id, source_proposal_id: d.source_proposal_id,
      app_id: d.app_id, event_name: d.event_name,
      approval_type: "no_action_confirmation",
      approval_title: "No-action confirmation request",
      approval_summary: "Admin formally records that no action will be taken. Inert.",
    };
  }
  if (d.dry_run_type === "admin_note_preview") {
    return {
      source_dry_run_id: d.id, source_proposal_id: d.source_proposal_id,
      app_id: d.app_id, event_name: d.event_name,
      approval_type: "internal_note_approval",
      approval_title: "Internal admin note approval request",
      approval_summary: "Admin approves an internal-only record. No outbound action.",
    };
  }
  return null;
}

const ALLOWED = new Set(["internal_note_approval","review_status_approval","no_action_confirmation"]);
const FORBIDDEN_TYPES = ["whatsapp_send","email_send","crm_push","zazi_enroll","aplgo_writeback",
  "dispatcher_run","master_prospector_wake","phase_4a_start","bulk_action"];
const BANNED = ["send","reply","enrol","enroll","follow up","push","dispatch",
  "forward","contact","message","notify","automate","trigger","schedule"];

describe("Step 4U — buildApproval mapper", () => {
  it("maps manual_review_preview → review_status_approval", () => {
    const a = buildApproval({ id:"d1", source_proposal_id:"p1", app_id:"app_aplgo_mlm",
      event_name:null, dry_run_type:"manual_review_preview", dry_run_status:"generated" });
    expect(a?.approval_type).toBe("review_status_approval");
  });

  it("maps no_action_preview → no_action_confirmation", () => {
    const a = buildApproval({ id:"d2", source_proposal_id:"p2", app_id:"app_vantoos_host",
      event_name:null, dry_run_type:"no_action_preview", dry_run_status:"generated" });
    expect(a?.approval_type).toBe("no_action_confirmation");
  });

  it("returns null for archived or dismissed dry-runs", () => {
    expect(buildApproval({ id:"d3", source_proposal_id:"p", app_id:"x",
      event_name:null, dry_run_type:"manual_review_preview", dry_run_status:"archived" })).toBeNull();
    expect(buildApproval({ id:"d4", source_proposal_id:"p", app_id:"x",
      event_name:null, dry_run_type:"manual_review_preview", dry_run_status:"dismissed" })).toBeNull();
  });

  it("never emits a forbidden approval_type", () => {
    const drafts = [
      buildApproval({ id:"d", source_proposal_id:"p", app_id:"app_aplgo_mlm", event_name:null, dry_run_type:"manual_review_preview", dry_run_status:"generated" }),
      buildApproval({ id:"d", source_proposal_id:"p", app_id:"app_vantoos_host", event_name:null, dry_run_type:"no_action_preview", dry_run_status:"generated" }),
      buildApproval({ id:"d", source_proposal_id:"p", app_id:"x", event_name:null, dry_run_type:"admin_note_preview", dry_run_status:"generated" }),
    ];
    for (const a of drafts) {
      expect(a).not.toBeNull();
      expect(ALLOWED.has(a!.approval_type)).toBe(true);
      expect(FORBIDDEN_TYPES.includes(a!.approval_type)).toBe(false);
    }
  });

  it("emits no banned tokens in title or summary", () => {
    for (const t of ["manual_review_preview","no_action_preview","admin_note_preview"]) {
      const a = buildApproval({ id:"d", source_proposal_id:"p", app_id:"x", event_name:null, dry_run_type:t, dry_run_status:"generated" });
      const text = `${a!.approval_title} ${a!.approval_summary}`.toLowerCase();
      for (const w of BANNED) expect(text.includes(w)).toBe(false);
    }
  });
});
