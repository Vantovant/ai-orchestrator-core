import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMPTY_RESULT = {
  moneyPlan: { thisWeek: [], thisMonth: [] },
  debtPlan: { strategy: "hybrid", nextSteps: [] },
  incomePlan: { increaseIncomeActions: [], opportunities: [] },
  riskFlags: [],
  saContextNotes: [],
  disclaimer: "General guidance only. Not legal, tax, or financial advice.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Get finance snapshot
    const snapshotRes = await fetch(`${supabaseUrl}/functions/v1/finance-snapshot-build`, {
      headers: {
        Authorization: authHeader ?? "",
        "Content-Type": "application/json",
        apikey: anonKey,
      },
    });

    const snapshot = await snapshotRes.json();
    if (!snapshotRes.ok) {
      return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: "error", message: "Finance snapshot failed", snapshot: {} }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Call AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: "degraded", message: "AI not configured", snapshot }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a South African financial mentor for executives. Analyze this finance snapshot and provide actionable guidance.

RULES:
- Only use data from the snapshot. Do not hallucinate.
- Amounts are in ${snapshot.currency ?? "ZAR"}.
- User bankability: ${snapshot.bankability ?? "bankable"}.
- Adapt advice: if unbankable, focus on cashflow stabilization and avoiding predatory lending. If bankable, focus on optimization and growth.
- Keep advice general and high-level. Never give specific legal/tax/lender instructions.
- Consider South African economic context (load-shedding, interest rates, informal economy, compliance).
- Return valid JSON matching the tool schema.

SNAPSHOT:
${JSON.stringify(snapshot, null, 2)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate my finance briefing with money plan, debt strategy, income growth actions, risk flags, and SA-specific notes." },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "finance_briefing",
              description: "South African executive finance briefing with money plan, debt strategy, income plan, risk flags.",
              parameters: {
                type: "object",
                properties: {
                  moneyPlan: {
                    type: "object",
                    properties: {
                      thisWeek: { type: "array", items: { type: "object", properties: { action: { type: "string" }, impact: { type: "string" }, reason: { type: "string" } }, required: ["action", "impact", "reason"], additionalProperties: false } },
                      thisMonth: { type: "array", items: { type: "object", properties: { action: { type: "string" }, impact: { type: "string" }, reason: { type: "string" } }, required: ["action", "impact", "reason"], additionalProperties: false } },
                    },
                    required: ["thisWeek", "thisMonth"],
                    additionalProperties: false,
                  },
                  debtPlan: {
                    type: "object",
                    properties: {
                      strategy: { type: "string", enum: ["avalanche", "snowball", "hybrid"] },
                      nextSteps: { type: "array", items: { type: "string" } },
                    },
                    required: ["strategy", "nextSteps"],
                    additionalProperties: false,
                  },
                  incomePlan: {
                    type: "object",
                    properties: {
                      increaseIncomeActions: { type: "array", items: { type: "string" } },
                      opportunities: { type: "array", items: { type: "string" } },
                    },
                    required: ["increaseIncomeActions", "opportunities"],
                    additionalProperties: false,
                  },
                  riskFlags: { type: "array", items: { type: "string" } },
                  saContextNotes: { type: "array", items: { type: "string" } },
                  disclaimer: { type: "string" },
                },
                required: ["moneyPlan", "debtPlan", "incomePlan", "riskFlags", "saContextNotes", "disclaimer"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "finance_briefing" } },
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      const aiStatus = status === 429 ? "rate_limited" : status === 402 ? "degraded" : "error";
      const message = status === 429 ? "AI rate limited, try again later" : status === 402 ? "AI credits exhausted" : "AI unavailable";
      return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: aiStatus, message, snapshot }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: "error", message: "AI returned no structured data", snapshot }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const briefing = JSON.parse(toolCall.function.arguments);

    // Save as assistant_run for persistence
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    await adminClient.from("assistant_runs").insert({
      user_id: user.id,
      snapshot_json: snapshot,
      result_json: { type: "finance_briefing", ...briefing },
    });

    return new Response(JSON.stringify({
      ...briefing,
      ai_status: "ok",
      message: "Finance briefing generated successfully",
      snapshot,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("finance-mentor error:", e);
    return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: "error", message: String(e), snapshot: {} }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
