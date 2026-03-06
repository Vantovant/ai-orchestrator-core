import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token",
};

const SNAPSHOT_MAX_CHARS = 6000;

const PII_PATTERNS: Record<string, RegExp> = {
  sa_id: /\b\d{13}\b/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone_intl: /\+27\s?\d[\d\s-]{7,12}/g,
  phone_local: /\b0[1-9]\d[\d\s-]{7,10}\b/g,
  bank_account: /\b\d{8,12}\b/g,
};

function redactPII(text: string): { redacted: string; hadPII: boolean } {
  let result = text;
  let hadPII = false;
  for (const [, pattern] of Object.entries(PII_PATTERNS)) {
    const re = new RegExp(pattern.source, pattern.flags);
    if (re.test(result)) {
      hadPII = true;
      result = result.replace(new RegExp(pattern.source, pattern.flags), "[REDACTED]");
    }
  }
  return { redacted: result, hadPII };
}

async function resolveUser(req: Request): Promise<string> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const extToken = req.headers.get("x-extension-token");
  if (extToken) {
    const tokenHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extToken)))
    ).map(b => b.toString(16).padStart(2, "0")).join("");
    const { data } = await sb
      .from("extension_tokens").select("user_id")
      .eq("token_hash", tokenHash).is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (data) return data.user_id;
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await uc.auth.getUser();
    if (user && !error) return user.id;
  }
  throw new Error("Unauthorized");
}

const MONEY_PATTERNS = [
  /[R$€£]\s?[\d,]+(?:\.\d{1,2})?/i,
  /\b(?:paid|credited|debited|deposited|transferred|invoice|fee|commission|payment|amount|balance|EFT|debit order)\b/i,
  /\b\d+[\s,]?\d+\s*(?:rand|ZAR|USD|EUR)\b/i,
];

