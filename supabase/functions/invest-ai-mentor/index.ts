import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured", ai_status: "error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? "briefing"; // briefing | teach | nextstep
    const question = body.question ?? "";

    const db = createClient(supabaseUrl, serviceKey);

    // Build snapshot
    const [pricesRes, newsRes, holdingsRes, alertsRes] = await Promise.all([
      db.from("market_prices_cache").select("symbol,asset_type,price,change_1d,currency").limit(20),
      db.from("market_news_cache").select("title,summary,tags").order("published_at", { ascending: false }).limit(5),
      db.from("invest_manual_holdings").select("symbol,asset_type,qty,avg_cost,currency").eq("user_id", user.id).is("deleted_at", null).limit(10),
      db.from("invest_alerts").select("symbol,rule_type,enabled").eq("user_id", user.id).is("deleted_at", null).limit(10),
    ]);

    const snapshot = {
      prices: (pricesRes.data ?? []).map(p => `${p.symbol}: ${p.price} ${p.currency} (1d: ${p.change_1d}%)`).join("\n"),
      headlines: (newsRes.data ?? []).map(n => `- ${n.title}: ${n.summary}`).join("\n"),
      holdings: (holdingsRes.data ?? []).map(h => `${h.symbol} (${h.asset_type}): ${h.qty} @ ${h.avg_cost ?? '?'} ${h.currency}`).join("\n") || "No holdings yet",
      alerts: (alertsRes.data ?? []).length + " active alerts",
    };

    const snapshotText = [
      "=== MARKET PRICES ===", snapshot.prices,
      "=== HEADLINES ===", snapshot.headlines,
      "=== USER HOLDINGS ===", snapshot.holdings,
      "=== ALERTS ===", snapshot.alerts,
    ].join("\n").slice(0, 3000);

    const modePrompts: Record<string, string> = {
      briefing: "Give an executive market briefing for today. Structure: Summary (2-3 lines), What Moved (bullets), Why It Matters (plain language), What To Watch Next, Safe Actions (add watchlist, set alert, paper trade, read lesson). Never say 'buy now'. Be educational and neutral.",
      teach: "The user is a complete beginner. Explain the concept they ask about in simple, South African-friendly language. Use ZAR examples. No jargon without explaining it. Be encouraging.",
      nextstep: "Based on the user's portfolio and market conditions, suggest 3-5 safe next steps. Focus on learning, watchlisting, paper trading, or setting alerts. Never recommend buying/selling real assets. Explain each suggestion.",
    };

    const systemPrompt = `You are an investment coach for a South African executive who is NEW to investing. You teach, explain, and guide — you NEVER tell them to buy or sell. You always speak in plain language. Rand (ZAR) is their home currency.\n\nRules:\n- No financial advice or "buy now" directives\n- Explain every term\n- Suggest safe actions only (watchlist, learn, paper trade, alerts)\n- Be neutral and educational\n\nCurrent market snapshot:\n${snapshotText}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question || modePrompts[mode] || modePrompts.briefing },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools: [{
          type: "function",
          function: {
            name: "invest_briefing",
            description: "Structured investment briefing",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "2-3 line executive summary" },
                what_moved: { type: "array", items: { type: "object", properties: { asset: { type: "string" }, change: { type: "string" }, explanation: { type: "string" } }, required: ["asset", "change", "explanation"] } },
                why_it_matters: { type: "array", items: { type: "string" } },
                watch_next: { type: "array", items: { type: "string" } },
                safe_actions: { type: "array", items: { type: "object", properties: { action: { type: "string" }, type: { type: "string", enum: ["watchlist", "alert", "paper_trade", "learn"] }, reason: { type: "string" } }, required: ["action", "type", "reason"] } },
                disclaimer: { type: "string" }
              },
              required: ["summary", "safe_actions", "disclaimer"]
            }
          }
        }],
        tool_choice: mode === "briefing" ? { type: "function", function: { name: "invest_briefing" } } : undefined,
      }),
    });

    if (!resp.ok) {
      const status = resp.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly", ai_status: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits required", ai_status: "payment_required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI error", ai_status: "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await resp.json();
    const choice = aiJson.choices?.[0]?.message;

    let result: any = {};
    if (choice?.tool_calls?.[0]?.function?.arguments) {
      try { result = JSON.parse(choice.tool_calls[0].function.arguments); } catch { result = { summary: choice?.content ?? "Unable to parse briefing" }; }
    } else {
      result = { summary: choice?.content ?? "No response from AI", freeform: true };
    }

    result.ai_status = "ok";
    result.mode = mode;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, ai_status: "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
