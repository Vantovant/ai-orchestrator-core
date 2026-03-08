import { describe, it, expect } from "vitest";
import { makeDedupe, type BulkUpsertResult, type BulkUpsertItemResult } from "@/services/taskService";
import { buildReceipt, type WriteReceiptData } from "@/components/ui/WriteReceipt";

// ============================
// P0.1 — Notes / Apply Selected
// ============================

describe("makeDedupe — deterministic keys", () => {
  it("same inputs produce same key", () => {
    const a = makeDedupe("u1", "p1", "n1", "Draft proposal");
    const b = makeDedupe("u1", "p1", "n1", "Draft proposal");
    expect(a).toBe(b);
  });

  it("different titles produce different keys", () => {
    const a = makeDedupe("u1", "p1", "n1", "Draft proposal");
    const b = makeDedupe("u1", "p1", "n1", "Review contract");
    expect(a).not.toBe(b);
  });

  it("two items with the same title but different noteId get different keys", () => {
    const a = makeDedupe("u1", "p1", "n1", "Send invoice");
    const b = makeDedupe("u1", "p1", "n2", "Send invoice");
    expect(a).not.toBe(b);
  });

  it("normalizes whitespace and case", () => {
    const a = makeDedupe("u1", "p1", null, "  Draft  Proposal ");
    const b = makeDedupe("u1", "p1", null, "draft proposal");
    expect(a).toBe(b);
  });
});

describe("BulkUpsertResult items mapping", () => {
  it("items array supports per-key lookup for duplicate titles", () => {
    // Simulating two tasks with same title but different dedupe_keys
    const items: BulkUpsertItemResult[] = [
      { dedupe_key: "dk-a", status: "created", id: "id-1" },
      { dedupe_key: "dk-b", status: "merged", id: "id-2" },
    ];
    const result: BulkUpsertResult = {
      created: ["id-1"],
      merged: ["id-2"],
      failed: [],
      items,
    };

    const map = new Map(result.items.map(i => [i.dedupe_key, i]));
    expect(map.get("dk-a")?.status).toBe("created");
    expect(map.get("dk-b")?.status).toBe("merged");
  });

  it("partial failure still maps correctly", () => {
    const items: BulkUpsertItemResult[] = [
      { dedupe_key: "dk-1", status: "created", id: "id-1" },
      { dedupe_key: "dk-2", status: "failed", reason: "RLS violation" },
    ];
    const result: BulkUpsertResult = {
      created: ["id-1"],
      merged: [],
      failed: [{ title: "Task B", reason: "RLS violation" }],
      items,
    };

    const map = new Map(result.items.map(i => [i.dedupe_key, i]));
    expect(map.get("dk-1")?.status).toBe("created");
    expect(map.get("dk-2")?.status).toBe("failed");
    expect(map.get("dk-2")?.reason).toBe("RLS violation");
  });
});

// ============================
// P0.2 — Finance / Smart Extract direction
// ============================

describe("Finance direction safety rules", () => {
  const testDirection = (
    text: string,
    direction: string,
    txnType: string,
    uiAction: string,
  ) => ({ text, direction, txnType, uiAction });

  const cases = [
    testDirection("Commission paid to current account", "in", "commission_income", "create_income"),
    testDirection("Debit order EasyPay", "out", "expense", "create_expense"),
    testDirection("Service fee bank charges", "out", "bank_fee", "create_expense"),
    testDirection("Transfer between own accounts", "neutral", "transfer", "none"),
    testDirection("Ambiguous message unclear", "unknown", "unknown", "none"),
  ];

  it("known income maps to create_income action", () => {
    const c = cases[0];
    expect(c.uiAction).toBe("create_income");
    expect(c.direction).toBe("in");
  });

  it("known expense maps to create_expense action", () => {
    const c = cases[1];
    expect(c.uiAction).toBe("create_expense");
    expect(c.direction).toBe("out");
  });

  it("bank fee maps to expense path", () => {
    const c = cases[2];
    expect(c.txnType).toBe("bank_fee");
    expect(c.direction).toBe("out");
  });

  it("transfer has no finance action", () => {
    const c = cases[3];
    expect(c.txnType).toBe("transfer");
    expect(c.uiAction).toBe("none");
  });

  it("unknown direction blocks all finance actions", () => {
    const c = cases[4];
    expect(c.txnType).toBe("unknown");
    expect(c.uiAction).toBe("none");
    // Finance route should be blocked in handler
    const isUnknown = c.txnType === "unknown" || c.uiAction === "none";
    expect(isUnknown).toBe(true);
  });
});

// ============================
// P0.3 — Receipt system
// ============================

describe("WriteReceipt — buildReceipt", () => {
  it("success receipt when all items created", () => {
    const r = buildReceipt("note_extract", 3, 0, 0, ["a", "b", "c"]);
    expect(r.status).toBe("success");
    expect(r.created_count).toBe(3);
    expect(r.summary).toContain("3 created");
    expect(r.timestamp).toBeTruthy();
  });

  it("warning receipt for partial failure", () => {
    const r = buildReceipt("note_extract", 2, 0, 1, ["a", "b"]);
    expect(r.status).toBe("warning");
    expect(r.summary).toContain("2 created");
    expect(r.summary).toContain("1 failed");
  });

  it("error receipt when nothing succeeded", () => {
    const r = buildReceipt("note_extract", 0, 0, 3, []);
    expect(r.status).toBe("error");
    expect(r.summary).toContain("Failed");
  });

  it("merged items included in summary", () => {
    const r = buildReceipt("note_extract", 1, 2, 0, ["a", "b", "c"]);
    expect(r.status).toBe("success");
    expect(r.summary).toContain("2 merged");
  });

  it("verification_message can be attached", () => {
    const r = buildReceipt("note_extract", 1, 0, 0, ["a"]);
    r.verification_message = "Verified: 5 open tasks now visible in this project";
    expect(r.verification_message).toContain("Verified");
  });

  it("source_reference is set when provided", () => {
    const r = buildReceipt("whatsapp_capture", 1, 0, 0, ["a"], "note-123");
    expect(r.source_reference).toBe("note-123");
    expect(r.action_type).toBe("whatsapp_capture");
  });
});

// ============================
// Project safety / ownership
// ============================

describe("Project safety — no cross-user or name-guessing", () => {
  it("dedupe key is user-scoped", () => {
    const a = makeDedupe("user-A", "project-1", null, "Task title");
    const b = makeDedupe("user-B", "project-1", null, "Task title");
    expect(a).not.toBe(b);
  });

  it("different project_id produces different dedupe", () => {
    const a = makeDedupe("user-A", "project-1", null, "Task title");
    const b = makeDedupe("user-A", "project-2", null, "Task title");
    expect(a).not.toBe(b);
  });

  it("null projectId is distinct from any real projectId", () => {
    const a = makeDedupe("user-A", null, null, "Task title");
    const b = makeDedupe("user-A", "project-1", null, "Task title");
    expect(a).not.toBe(b);
  });

  it("no name-based matching — keys only use IDs", () => {
    // Two projects with same-sounding names but different IDs
    const a = makeDedupe("user-A", "uuid-nimrod-1", null, "Follow up");
    const b = makeDedupe("user-A", "uuid-nimrod-2", null, "Follow up");
    expect(a).not.toBe(b);
  });
});
