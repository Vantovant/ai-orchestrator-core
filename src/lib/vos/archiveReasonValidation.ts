// Step 5E — client-side mirror of vos_crm_internal_notes_guard archive_reason rules.
// Server is the source of truth; these checks exist only for UX.

export const ARCHIVE_BANNED_TOKENS = [
  "send","reply","enrol","enroll","follow up","push","dispatch",
  "forward","contact","message","notify","automate","trigger","schedule",
] as const;

const PII_PATTERNS: Array<{ kind: "email" | "sa_id" | "phone_intl" | "phone_local"; re: RegExp }> = [
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { kind: "sa_id", re: /\b\d{13}\b/ },
  { kind: "phone_intl", re: /\+27\s?\d[\d\s-]{7,12}/ },
  { kind: "phone_local", re: /\b0[1-9]\d[\d\s-]{7,10}\b/ },
];

export type ArchiveReasonValidation =
  | { ok: true }
  | { ok: false; code: "too_short" | "banned_word" | "pii"; detail: string };

export function validateArchiveReason(input: string): ArchiveReasonValidation {
  const trimmed = (input ?? "").trim();
  if (trimmed.length < 5) {
    return { ok: false, code: "too_short", detail: "Minimum 5 characters." };
  }
  const lower = trimmed.toLowerCase();
  for (const token of ARCHIVE_BANNED_TOKENS) {
    if (lower.includes(token)) {
      return { ok: false, code: "banned_word", detail: token };
    }
  }
  for (const { kind, re } of PII_PATTERNS) {
    if (re.test(trimmed)) {
      return { ok: false, code: "pii", detail: kind };
    }
  }
  return { ok: true };
}
