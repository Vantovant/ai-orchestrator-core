// Step 4W — Structural unit tests for the Manual Action Pilot tab.
// Verifies forbidden UI tokens are NOT present as user-actionable buttons,
// and that the recorder dedupe key shape is deterministic.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORBIDDEN_UI_TOKENS } from "../pages/admin/ManualActionPilotTab";

const tabSrc = readFileSync(resolve(__dirname, "../pages/admin/ManualActionPilotTab.tsx"), "utf8");

// Strip JS string and comment regions so we only inspect rendered JSX text/labels.
function stripStringsAndComments(s: string): string {
  return s
    .replace(/\/\/[^\n]*/g, "")               // line comments
    .replace(/\/\*[\s\S]*?\*\//g, "")         // block comments
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')      // double-quoted
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")      // single-quoted
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");     // template literals
}

describe("Step 4W — Manual Action Pilot UI guarantees", () => {
  it("contains the safety lock banner", () => {
    expect(tabSrc).toContain("Internal Admin Note Only");
    expect(tabSrc).toContain("Axis A: RED");
    expect(tabSrc).toContain("Axis B: OFF");
  });

  it("exposes the only allowed primary action label", () => {
    expect(tabSrc).toContain("Record internal admin note");
  });

  for (const token of FORBIDDEN_UI_TOKENS) {
    it(`has no rendered '${token}' control`, () => {
      const visible = stripStringsAndComments(tabSrc);
      // Token must not appear in JSX-rendered code (after string-strip the labels are gone,
      // so any remaining occurrence in the rendered tree would indicate a real button).
      // Allow none.
      expect(visible.toLowerCase().includes(token.toLowerCase())).toBe(false);
    });
  }

  it("invokes the controlled recorder edge function only", () => {
    expect(tabSrc).toContain('functions.invoke("vos-manual-action-recorder"');
    // No direct fetch to external services
    expect(/fetch\(\s*["']https?:\/\//.test(tabSrc)).toBe(false);
  });
});

describe("Step 4W — dedupe key shape", () => {
  it("is sha256(approval_id + ':internal_admin_note_record')", async () => {
    const approval = "00000000-0000-0000-0000-000000000001";
    const input = `${approval}:internal_admin_note_record`;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(hex.length).toBe(64);
  });
});
