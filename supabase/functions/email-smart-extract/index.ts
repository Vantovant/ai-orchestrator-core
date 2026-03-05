import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROMPT_VERSION = "v2.1";

// Versioned prompt V2.1 – money direction classifier with strict account matching
const SYSTEM_PROMPT = `You are VantoOS "Smart Extract" for Email. Your job is to read an email (metadata + snippet + optional capped body) and output ONE strict JSON object. Do not write explanations. Do not wrap in markdown. Do not add extra keys. If a field is unknown, use null or an empty string/array as appropriate.

PII SAFETY RULES (MANDATORY):
- Never output full card numbers, full ID numbers, or any secret tokens.
- If you detect sensitive identifiers, include only safe hints (e.g., last 4 digits) in account_hint/reference.
- Do not copy large chunks of body text. Use short summary only.

TASK:
1) Classify the email into one detected_type: expense | invoice | subscription | travel | task | meeting | fyi | other

2) MONEY DIRECTION CLASSIFICATION (CRITICAL – follow these rules exactly):
You will receive user_context.selected_account with the user's bank account details (last4, account_type).
You will also receive user_context.known_accounts with all the user's bank accounts.
Based on the email text, determine the money direction:

RULE 1 – INCOME: If text indicates money credited/received/paid INTO the user's selected account (e.g., "paid to Current a/c..XXXX" where XXXX matches selected_account.last4, or "credit", "deposit", "received"), classify as:
  - money_direction.transaction_type = "income"
  - money_direction.direction = "in"
  - money_direction.ui_action = "create_income"
  - If reference contains "commission" or "commissions", set money_direction.category = "Commission Income"
  - Otherwise set money_direction.category = "Sales/Revenue"

RULE 2 – EXPENSE: If text indicates money paid/transferred/debited FROM the user's account to an external party (purchase, withdrawal, payment to vendor), classify as:
  - money_direction.transaction_type = "expense"
  - money_direction.direction = "out"
  - money_direction.ui_action = "create_expense"
  - money_direction.category = appropriate category

RULE 3 – BANK FEE: If text indicates bank charges, service fee, monthly fee, transaction fee, classify as:
  - money_direction.transaction_type = "bank_fee"
  - money_direction.direction = "out"
  - money_direction.ui_action = "create_expense"
  - money_direction.category = "Bank Charges"

RULE 4 – TRANSFER: If it is internal movement between user's own accounts (e.g., savings → current), classify as:
  - money_direction.transaction_type = "transfer"
  - money_direction.direction = "neutral"
  - money_direction.ui_action = "none"
  - money_direction.category = "Transfer"

RULE 5 – UNKNOWN: If direction is unclear, use:
  - money_direction.transaction_type = "unknown"
  - money_direction.direction = "neutral"
  - money_direction.confidence < 0.55
  - money_direction.ui_action = "none"

3) Extract structured entities when applicable:
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
- counterparty: the other party in the transaction (person/company name)

4) Recommend routing destinations:
- suggested_routes must include at least one route.
- CRITICAL ROUTING CONSISTENCY:
  - If money_direction.ui_action == "create_income", you MUST include a route with target = "finance_income"
  - If money_direction.ui_action == "create_expense", you MUST include a route with target = "finance_expense"
  - The first route should always be the finance route matching the money direction.

OUTPUT JSON (RETURN EXACTLY THIS SHAPE, NO EXTRA KEYS):
{
  "email_id": "string",
  "detected_type": "expense|invoice|subscription|travel|task|meeting|fyi|other",
  "confidence": 0.0,
  "summary": "string",
  "money_direction": {
    "transaction_type": "income|expense|transfer|bank_fee|unknown",
    "direction": "in|out|neutral",
    "amount": null,
    "currency": "ZAR",
    "datetime": null,
    "reference": null,
    "counterparty": null,
    "category": "Commission Income|Sales/Revenue|Bank Charges|Transfer|Other",
    "confidence": 0.0,
    "reason": "max 18 words",
    "ui_action": "create_income|create_expense|none"
  },
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
    "line_items": [],
    "counterparty": null
  },
  "suggested_routes": [
    {
      "target": "finance_expense|finance_income|task|meeting|reminder|notes|project",
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
  "money_direction",
]);
const ALLOWED_ENTITY_KEYS = new Set([
  "merchant", "amount", "currency", "transaction_type", "date",
  "account_hint", "reference", "category_suggestion", "vendor_email",
  "subscription_hint", "line_items", "counterparty",
]);
const ALLOWED_MONEY_DIR_KEYS = new Set([
  "transaction_type", "direction", "amount", "currency", "datetime",
  "reference", "counterparty", "category", "confidence", "reason", "ui_action",
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
    if (k === "entities" || k === "suggested_routes" || k === "money_direction") continue;
    out[k] = raw[k] ?? null;
  }

  // Entities
  if (raw.entities && typeof raw.entities === "object") {
    const ent: any = {};
    for (const k of ALLOWED_ENTITY_KEYS) {
      ent[k] = raw.entities[k] ?? null;
    }
    out.entities = ent;
  } else {
    out.entities = {};
  }

  // Money direction
  if (raw.money_direction && typeof raw.money_direction === "object") {
    const md: any = {};
    for (const k of ALLOWED_MONEY_DIR_KEYS) {
      md[k] = raw.money_direction[k] ?? null;
    }
    md.transaction_type = md.transaction_type || "unknown";
    md.direction = md.direction || "neutral";
    md.ui_action = md.ui_action || "none";
    md.confidence = typeof md.confidence === "number" ? md.confidence : 0;
    out.money_direction = md;
  } else {
    out.money_direction = {
      transaction_type: "unknown",
      direction: "neutral",
      amount: raw.entities?.amount ?? null,
      currency: raw.entities?.currency ?? "ZAR",
      datetime: raw.entities?.date ?? null,
      reference: raw.entities?.reference ?? null,
      counterparty: raw.entities?.merchant ?? null,
      category: raw.entities?.category_suggestion ?? "Other",
      confidence: 0,
      reason: "Not classified by AI",
      ui_action: "none",
    };
  }

  // Routes
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

  // ── ENFORCE ROUTING CONSISTENCY ──
  // If money_direction says create_income, ensure finance_income route exists (and vice versa)
  const uiAction = out.money_direction?.ui_action;
  if (uiAction === "create_income") {
    const hasIncomeRoute = out.suggested_routes.some((r: any) => r.target === "finance_income");
    if (!hasIncomeRoute) {
      // Replace first finance_expense route or prepend
      const expIdx = out.suggested_routes.findIndex((r: any) => r.target === "finance_expense");
      const incomeRoute = {
        target: "finance_income",
        account_id: null,
        project_id: null,
        category: out.money_direction.category || "Sales/Revenue",
        confidence: out.money_direction.confidence || 0.7,
        reason: out.money_direction.reason || "Income detected",
      };
      if (expIdx >= 0) {
        out.suggested_routes[expIdx] = incomeRoute;
      } else {
        out.suggested_routes.unshift(incomeRoute);
      }
    }
  } else if (uiAction === "create_expense") {
    const hasExpenseRoute = out.suggested_routes.some((r: any) => r.target === "finance_expense");
    if (!hasExpenseRoute) {
      const incIdx = out.suggested_routes.findIndex((r: any) => r.target === "finance_income");
      const expenseRoute = {
        target: "finance_expense",
        account_id: null,
        project_id: null,
        category: out.money_direction.category || "Other",
        confidence: out.money_direction.confidence || 0.7,
        reason: out.money_direction.reason || "Expense detected",
      };
      if (incIdx >= 0) {
        out.suggested_routes[incIdx] = expenseRoute;
      } else {
        out.suggested_routes.unshift(expenseRoute);
      }
    }
  }

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
    const selectedAccount = body.selected_account ?? null; // { last4, account_type, account_id }
    const requestLast4 = selectedAccount?.last4 || null;

    if (!emailId) {
      return new Response(JSON.stringify({ error: "email_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check cache first (skip on force rerun)
    // Only use cache if prompt_version AND selected_account_last4 match
    if (!forceRerun) {
      const { data: cached } = await userClient
        .from("email_extracts")
        .select("*")
        .eq("email_id", emailId)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (cached) {
        const cachedVersion = (cached as any).prompt_version || "v2";
        const cachedLast4 = (cached as any).selected_account_last4 || null;
        const versionMatch = cachedVersion === PROMPT_VERSION;
        const accountMatch = cachedLast4 === requestLast4;

        if (versionMatch && accountMatch) {
          return new Response(JSON.stringify({ extract: cached, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Cache stale – fall through to rerun AI
        console.log(`[email-smart-extract] Cache miss: version=${cachedVersion}!=${PROMPT_VERSION} or last4=${cachedLast4}!=${requestLast4}`);
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
        selected_account: selectedAccount,
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

    // Sanitize: strip extra keys + enforce routing consistency
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
            if ((route.target === "finance_expense" || route.target === "finance_income") && !route.account_id) {
              route.account_id = acc.account_id;
            }
          }
          break;
        }
      }
    }

    // ── Upsert into DB with prompt_version + selected_account_last4 ──
    const db = createClient(supabaseUrl, serviceKey);
    const extractRow = {
      user_id: user.id,
      email_id: emailId,
      detected_type: sanitized.detected_type || "other",
      confidence: sanitized.confidence ?? 0,
      summary: sanitized.summary || "",
      entities_json: { ...entities, money_direction: sanitized.money_direction },
      suggested_routes_json: routes,
      requires_user_confirmation: sanitized.requires_user_confirmation ?? true,
      deleted_at: null,
      prompt_version: PROMPT_VERSION,
      selected_account_last4: requestLast4,
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