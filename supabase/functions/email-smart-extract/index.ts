import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Versioned prompt for reproducibility
const SYSTEM_PROMPT_V1 = `You are VantoOS "Smart Extract" for Email. Your job is to read an email (metadata + snippet + optional capped body) and output ONE strict JSON object. Do not write explanations. Do not wrap in markdown. Do not add extra keys. If a field is unknown, use null or an empty string/array as appropriate.

PII SAFETY RULES (MANDATORY):
- Never output full card numbers, full ID numbers, or any secret tokens.
- If you detect sensitive identifiers, include only safe hints (e.g., last 4 digits) in account_hint/reference.
- Do not copy large chunks of body text. Use short summary only.

TASK:
1) Classify the email into one detected_type: expense | invoice | subscription | travel | task | meeting | fyi | other

2) Extract structured entities when applicable:
- merchant: who was paid / who sent the receipt
- amount: numeric value (no currency symbol), null if not found
- currency: default ZAR unless clearly another currency
- transaction_type: reserved | paid | invoice | refund | null
- date: ISO date of transaction if present; else use email date
- account_hint: safe hint only (bank name, last4, recipient)
- reference: short reference/authorization code if present
- category_suggestion: SaaS/Subscriptions, Banking Fees, Transport, Food, Utilities, Travel, Advertising, Tools, Other
- vendor_email: sender email/domain if relevant
- subscription_hint: service name and cadence if recurring
- line_items: only for invoices; array of { description, quantity, unit_price, total }

3) Recommend routing destinations:
- suggested_routes must include at least one route with target: finance_expense | task | meeting | reminder | notes | project
- For finance_expense: provide category and short reason.

OUTPUT JSON (RETURN EXACTLY THIS SHAPE, NO EXTRA KEYS):
{
  "email_id": "string",
  "detected_type": "expense|invoice|subscription|travel|task|meeting|fyi|other",
  "confidence": 0.0,
  "summary": "string",
  "entities": {
    "merchant": null,
    "amount": null,
    "currency": "ZAR",
    "transaction_type": null,
    "date": null,
    "account_hint": null,
    "reference": null,
    "category_suggestion": null,
    "vendor_email": null,
    "subscription_hint": null,
    "line_items": []
  },
  "suggested_routes": [
    {
      "target": "finance_expense|task|meeting|reminder|notes|project",
      "account_id": null,
      "project_id": null,
      "category": null,
      "confidence": 0.0,
      "reason": "string"
    }
  ],
  "requires_user_confirmation": true
}`;

const ALLOWED_TOP_KEYS = new Set([
  "email_id", "detected_type", "confidence", "summary",
  "entities", "suggested_routes", "requires_user_confirmation",
]);
const ALLOWED_ENTITY_KEYS = new Set([
  "merchant", "amount", "currency", "transaction_type", "date",
  "account_hint", "reference", "category_suggestion", "vendor_email",
  "subscription_hint", "line_items",
]);

function redactPII(text: string): string {
  if (!text) return "";
  let result = text;
  result = result.replace(/\b\d{13}\b/g, "[REDACTED_ID]");
  result = result.replace(/\+27\s?\d[\d\s-]{7,12}/g, "[REDACTED_PHONE]");
  result = result.replace(/\b0[1-9]\d[\d\s-]{7,10}\b/g, "[REDACTED_PHONE]");
  result = result.replace(/\b\d{9,12}\b/g, "[REDACTED_NUM]");
  return result;
}

