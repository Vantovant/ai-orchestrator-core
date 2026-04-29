// Vanto OS — PII Redactor / Packet Wrapper (verify-only)
// Phase 1 Step 2. Produces redacted_payload + safe_summary. NO raw PII stored.
// Patterns: SA ID, bank account, email, phone, confidential tags.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PATTERNS: Record<string, RegExp> = {
  sa_id: /\b\d{13}\b/g,
  bank_account: /\b\d{8,12}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  phone: /\b(?:\+?27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
  confidential_tag: /\[(?:CONFIDENTIAL|NDA|PRIVATE|SECRET)[^\]]*\]/gi,
};

const REPLACEMENTS: Record<string, string> = {
  sa_id: "[REDACTED_SA_ID]",
  bank_account: "[REDACTED_BANK]",
  email: "[REDACTED_EMAIL]",
  phone: "[REDACTED_PHONE]",
  confidential_tag: "[REDACTED_CONFIDENTIAL]",
};

function redactString(s: string) {
  let out = s;
  const counts: Record<string, number> = {};
  let had = false;
  // Order matters: SA ID before bank_account to prevent overlap
  for (const k of ["sa_id", "email", "phone", "confidential_tag", "bank_account"]) {
    const matches = out.match(PATTERNS[k]);
    if (matches && matches.length) {
      counts[k] = matches.length;
      out = out.replace(PATTERNS[k], REPLACEMENTS[k]);
      had = true;
    }
  }
  return { redacted: out, counts, had_pii: had };
}

function redactValue(v: any): { value: any; counts: Record<string, number>; had_pii: boolean } {
  if (typeof v === "string") {
    const r = redactString(v);
    return { value: r.redacted, counts: r.counts, had_pii: r.had_pii };
  }
  if (Array.isArray(v)) {
    const counts: Record<string, number> = {};
    let had = false;
    const arr = v.map((item) => {
      const r = redactValue(item);
      had = had || r.had_pii;
      for (const [k, n] of Object.entries(r.counts)) counts[k] = (counts[k] ?? 0) + n;
      return r.value;
    });
    return { value: arr, counts, had_pii: had };
  }
  if (v && typeof v === "object") {
    const counts: Record<string, number> = {};
    let had = false;
    const obj: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      const r = redactValue(val);
      had = had || r.had_pii;
      for (const [kk, n] of Object.entries(r.counts)) counts[kk] = (counts[kk] ?? 0) + n;
      obj[k] = r.value;
    }
    return { value: obj, counts, had_pii: had };
  }
  return { value: v, counts: {}, had_pii: false };
}

function buildSafeSummary(redactedPayload: any, sourceApp: string, eventName: string): string {
  const keys = redactedPayload && typeof redactedPayload === "object" && !Array.isArray(redactedPayload)
    ? Object.keys(redactedPayload).slice(0, 8).join(", ")
    : "scalar_payload";
  return `[${sourceApp}] ${eventName} • fields: ${keys}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { payload, source_app = "unknown_app", event_name = "unknown_event" } = body ?? {};

    if (payload === undefined || payload === null) {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing_payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = redactValue(payload);
    const safe_summary = buildSafeSummary(result.value, source_app, event_name);

    return new Response(
      JSON.stringify({
        ok: true,
        redacted_payload: result.value,
        safe_summary,
        had_pii: result.had_pii,
        counts_by_type: result.counts,
        notice: "Phase 1 redactor. No raw PII returned. No storage.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, reason: "exception", error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
