import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function redactPII(text: string): string {
  return text
    .replace(/\b\d{13}\b/g, "[ID_REDACTED]")
    .replace(/\b\d{10,12}\b/g, "[ACCT_REDACTED]")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/(\+27|0)\d{9}/g, "[PHONE]")
    .replace(/\[CONFIDENTIAL\][\s\S]*?\[\/CONFIDENTIAL\]/gi, "[REDACTED_BLOCK]");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content, context } = await req.json();
    if (!content) return new Response(JSON.stringify({ suggestions: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const redacted = redactPII(content.slice(0, 3000));
    const contextStr = context ? JSON.stringify(context).slice(0, 500) : "";

    const systemPrompt = `You are a South African executive finance assistant. Analyze the user's finance notes and extract structured actions.

Current context: ${contextStr}

RULES:
- Extract actionable items: budget subscriptions, instalments, debts, income entries, opportunities
- For amounts, use numbers (e.g. 2500 not "R2500")
- For cadence: monthly, yearly, weekly, quarterly, custom
- due_day_of_month: 1-31 for monthly items
- due_month_of_year: 1-12 for yearly items
- Confidence 0-1 based on clarity
- Only extract clear, actionable items
- South African context: ZAR currency, local merchants

Return structured actions using the extract_finance_actions tool.`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: redacted },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_finance_actions",
            description: "Extract finance actions from notes",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      actionType: { type: "string", enum: ["create_budget_item", "update_budget_item", "mark_paid", "create_debt_item", "create_income_item", "create_opportunity", "create_transaction_note"] },
                      targetTab: { type: "string", enum: ["Budget", "Debt Radar", "Income Engine", "Opportunities", "Overview"] },
                      payload: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["subscription", "instalment"] },
                          name: { type: "string" },
                          description: { type: "string" },
                          amount: { type: "number" },
                          cadence: { type: "string", enum: ["monthly", "yearly", "weekly", "quarterly", "custom"] },
                          due_day_of_month: { type: "number" },
                          due_month_of_year: { type: "number" },
                          category: { type: "string" },
                          vendor: { type: "string" },
                          autopay: { type: "boolean" },
                          notify_days_before: { type: "number" },
                        },
                      },
                      confidence: { type: "number" },
                    },
                    required: ["actionType", "targetTab", "payload", "confidence"],
                  },
                },
              },
              required: ["suggestions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_finance_actions" } },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("AI error:", errText);
      return new Response(JSON.stringify({ suggestions: [], error: "AI service unavailable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await res.json();
    let suggestions = [];

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        suggestions = parsed.suggestions || [];
      } catch {}
    }

    if (suggestions.length === 0) {
      const msgContent = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = msgContent.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
      if (jsonMatch) {
        try { suggestions = JSON.parse(jsonMatch[0]).suggestions || []; } catch {}
      }
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ suggestions: [], error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