function hasMoneySignals(text: string): boolean {
  return MONEY_PATTERNS.some(p => p.test(text));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const userId = await resolveUser(req);
    const { chat_key, chat_title, messages, selected_text, user_context } = await req.json();

    if (!chat_key || !messages?.length) throw new Error("chat_key and messages required");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check BYOK
    const { data: keyData } = await sb
      .from("user_ai_keys")
      .select("use_own_keys, openai_key_encrypted, gemini_key_encrypted")
      .eq("user_id", userId).maybeSingle();
    const hasKey = keyData?.use_own_keys && (keyData.openai_key_encrypted || keyData.gemini_key_encrypted);

    let isBetaAssist = false;
    let betaRemaining = 0;
    if (!hasKey) {
      const { data: betaData } = await sb
        .from("beta_testers")
        .select("is_active, assisted_ai_remaining, assisted_ai_expires_at")
        .eq("user_id", userId).maybeSingle();
      if (betaData?.is_active && betaData.assisted_ai_remaining > 0) {
        const notExpired = !betaData.assisted_ai_expires_at || new Date(betaData.assisted_ai_expires_at) > new Date();
        if (notExpired) { isBetaAssist = true; betaRemaining = betaData.assisted_ai_remaining; }
      }
      if (!isBetaAssist) {
        return new Response(JSON.stringify({
          error: "ai_keys_missing",
          message: "Connect your personal OpenAI or Gemini key in Settings → AI Keys.",
          ai_status: "blocked",
        }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Redact PII from messages
    let redactionToast = false;
    const cleanMessages = messages.slice(-30).map((m: any) => {
      const { redacted, hadPII } = redactPII(m.text || "");
      if (hadPII) redactionToast = true;
      return { text: redacted, direction: m.direction || "unknown", timestamp: m.timestamp || null };
    });

    const selectedClean = selected_text ? redactPII(selected_text).redacted : "";

    // Build conversation text for AI
    const conversationText = cleanMessages.map((m: any, i: number) =>
      `[MSG${i}][${m.direction}]${m.timestamp ? ` (${m.timestamp})` : ""}: ${m.text}`
    ).join("\n");

    const fullText = conversationText + (selectedClean ? `\n\nUser-selected text: ${selectedClean}` : "");
    const truncated = fullText.slice(0, SNAPSHOT_MAX_CHARS);
    const moneyDetected = hasMoneySignals(fullText);

    const locale = user_context?.locale || "ZA";
    const currency = user_context?.currency_default || "ZAR";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const systemPrompt = `You are a PhD-level executive analyst for VantoOS (executive OS for South African entrepreneurs).
Analyze the WhatsApp conversation with academic rigor and produce a structured, evidence-backed executive briefing.
Locale: ${locale}, Default currency: ${currency}.

CRITICAL ANTI-HALLUCINATION RULES:
1. EVERY claim MUST reference a direct quote from the transcript using the [MSG#] index.
2. If you cannot find a supporting quote, do NOT make the claim. Set needs_verification=true.
3. extracted_actions: EVERY action MUST have at least 1 evidence_quote from the transcript. Actions without evidence are FORBIDDEN and must be omitted.
4. For money_direction: ONLY set if CLEAR money patterns exist (amounts with R/$/€, bank keywords). Otherwise: {"transaction_type":"unknown","ui_action":"none","confidence":0}
5. NEVER invent facts. NEVER extrapolate beyond what the transcript explicitly states.
6. Provide key_points as bullet-point insights, sentiment analysis, stakeholder identification, risks, and opportunities.`;

    const toolDef = {
      type: "function" as const,
      function: {
        name: "whatsapp_phd_analysis",
        description: "Return PhD-grade structured WhatsApp chat analysis with evidence",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "2-4 sentence executive summary, each statement backed by evidence" },
            key_points: {
              type: "array",
              items: { type: "string" },
              description: "3-7 bullet-point key insights from the conversation",
            },
            sentiment: { type: "string", description: "One-line sentiment analysis of the conversation tone" },
            stakeholders: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string", description: "Inferred role or relationship" },
                },
                required: ["name"],
              },
              description: "People identified in the conversation with inferred roles",
            },
            risks: {
              type: "array",
              items: { type: "string" },
              description: "Potential risks or concerns identified",
            },
            opportunities: {
              type: "array",
              items: { type: "string" },
              description: "Potential opportunities identified",
            },
            confidence: { type: "number", description: "0-1 confidence in analysis" },
            needs_verification: { type: "boolean", description: "True if any claim lacks direct evidence" },
            evidence: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  claim: { type: "string", description: "A specific claim" },
                  quote: { type: "string", description: "Direct quote from transcript" },
                  source: { type: "string", description: "Who said it + message index e.g. 'MSG3 - John'" },
                },
                required: ["claim", "quote", "source"],
              },
              description: "Evidence backing each summary claim. REQUIRED for every claim.",
            },
            extracted_actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  action_type: { type: "string", enum: ["task", "meeting", "reminder", "notes"] },
                  priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                  suggested_due_date: { type: "string", description: "ISO date if inferable, or null" },
                  details: { type: "string", description: "Extra context" },
                  evidence_quotes: {
                    type: "array",
                    items: { type: "string" },
                    description: "Direct quotes from transcript supporting this action. REQUIRED, min 1.",
                  },
                  message_refs: {
                    type: "array",
                    items: { type: "string" },
                    description: "Message indices or timestamps e.g. ['MSG3', 'MSG7']",
                  },
                },
                required: ["title", "action_type", "priority", "evidence_quotes", "message_refs"],
              },
            },
            money_direction: {
              type: "object",
              properties: {
                transaction_type: { type: "string", enum: ["income", "expense", "bank_fee", "transfer", "commission", "unknown"] },
                amount: { type: "number" },
                currency: { type: "string" },
                description: { type: "string" },
                ui_action: { type: "string", enum: ["create_income", "create_expense", "none"] },
                confidence: { type: "number" },
              },
              required: ["transaction_type", "ui_action", "confidence"],
            },
            draft_reply: { type: "string", description: "Optional suggested reply text" },
          },
          required: ["summary", "key_points", "sentiment", "confidence", "needs_verification", "evidence", "extracted_actions", "money_direction"],
        },
      },
    };

    const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        calling_function: "smart-capture-whatsapp",
        workspace_type: "private",
        beta_assist_mode: isBetaAssist,
        beta_user_id: isBetaAssist ? userId : undefined,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Produce a PhD-grade executive analysis of this WhatsApp conversation:\n\nChat: ${chat_title || "Unknown"}\n\n${truncated}` },
        ],
        tools: [toolDef],
        tool_choice: { type: "function", function: { name: "whatsapp_phd_analysis" } },
      }),
    });

    const aiData = await aiResponse.json();
    let aiResult: any = null;
    if (aiData.result && typeof aiData.result === "object") {
      aiResult = aiData.result;
    } else if (typeof aiData.result === "string") {
      try { aiResult = JSON.parse(aiData.result); } catch { /* fallback */ }
    }

    if (!aiResult) {
      aiResult = {
        summary: `WhatsApp chat: ${chat_title || "Unknown"}`,
        key_points: [],
        sentiment: "Unable to analyze",
        stakeholders: [],
        risks: [],
        opportunities: [],
        confidence: 0.3,
        needs_verification: true,
        evidence: [],
        extracted_actions: [],
        money_direction: { transaction_type: "unknown", ui_action: "none", confidence: 0 },
      };
    }

    // HARD GATE: enforce money_direction rules
    if (!moneyDetected) {
      aiResult.money_direction = { transaction_type: "unknown", ui_action: "none", confidence: 0 };
    } else if (aiResult.money_direction?.confidence < 0.75) {
      aiResult.money_direction.ui_action = "none";
    }

    // HARD GATE: drop actions without evidence_quotes
    if (aiResult.extracted_actions) {
      aiResult.extracted_actions = aiResult.extracted_actions.filter((a: any) =>
        a.evidence_quotes && a.evidence_quotes.length > 0
      );
    }

    return new Response(JSON.stringify({
      summary: aiResult.summary,
      key_points: aiResult.key_points || [],
      sentiment: aiResult.sentiment || null,
      stakeholders: aiResult.stakeholders || [],
      risks: aiResult.risks || [],
      opportunities: aiResult.opportunities || [],
      confidence: aiResult.confidence,
      needs_verification: aiResult.needs_verification ?? true,
      evidence: aiResult.evidence || [],
      extracted_actions: aiResult.extracted_actions || [],
      money_direction: aiResult.money_direction,
      draft_reply: aiResult.draft_reply || null,
      redaction_toast: redactionToast,
      ai_status: aiData.ai_status || "ok",
      provider_used: aiData.provider_used || "unknown",
      mode: aiData.mode || "byok",
      assisted_remaining: aiData.assisted_remaining,
      chat_key,
      chat_title,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Unauthorized" ? 401 : msg.includes("ai_keys") ? 402 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
