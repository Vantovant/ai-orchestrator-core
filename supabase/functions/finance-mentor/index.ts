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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? serviceKey;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get finance snapshot
    const snapshotRes = await fetch(`${supabaseUrl}/functions/v1/finance-snapshot-build`, {
      headers: { Authorization: authHeader ?? "", "Content-Type": "application/json", apikey: anonKey },
    });
    const snapshot = await snapshotRes.json();
    if (!snapshotRes.ok) {
      return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: "error", message: "Finance snapshot failed", snapshot: {} }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get executive profile for role-aware advice
    const { data: profilePref } = await supabase
      .from("user_preferences").select("preference_value")
      .eq("preference_key", "executive_profile").eq("user_id", user.id).maybeSingle();
    const roleProfiles = (profilePref?.preference_value as any)?.role_profiles ?? [];
    const roleContext = roleProfiles.length > 0 ? roleProfiles.join(", ") : "general executive";

    // Get AI preference
    const { data: aiPref } = await supabase
      .from("user_preferences").select("preference_value")
      .eq("preference_key", "ai_preference").eq("user_id", user.id).maybeSingle();
    const preference = (aiPref?.preference_value as any)?.order ?? "fastest";

    // Build role-specific instructions
    let roleInstructions = "";
    if (roleProfiles.includes("gov_executive")) roleInstructions += `\n- GOV EXECUTIVE: Emphasize cashflow discipline, pension optimization, compliance reminders.`;
    if (roleProfiles.includes("attorney")) roleInstructions += `\n- ATTORNEY: Focus on billing cycle optimization, trust account compliance, collection strategies.`;
    if (roleProfiles.includes("accountant")) roleInstructions += `\n- ACCOUNTANT: Emphasize reporting deadlines, client deliverable tracking, CPD investment.`;
    if (roleProfiles.includes("network_marketer")) roleInstructions += `\n- NETWORK MARKETER: Focus on weekly income targets, expense discipline, cashflow smoothing.`;
    if (roleProfiles.includes("entrepreneur")) roleInstructions += `\n- ENTREPRENEUR: Focus on revenue growth, cashflow forecasting, investment timing.`;

    const systemPrompt = `You are a South African financial mentor for executives. Analyze this finance snapshot and provide actionable guidance.

RULES:
- Only use data from the snapshot. Do not hallucinate.
- Amounts are in ${snapshot.currency ?? "ZAR"}.
- User bankability: ${snapshot.bankability ?? "bankable"}.
- User role profile(s): ${roleContext}.
- ROLE-SPECIFIC GUIDANCE:${roleInstructions || "\n- General executive: balanced advice across all areas."}
- Keep advice general and high-level. Never give specific legal/tax/lender instructions.
- Consider South African economic context.
- Return valid JSON matching the tool schema.

SNAPSHOT:
${JSON.stringify(snapshot, null, 2)}`;

    const tools = [{
      type: "function",
      function: {
        name: "finance_briefing",
        description: "South African executive finance briefing.",
        parameters: {
          type: "object",
          properties: {
            moneyPlan: {
              type: "object",
              properties: {
                thisWeek: { type: "array", items: { type: "object", properties: { action: { type: "string" }, impact: { type: "string" }, reason: { type: "string" } }, required: ["action", "impact", "reason"], additionalProperties: false } },
                thisMonth: { type: "array", items: { type: "object", properties: { action: { type: "string" }, impact: { type: "string" }, reason: { type: "string" } }, required: ["action", "impact", "reason"], additionalProperties: false } },
              },
              required: ["thisWeek", "thisMonth"], additionalProperties: false,
            },
            debtPlan: {
              type: "object",
              properties: {
                strategy: { type: "string", enum: ["avalanche", "snowball", "hybrid"] },
                nextSteps: { type: "array", items: { type: "string" } },
              },
              required: ["strategy", "nextSteps"], additionalProperties: false,
            },
            incomePlan: {
              type: "object",
              properties: {
                increaseIncomeActions: { type: "array", items: { type: "string" } },
                opportunities: { type: "array", items: { type: "string" } },
              },
              required: ["increaseIncomeActions", "opportunities"], additionalProperties: false,
            },
            riskFlags: { type: "array", items: { type: "string" } },
            saContextNotes: { type: "array", items: { type: "string" } },
            disclaimer: { type: "string" },
          },
          required: ["moneyPlan", "debtPlan", "incomePlan", "riskFlags", "saContextNotes", "disclaimer"],
          additionalProperties: false,
        },
      },
    }];

    const gatewayRes = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate my finance briefing with money plan, debt strategy, income growth actions, risk flags, and SA-specific notes." },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "finance_briefing" } },
        preference,
      }),
    });

    const gatewayData = await gatewayRes.json();

    if (gatewayData.ai_status !== "ok" || !gatewayData.result) {
      return new Response(JSON.stringify({
        ...EMPTY_RESULT,
        ai_status: gatewayData.ai_status ?? "error",
        provider_used: gatewayData.provider_used ?? "none",
        message: gatewayData.message ?? "AI unavailable",
        snapshot,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const briefing = gatewayData.result;

    // Save as assistant_run
    const adminClient = createClient(supabaseUrl, serviceKey);
    await adminClient.from("assistant_runs").insert({
      user_id: user.id,
      snapshot_json: snapshot,
      result_json: { type: "finance_briefing", role_profiles: roleProfiles, ...briefing },
    });

    return new Response(JSON.stringify({
      ...briefing,
      ai_status: "ok",
      provider_used: gatewayData.provider_used,
      message: gatewayData.message,
      role_profiles: roleProfiles,
      snapshot,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("finance-mentor error:", e);
    return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: "error", message: String(e), snapshot: {} }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
