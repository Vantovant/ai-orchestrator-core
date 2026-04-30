import { describe, it, expect } from "vitest";

// Pure-function copy of the curator's deterministic mapper + banned-verb scanner.
// Mirrors supabase/functions/vos-proposal-curator/index.ts (export `buildProposal`
// and BANNED tokens). We re-implement here because the Deno edge file imports
// from esm.sh which Vitest cannot resolve.

const APLGO_APP = "app_aplgo_mlm";
const APLGO_EVENT = "aplgo.lead_magnet.downloaded";
const HOST_APP = "app_vantoos_host";
const HOST_EVENT = "vantoos.health.ping";

const BANNED = [
  "send","reply","enrol","enroll","follow up","push","dispatch",
  "forward","contact","message","notify","automate","trigger","schedule",
];

function buildProposal(receipt: { id: string; app_id: string | null; event_name: string | null }) {
  const app = receipt.app_id ?? "";
  const evt = receipt.event_name ?? "";
  if (app === APLGO_APP && evt === APLGO_EVENT) {
    return {
      source_receipt_id: receipt.id,
      app_id: app, event_name: evt,
      intelligence_category: "lead_interest", risk_level: "low",
      proposal_type: "manual_review",
      proposal_title: "Review APLGO interest signal",
      proposal_summary: "A lead magnet download was received and classified as lead_interest. No action taken.",
      confidence: "high", reason: "persisted lead_interest receipt",
    };
  }
  if (app === HOST_APP && evt === HOST_EVENT) {
    return {
      source_receipt_id: receipt.id,
      app_id: app, event_name: evt,
      intelligence_category: "system_telemetry", risk_level: "info",
      proposal_type: "no_action_record",
      proposal_title: "Host health ping recorded",
      proposal_summary: "Host telemetry was received and classified as system_telemetry. No action taken.",
      confidence: "high", reason: "persisted system_telemetry receipt",
    };
  }
  return null;
}

function containsBanned(text: string): string | null {
  const t = text.toLowerCase();
  for (const w of BANNED) if (t.includes(w)) return w;
  return null;
}

describe("Step 4Q — Proposal curator (pure mapper)", () => {
  it("APLGO lead magnet → manual_review proposal with canonical wording", () => {
    const p = buildProposal({ id: "r1", app_id: APLGO_APP, event_name: APLGO_EVENT });
    expect(p).not.toBeNull();
    expect(p!.proposal_type).toBe("manual_review");
    expect(p!.proposal_title).toBe("Review APLGO interest signal");
    expect(p!.proposal_summary).toContain("lead_interest");
    expect(p!.proposal_summary).toContain("No action taken");
    expect(p!.intelligence_category).toBe("lead_interest");
    expect(p!.risk_level).toBe("low");
    expect(p!.confidence).toBe("high");
  });

  it("Host health ping → no_action_record proposal with canonical wording", () => {
    const p = buildProposal({ id: "r2", app_id: HOST_APP, event_name: HOST_EVENT });
    expect(p).not.toBeNull();
    expect(p!.proposal_type).toBe("no_action_record");
    expect(p!.proposal_title).toBe("Host health ping recorded");
    expect(p!.proposal_summary).toContain("system_telemetry");
    expect(p!.proposal_summary).toContain("No action taken");
    expect(p!.intelligence_category).toBe("system_telemetry");
    expect(p!.risk_level).toBe("info");
    expect(p!.confidence).toBe("high");
  });

  it("unknown app/event → no proposal (defensive null)", () => {
    expect(buildProposal({ id: "r3", app_id: "app_other", event_name: "other.event" })).toBeNull();
    expect(buildProposal({ id: "r4", app_id: HOST_APP, event_name: "other.event" })).toBeNull();
    expect(buildProposal({ id: "r5", app_id: APLGO_APP, event_name: "other.event" })).toBeNull();
    expect(buildProposal({ id: "r6", app_id: null, event_name: null })).toBeNull();
  });

  it("canonical proposals contain no banned action verbs", () => {
    const drafts = [
      buildProposal({ id: "r1", app_id: APLGO_APP, event_name: APLGO_EVENT })!,
      buildProposal({ id: "r2", app_id: HOST_APP, event_name: HOST_EVENT })!,
    ];
    for (const d of drafts) {
      const combined = `${d.proposal_title} ${d.proposal_summary} ${d.reason}`;
      expect(containsBanned(combined)).toBeNull();
    }
  });

  it("banned-verb scanner detects each forbidden token", () => {
    expect(containsBanned("Please SEND a follow up email")).toBeTruthy();
    expect(containsBanned("trigger the workflow")).toBe("trigger");
    expect(containsBanned("Push to CRM")).toBe("push");
    expect(containsBanned("Schedule a call")).toBe("schedule");
    expect(containsBanned("Notify the user")).toBe("notify");
    expect(containsBanned("Enroll in Zazi Mail")).toBeTruthy();
    expect(containsBanned("Reply quickly")).toBe("reply");
    expect(containsBanned("Forward this onwards")).toBe("forward");
    expect(containsBanned("Contact the lead")).toBe("contact");
    expect(containsBanned("Dispatch immediately")).toBe("dispatch");
    expect(containsBanned("Automate the funnel")).toBe("automate");
    expect(containsBanned("Message the team")).toBe("message");
  });

  it("safe observation strings pass the scanner", () => {
    expect(containsBanned("A lead magnet download was received and classified as lead_interest. No action taken.")).toBeNull();
    expect(containsBanned("Host telemetry was received and classified as system_telemetry. No action taken.")).toBeNull();
  });
});

describe("Step 4Q — Forbidden statuses are not part of the allowed set", () => {
  const ALLOWED = ["proposed", "reviewed", "dismissed", "archived"];
  const FORBIDDEN = ["approved", "executed", "dispatched", "sent", "enrolled", "pushed"];

  it("forbidden statuses are not in the allowed set", () => {
    for (const f of FORBIDDEN) expect(ALLOWED.includes(f)).toBe(false);
  });
});
