import { describe, it, expect } from "vitest";
import { classify } from "@/pages/admin/ReceiptIntelligenceTab";

describe("Step 4N — Receipt Intelligence classifier", () => {
  it("persisted APLGO lead magnet → lead_interest / low / high", () => {
    const c = classify("persisted", "aplgo.lead_magnet.downloaded");
    expect(c.category).toBe("lead_interest");
    expect(c.risk).toBe("low");
    expect(c.confidence).toBe("high");
    expect(c.insight).toContain("New APLGO interest signal");
    expect(c.insight).toContain("No action taken.");
  });

  it("deduped → duplicate_ignored / low / high", () => {
    const c = classify("deduped", "aplgo.lead_magnet.downloaded");
    expect(c.category).toBe("duplicate_ignored");
    expect(c.risk).toBe("low");
    expect(c.confidence).toBe("high");
    expect(c.insight).toBe("Duplicate ignored — already on record.");
  });

  it("rejected_signature → signature_failure / high / high", () => {
    const c = classify("rejected_signature", "aplgo.lead_magnet.downloaded");
    expect(c.category).toBe("signature_failure");
    expect(c.risk).toBe("high");
    expect(c.confidence).toBe("high");
  });

  it("rejected_event → out_of_scope_event / medium-high / high", () => {
    const c = classify("rejected_event", "some.unsupported.event");
    expect(c.category).toBe("out_of_scope_event");
    expect(c.risk).toBe("medium-high");
    expect(c.confidence).toBe("high");
  });

  it("rejected_flag → flag_gate_block / medium / high", () => {
    const c = classify("rejected_flag", "aplgo.lead_magnet.downloaded");
    expect(c.category).toBe("flag_gate_block");
    expect(c.risk).toBe("medium");
  });

  it("rejected_kill_switch → kill_switch_block / medium / high", () => {
    const c = classify("rejected_kill_switch", "aplgo.lead_magnet.downloaded");
    expect(c.category).toBe("kill_switch_block");
    expect(c.risk).toBe("medium");
  });

  it("rate_limited → rate_limit_hit / high / high", () => {
    const c = classify("rate_limited", null);
    expect(c.category).toBe("rate_limit_hit");
    expect(c.risk).toBe("high");
  });

  it("lockout → lockout / high / high", () => {
    const c = classify("lockout", null);
    expect(c.category).toBe("lockout");
    expect(c.risk).toBe("high");
  });

  it("unknown / null → needs_manual_review / unknown / low", () => {
    const c = classify(null, null);
    expect(c.category).toBe("needs_manual_review");
    expect(c.risk).toBe("unknown");
    expect(c.confidence).toBe("low");
    expect(c.insight).toBe("Receipt logged but not classified. Manual review recommended.");
  });

  it("persisted but unknown event → needs_manual_review", () => {
    const c = classify("persisted", "something.else");
    expect(c.category).toBe("needs_manual_review");
    expect(c.confidence).toBe("low");
  });

  it("insight strings never contain action verbs", () => {
    const banned = ["send", "reply", "enrol", "enroll", "follow up", "push", "dispatch", "forward", "contact", "message", "notify", "automate", "trigger", "schedule"];
    const outcomes = [
      "persisted",
      "deduped",
      "rejected_signature",
      "rejected_event",
      "rejected_flag",
      "rejected_kill_switch",
      "rate_limited",
      "lockout",
      null,
    ];
    for (const o of outcomes) {
      const c = classify(o, "aplgo.lead_magnet.downloaded");
      const lower = c.insight.toLowerCase();
      for (const word of banned) {
        expect(lower.includes(word)).toBe(false);
      }
    }
  });
});
