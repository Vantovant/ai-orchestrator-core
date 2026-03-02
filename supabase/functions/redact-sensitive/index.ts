import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PII patterns for South Africa
const PATTERNS: Record<string, RegExp> = {
  sa_id: /\b\d{13}\b/g,                                        // 13-digit SA ID numbers
  bank_account: /\b\d{9,12}\b/g,                               // 9-12 digit bank account runs
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,  // email addresses
  phone_intl: /\+27\s?\d[\d\s-]{7,12}/g,                       // +27 phone numbers
  phone_local: /\b0[1-9]\d[\d\s-]{7,10}\b/g,                   // 0xx local SA phones
  confidential_tag: /\[?CONFIDENTIAL\]?|RESTRICTED|SENSITIVE|PRIVILEGED/gi,
};

const REPLACEMENTS: Record<string, string> = {
  sa_id: "[REDACTED_ID]",
  bank_account: "[REDACTED_BANK]",
  email: "[REDACTED_EMAIL]",
  phone_intl: "[REDACTED_PHONE]",
  phone_local: "[REDACTED_PHONE]",
  confidential_tag: "[REDACTED_TAG]",
};

export function redactText(text: string): { redacted_text: string; had_pii: boolean; counts_by_type: Record<string, number> } {
  let result = text;
  const counts: Record<string, number> = {};
  let had_pii = false;

  // Process in order: more specific patterns first
  const orderedKeys = ["phone_intl", "sa_id", "email", "bank_account", "phone_local", "confidential_tag"];

  for (const key of orderedKeys) {
    const pattern = new RegExp(PATTERNS[key].source, PATTERNS[key].flags);
    const matches = result.match(pattern);
    if (matches && matches.length > 0) {
      counts[key] = matches.length;
      had_pii = true;
      result = result.replace(pattern, REPLACEMENTS[key]);
    }
  }

  return { redacted_text: result, had_pii, counts_by_type: counts };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, workspace_id, reason } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = redactText(text);

    return new Response(JSON.stringify({
      ...result,
      workspace_id: workspace_id || null,
      reason: reason || "unspecified",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
