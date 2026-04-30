// Step 4S — Pure mapper unit tests for the Dry-Run Action Engine.
// Verifies deterministic mapping + safety invariants without DB I/O.

import { describe, it, expect } from "vitest";

// Mirror of buildDryRun in the edge function (kept in sync by spec).
function buildDryRun(p: {
  id: string;
  app_id: string;
  event_name: string | null;
  proposal_type: string;
  proposal_status: string;
}) {
  if (p.proposal_status === "archived") return null;
  if (p.app_id === "app_aplgo_mlm" && p.proposal_type === "manual_review") {
    return {
      source_proposal_id: p.id, app_id: p.app_id, event_name: p.event_name,
      dry_run_type: "manual_review_preview",
      dry_run_title: "APLGO interest review preview",
      dry_run_summary: "This preview explains the interest signal only. No action taken.",
      simulated_target: "<<simulated:none>>",
      simulated_payload_redacted: { kind: "preview", channel: "<<simulated>>" },
    };
  }
  if (p.app_id === "app_vantoos_host" && p.proposal_type === "no_action_record") {
    return {
      source_proposal_id: p.id, app_id: p.app_id, event_name: p.event_name,
      dry_run_type: "no_action_preview",
      dry_run_title: "Host telemetry observation preview",
      dry_run_summary: "This preview confirms host telemetry only. No action taken.",
      simulated_target: "<<simulated:none>>",
      simulated_payload_redacted: { kind: "preview", channel: "<<simulated>>" },
    };
  }
  return null;
}

const BANNED = ["send","reply","enrol","enroll","follow up","push","dispatch",
  "forward","contact","message","notify","automate","trigger","schedule"];

describe("Step 4S — buildDryRun mapper", () => {
  it("maps APLGO manual_review → manual_review_preview", () => {
    const d = buildDryRun({
      id: "p1", app_id: "app_aplgo_mlm", event_name: "aplgo.lead_magnet.downloaded",
      proposal_type: "manual_review", proposal_status: "proposed",
    });
    expect(d).not.toBeNull();
    expect(d!.dry_run_type).toBe("manual_review_preview");
    expect(d!.simulated_target).toBe("<<simulated:none>>");
  });

  it("maps host no_action_record → no_action_preview", () => {
    const d = buildDryRun({
      id: "p2", app_id: "app_vantoos_host", event_name: "vantoos.health.ping",
      proposal_type: "no_action_record", proposal_status: "proposed",
    });
    expect(d).not.toBeNull();
    expect(d!.dry_run_type).toBe("no_action_preview");
  });

  it("returns null for archived proposals", () => {
    const d = buildDryRun({
      id: "p3", app_id: "app_aplgo_mlm", event_name: null,
      proposal_type: "manual_review", proposal_status: "archived",
    });
    expect(d).toBeNull();
  });

  it("returns null for unmapped app/type combinations", () => {
    expect(buildDryRun({
      id: "p4", app_id: "unknown", event_name: null,
      proposal_type: "manual_review", proposal_status: "proposed",
    })).toBeNull();
  });

  it("emits no banned tokens in title or summary", () => {
    const samples = [
      buildDryRun({ id: "x", app_id: "app_aplgo_mlm", event_name: null, proposal_type: "manual_review", proposal_status: "proposed" }),
      buildDryRun({ id: "x", app_id: "app_vantoos_host", event_name: null, proposal_type: "no_action_record", proposal_status: "proposed" }),
    ];
    for (const d of samples) {
      const text = `${d!.dry_run_title} ${d!.dry_run_summary}`.toLowerCase();
      for (const w of BANNED) expect(text.includes(w)).toBe(false);
    }
  });

  it("uses only allowed dry_run_type values", () => {
    const allowed = new Set(["admin_note_preview","manual_review_preview","risk_review_preview","no_action_preview"]);
    const d1 = buildDryRun({ id: "x", app_id: "app_aplgo_mlm", event_name: null, proposal_type: "manual_review", proposal_status: "proposed" });
    const d2 = buildDryRun({ id: "x", app_id: "app_vantoos_host", event_name: null, proposal_type: "no_action_record", proposal_status: "proposed" });
    expect(allowed.has(d1!.dry_run_type)).toBe(true);
    expect(allowed.has(d2!.dry_run_type)).toBe(true);
  });
});