/** Strip any keys not in the contract to prevent prompt injection / hallucination drift */
function sanitizeExtract(raw: any): any {
  const out: any = {};
  for (const k of ALLOWED_TOP_KEYS) {
    out[k] = raw[k] ?? null;
  }
  if (raw.entities && typeof raw.entities === "object") {
    const ent: any = {};
    for (const k of ALLOWED_ENTITY_KEYS) {
      ent[k] = raw.entities[k] ?? null;
    }
    out.entities = ent;
  } else {
    out.entities = {};
  }
  if (Array.isArray(raw.suggested_routes)) {
    out.suggested_routes = raw.suggested_routes.map((r: any) => ({
      target: r.target ?? "notes",
      account_id: r.account_id ?? null,
      project_id: r.project_id ?? null,
      category: r.category ?? null,
      confidence: r.confidence ?? 0,
      reason: r.reason ?? "",
    }));
  } else {
    out.suggested_routes = [];
  }
  out.requires_user_confirmation = raw.requires_user_confirmation ?? true;
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "AUTH_MISSING" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "AUTH_MISSING" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const emailId = body.email_id;
    const forceRerun = body.force_rerun ?? false;

    if (!emailId) {
      return new Response(JSON.stringify({ error: "email_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check cache first (skip on force rerun)
    if (!forceRerun) {
      const { data: cached } = await userClient
        .from("email_extracts")
        .select("*")
        .eq("email_id", emailId)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (cached) {
        return new Response(JSON.stringify({ extract: cached, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch email
    const { data: email, error: emailErr } = await userClient
      .from("email_messages")
      .select("id, sender, recipients, cc, subject, snippet, date, body_preview, category, urgency, intent, label_ids")
      .eq("id", emailId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (emailErr || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch user's bank accounts for context
    const { data: bankAccounts } = await userClient
      .from("bank_accounts")
      .select("id, account_name, bank_name, last4")
      .is("deleted_at", null);

    const knownAccounts = (bankAccounts ?? []).map((a: any) => ({
      account_id: a.id,
      name: a.account_name,
      label: a.bank_name,
      hints: [a.last4, a.bank_name].filter(Boolean),
    }));

    // Redact PII
    const redactedSnippet = redactPII(email.snippet || "");
    const redactedBody = redactPII((email.body_preview || "").slice(0, 1500));
    const redactedSubject = redactPII(email.subject || "");

    const userPrompt = JSON.stringify({
      email_id: emailId,
      user_context: {
        locale: "ZA",
        currency_default: "ZAR",
        known_accounts: knownAccounts,
        merchant_rules: [],
      },
      email: {
        from: email.sender,
        to: (email.recipients || []).join(", "),
        subject: redactedSubject,
        date: email.date,
        snippet: redactedSnippet,
        body_preview: redactedBody,
        labels: email.label_ids || [],
      },
    });

    // Call AI gateway
    const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT_V1 },
          { role: "user", content: userPrompt },
        ],
        calling_function: "email-smart-extract",
        preference: "fastest",
      }),
    });

    const aiData = await aiRes.json();

    if (aiData.ai_status === "blocked") {
      return new Response(JSON.stringify({ error: "AI_BLOCKED", message: aiData.message }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Strict JSON parsing ──
    let extractResult: any;
    try {
      const raw = aiData.result;
      if (typeof raw === "string") {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        extractResult = JSON.parse(cleaned);
      } else if (typeof raw === "object" && raw !== null) {
        extractResult = raw;
      } else {
        throw new Error("AI returned non-JSON value");
      }
    } catch (e) {
      console.error("[email-smart-extract] JSON parse failed:", e, "raw:", aiData.result);
      return new Response(JSON.stringify({
        error: "AI_PARSE_ERROR",
        message: "AI returned invalid data. Please try Re-run.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!extractResult || !extractResult.detected_type) {
      return new Response(JSON.stringify({
        error: "AI_PARSE_ERROR",
        message: "AI response missing required fields. Please try Re-run.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Sanitize: strip extra keys
    const sanitized = sanitizeExtract(extractResult);

    // Match bank account hints to actual account IDs
    const entities = sanitized.entities || {};
    const routes = sanitized.suggested_routes || [];
    if (entities.account_hint && knownAccounts.length > 0) {
      const hint = (entities.account_hint || "").toLowerCase();
      for (const acc of knownAccounts) {
        const matches = acc.hints.some((h: string) => h && hint.includes(h.toLowerCase()));
        if (matches) {
          for (const route of routes) {
            if (route.target === "finance_expense" && !route.account_id) {
              route.account_id = acc.account_id;
            }
          }
          break;
        }
      }
    }

    // ── Upsert into DB (no delete+insert race) ──
    const db = createClient(supabaseUrl, serviceKey);
    const extractRow = {
      user_id: user.id,
      email_id: emailId,
      detected_type: sanitized.detected_type || "other",
      confidence: sanitized.confidence ?? 0,
      summary: sanitized.summary || "",
      entities_json: entities,
      suggested_routes_json: routes,
      requires_user_confirmation: sanitized.requires_user_confirmation ?? true,
      deleted_at: null, // clear soft-delete on re-run
    };

    const { data: saved, error: saveErr } = await db
      .from("email_extracts")
      .upsert(extractRow, { onConflict: "user_id,email_id" })
      .select()
      .single();

    if (saveErr) {
      console.error("[email-smart-extract] upsert error:", saveErr);
    }

    return new Response(JSON.stringify({ extract: saved || extractRow, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[email-smart-extract] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
