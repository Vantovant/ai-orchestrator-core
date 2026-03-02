import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple market data using free APIs
async function fetchFXRates(): Promise<Record<string, number>> {
  try {
    const resp = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return {};
    const json = await resp.json();
    return json.rates ?? {};
  } catch { return {}; }
}

async function fetchCryptoRates(): Promise<any[]> {
  try {
    const resp = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true&include_7d_change=true",
      { signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return [];
    const json = await resp.json();
    const results = [];
    if (json.bitcoin) {
      results.push({
        symbol: "BTC/USD", asset_type: "crypto", price: json.bitcoin.usd ?? 0,
        change_1d: json.bitcoin.usd_24h_change ?? 0, change_7d: 0, currency: "USD",
      });
    }
    if (json.ethereum) {
      results.push({
        symbol: "ETH/USD", asset_type: "crypto", price: json.ethereum.usd ?? 0,
        change_1d: json.ethereum.usd_24h_change ?? 0, change_7d: 0, currency: "USD",
      });
    }
    return results;
  } catch { return []; }
}

// Generate macro headlines using AI
async function generateHeadlines(apiKey: string, prices: any[]): Promise<any[]> {
  try {
    const pricesSummary = prices.map(p => `${p.symbol}: ${p.price} (1d: ${(p.change_1d ?? 0).toFixed(2)}%)`).join(", ");
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a neutral financial news summarizer. Return ONLY a JSON array of 5 objects with keys: title, summary, tags (array of strings like 'fx','crypto','commodities','rates','geopolitics'). Cover today's key macro events affecting markets. Be factual, beginner-friendly, no hype. Current prices: " + pricesSummary },
          { role: "user", content: "Generate 5 market headlines for today, " + new Date().toISOString().slice(0, 10) }
        ],
      }),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    // Try to extract JSON array
    const match = content.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  } catch { return []; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
    const db = createClient(supabaseUrl, serviceKey);

    // Fetch market data in parallel
    const [fxRates, cryptoData] = await Promise.all([fetchFXRates(), fetchCryptoRates()]);

    const now = new Date().toISOString();
    const prices: any[] = [];

    // FX pairs (USD base)
    const fxPairs = ["ZAR", "EUR", "GBP", "JPY", "CNY", "NGN"];
    for (const ccy of fxPairs) {
      if (fxRates[ccy]) {
        prices.push({
          symbol: `USD/${ccy}`, asset_type: "fx", price: fxRates[ccy],
          change_1d: 0, change_7d: 0, currency: "USD", asof: now,
        });
      }
    }

    // Add ZAR base pairs
    if (fxRates["ZAR"]) {
      const zarRate = fxRates["ZAR"];
      prices.push({
        symbol: "ZAR/USD", asset_type: "fx", price: 1 / zarRate,
        change_1d: 0, change_7d: 0, currency: "ZAR", asof: now,
      });
    }

    // Crypto
    for (const c of cryptoData) {
      prices.push({ ...c, asof: now });
    }

    // Commodities placeholders (gold/oil via simple estimate)
    // Using XAU and approximation
    if (fxRates["XAU"]) {
      prices.push({
        symbol: "XAU/USD", asset_type: "commodity", price: 1 / fxRates["XAU"],
        change_1d: 0, change_7d: 0, currency: "USD", asof: now,
      });
    }

    // Upsert prices into cache
    for (const p of prices) {
      await db.from("market_prices_cache").upsert(
        { symbol: p.symbol, asset_type: p.asset_type, price: p.price, change_1d: p.change_1d, change_7d: p.change_7d, currency: p.currency, asof: p.asof },
        { onConflict: "symbol,asset_type" }
      );
    }

    // Generate and cache headlines
    let headlines: any[] = [];
    if (apiKey) {
      headlines = await generateHeadlines(apiKey, prices);
      if (headlines.length > 0) {
        // Clear old news and insert new
        await db.from("market_news_cache").delete().lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        for (const h of headlines) {
          await db.from("market_news_cache").insert({
            title: h.title ?? "Market Update",
            summary: h.summary ?? "",
            source: "AI Summary",
            published_at: now,
            tags: h.tags ?? [],
          });
        }
      }
    }

    return new Response(JSON.stringify({
      prices,
      headlines,
      refreshedAt: now,
      status: "ok",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, status: "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
