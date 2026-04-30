import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Step 4Y — structural assertions on Integration Drafts UI:
// the tab must NOT contain forbidden user-actionable button labels.
describe("Step 4Y — Integration Drafts UI safety", () => {
  const tabPath = join(process.cwd(), "src/pages/admin/IntegrationDraftsTab.tsx");
  const src = readFileSync(tabPath, "utf8");

  // Forbidden tokens must not appear as JSX button text.
  // We scan within Button>...</Button> spans plus any visible label.
  const forbiddenPhrases = [
    "Send WhatsApp",
    "Send email",
    "Send Email",
    "Reply",
    "Push to CRM",
    "Enrol in Zazi",
    "Enroll in Zazi",
    "Wake Prospector",
    "Start Phase 4A",
    "Bulk action",
    "Dispatcher",
    "Live write",
    "Execute live",
    "External execute",
  ];

  for (const phrase of forbiddenPhrases) {
    it(`does not render forbidden button label: "${phrase}"`, () => {
      // Allow occurrences inside the FORBIDDEN_UI_TOKENS allow-list itself.
      // Strip the FORBIDDEN_UI_TOKENS literal first.
      const stripped = src.replace(/FORBIDDEN_UI_TOKENS\s*=\s*\[[\s\S]*?\];/, "");
      expect(stripped.includes(phrase)).toBe(false);
    });
  }

  it("declares all required safety badges", () => {
    expect(src.includes("would_write_external=false")).toBe(true);
    expect(src.includes("external_write_blocked=true")).toBe(true);
    expect(src.includes("customer_visible=false")).toBe(true);
    expect(src.includes("bulk_action=false")).toBe(true);
    expect(src.includes("rollback_required=true")).toBe(true);
    expect(src.includes("Axis A: RED")).toBe(true);
    expect(src.includes("Axis B: OFF")).toBe(true);
  });
});
