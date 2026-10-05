import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Price = {
  symbol: string; asset_type: string; price: number;
  change_1d: number | null; change_7d: number | null; currency: string; asof: string;
};

// ECB reference rates (via Frankfurter) — gives today's AND previous business day's real rate.
const ECB_CCYS = ["ZAR", "EUR", "GBP", "JPY", "CNY"];
async function fetchEcbSeries(): Promise<{ latest: Record<string, number>; prev: Record<string, number>; date: string } | null> {
  try {
    const start = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
    const resp = await fetch(`https://api.frankfurter.dev/v1/${start}..?base=USD&symbols=${ECB_CCYS.join(",")}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const json = await resp.json();
    const dates = Object.keys(json.rates ?? {}).sort();
    if (dates.length === 0) return null;
    const last = dates[dates.length - 1];
    const prev = dates.length > 1 ? dates[dates.length - 2] : null;
    return { latest: json.rates[last], prev: prev ? json.rates[prev] : {}, date: last };
  } catch { return null; }
}

// Fallback / extra currencies (NGN, XAU) — today's rate only.
async function fetchErRates(): Promise<{ rates: Record<string, number>; asof: string | null }> {
  try {
    const resp = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return { rates: {}, asof: null };
    const json = await resp.json();
    const asof = json.time_last_update_unix ? new Date(json.time_last_update_unix * 1000).toISOString() : null;
    return { rates: json.rates ?? {}, asof };
  } catch { return { rates: {}, asof: null }; }
}

async function fetchCrypto(now: string): Promise<Price[]> {
  try {
    const resp = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!resp.ok) return [];
    const json = await resp.json();
    const out: Price[] = [];
    const add = (key: string, symbol: string) => {
      const c = json[key];
      if (!c?.usd) return;
      out.push({
        symbol, asset_type: "crypto", price: c.usd,
        change_1d: typeof c.usd_24h_change === "number" ? c.usd_24h_change : null,
        change_7d: null, currency: "USD",
        asof: c.last_updated_at ? new Date(c.last_updated_at * 1000).toISOString() : now,
      });
    };
    add("bitcoin", "BTC/USD");
    add("ethereum", "ETH/USD");
    return out;
  } catch { return []; }
}

const pct = (cur: number, prev: number | undefined | null) =>
  prev && prev > 0 ? ((cur - prev) / prev) * 100 : null;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const [ecb, er, crypto] = await Promise.all([fetchEcbSeries(), fetchErRates(), fetchCrypto(now)]);
    const prices: Price[] = [];

    // Previous-day snapshots as fallback for change_1d
    const { data: snaps } = await db
      .from("market_price_snapshots")
      .select("symbol, price, snapshot_date")
      .lt("snapshot_date", today)
      .order("snapshot_date", { ascending: false })
      .limit(200);
    const prevSnap = (sym: string) => snaps?.find((s) => s.symbol === sym)?.price as number | undefined;

    const fxAsof = ecb ? new Date(`${ecb.date}T16:00:00Z`).toISOString() : (er.asof ?? now);

    const pushFx = (ccy: string) => {
      const sym = `USD/${ccy}`;
      const ecbPrice = ecb?.latest?.[ccy];
      const price = ecbPrice ?? er.rates[ccy];
      if (!price) return;
      const change = ecbPrice ? (pct(ecbPrice, ecb?.prev?.[ccy]) ?? pct(price, prevSnap(sym))) : pct(price, prevSnap(sym));
      prices.push({ symbol: sym, asset_type: "fx", price, change_1d: change, change_7d: null, currency: ccy, asof: ecbPrice ? fxAsof : (er.asof ?? now) });
    };
    [...ECB_CCYS, "NGN"].forEach(pushFx);

    const usdZar = prices.find((p) => p.symbol === "USD/ZAR");
    if (usdZar) {
      prices.push({
        symbol: "ZAR/USD", asset_type: "fx", price: 1 / usdZar.price,
        change_1d: usdZar.change_1d === null ? null : ((1 / (1 + usdZar.change_1d / 100)) - 1) * 100,
        change_7d: null, currency: "USD", asof: usdZar.asof,
      });
    }

    if (er.rates["XAU"]) {
      const price = 1 / er.rates["XAU"];
      prices.push({ symbol: "XAU/USD", asset_type: "commodity", price, change_1d: pct(price, prevSnap("XAU/USD")), change_7d: null, currency: "USD", asof: er.asof ?? now });
    }

    prices.push(...crypto);

    for (const p of prices) {
      await db.from("market_prices_cache").upsert(
        { symbol: p.symbol, asset_type: p.asset_type, price: p.price, change_1d: p.change_1d, change_7d: p.change_7d, currency: p.currency, asof: p.asof },
        { onConflict: "symbol,asset_type" },
      );
      await db.from("market_price_snapshots").upsert(
        { symbol: p.symbol, price: p.price, currency: p.currency, snapshot_date: today },
        { onConflict: "symbol,snapshot_date" },
      );
    }

    const zarChange = usdZar?.change_1d ?? null;
    const risk_mood = zarChange === null ? "Unknown" : zarChange > 0.5 ? "Risk-Off" : zarChange < -0.5 ? "Risk-On" : "Neutral";

    return new Response(JSON.stringify({ prices, risk_mood, refreshedAt: now, status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, status: "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
