import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are VantoOS "Smart Extract" for Email. Your job is to read an email (metadata + snippet + optional capped body) and output ONE strict JSON object. Do not write explanations. Do not wrap in markdown. Do not add extra keys. If a field is unknown, use null or an empty string/array as appropriate.

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

OUTPUT JSON (RETURN EXACTLY THIS SHAPE):
{
  "email_id": "string",
  "detected_type": "expense|invoice|subscription|travel|task|meeting|fyi|other",
  "confidence": 0.0,
  "summary": "string",
  "entities": {
    "merchant": "string|null",
    "amount": null,
    "currency": "ZAR",
    "transaction_type": null,
    "date": "ISO|null",
    "account_hint": "string|null",
    "reference": "string|null",
    "category_suggestion": "string|null",
    "vendor_email": "string|null",
    "subscription_hint": "string|null",
    "line_items": []
  },
  "suggested_routes": [
    {
      "target": "finance_expense|task|meeting|reminder|notes|project",
      "account_id": null,
      "project_id": null,
      "category": "string|null",
      "confidence": 0.0,
      "reason": "string"
    }
  ],
  "requires_user_confirmation": true
}`;

// Simple PII redaction before sending to AI
function redactPII(text: string): string {
  if (!text) return "";
  let result = text;
  // SA ID numbers (13 digits)
  result = result.replace(/\b\d{13}\b/g, "[REDACTED_ID]");
  // Phone numbers
  result = result.replace(/\+27\s?\d[\d\s-]{7,12}/g, "[REDACTED_PHONE]");
  result = result.replace(/\b0[1-9]\d[\d\s-]{7,10}\b/g, "[REDACTED_PHONE]");
  // Bank account numbers (9-12 digits, but not amounts)
  result = result.replace(/\b\d{9,12}\b/g, "[REDACTED_NUM]");
  return result;
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

    // Check cache first
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

    const knownAccounts = (bankAccounts ?? []).map(a => ({
      account_id: a.id,
      name: a.account_name,
      label: a.bank_name,
      hints: [a.last4, a.bank_name].filter(Boolean),
    }));

    // Redact PII from email content
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
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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

    // Parse result
    let extractResult: any;
    try {
      const raw = aiData.result;
      if (typeof raw === "string") {
        // Try to parse, strip markdown fences if present
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        extractResult = JSON.parse(cleaned);
      } else {
        extractResult = raw;
      }
    } catch (e) {
      console.error("[email-smart-extract] Failed to parse AI result:", aiData.result);
      return new Response(JSON.stringify({ error: "AI_PARSE_ERROR", raw: aiData.result }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!extractResult || !extractResult.detected_type) {
      return new Response(JSON.stringify({ error: "AI_INVALID_RESULT", raw: extractResult }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Match bank account hints to actual account IDs
    const entities = extractResult.entities || {};
    const routes = extractResult.suggested_routes || [];
    if (entities.account_hint && knownAccounts.length > 0) {
      const hint = (entities.account_hint || "").toLowerCase();
      for (const acc of knownAccounts) {
        const matches = acc.hints.some(h => h && hint.includes(h.toLowerCase()));
        if (matches) {
          // Set account_id on finance routes
          for (const route of routes) {
            if (route.target === "finance_expense" && !route.account_id) {
              route.account_id = acc.account_id;
            }
          }
          break;
        }
      }
    }

    // Store in DB (upsert)
    const db = createClient(supabaseUrl, serviceKey);
    const extractRow = {
      user_id: user.id,
      email_id: emailId,
      detected_type: extractResult.detected_type,
      confidence: extractResult.confidence ?? 0,
      summary: extractResult.summary || "",
      entities_json: entities,
      suggested_routes_json: routes,
      requires_user_confirmation: extractResult.requires_user_confirmation ?? true,
    };

    // Delete existing if force rerun
    if (forceRerun) {
      await db.from("email_extracts").delete().eq("email_id", emailId).eq("user_id", user.id);
    }

    const { data: saved, error: saveErr } = await db
      .from("email_extracts")
      .insert(extractRow)
      .select()
      .single();

    if (saveErr) {
      console.error("[email-smart-extract] save error:", saveErr);
      // Return result even if save fails
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
