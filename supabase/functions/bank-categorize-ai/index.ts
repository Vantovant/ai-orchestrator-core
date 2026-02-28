import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_CATEGORIES = [
  "groceries", "fuel", "telco", "bank_fees", "transport", "insurance", "medical",
  "municipal", "tax", "subscriptions", "rent", "education", "dining", "cash_withdrawal",
  "salary", "business", "transfer", "uncategorized",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Privacy-safe: only merchant + amount_bucket + direction — never raw descriptions
    const safeItems = items.slice(0, 100).map((it: any) => ({
      id: it.id,
      merchant: (it.merchant || "unknown").slice(0, 40),
      amount_bucket: it.amount_bucket || "medium",
      direction: it.direction || "debit",
    }));

    const prompt = `You are a South African bank transaction categorizer. Given a list of merchants with their amount bucket (small <R50, medium R50-R500, large R500-R5000, very_large >R5000) and direction (credit/debit), assign ONE category from this list:
${VALID_CATEGORIES.join(", ")}

Rules:
- Use SA context (Checkers=groceries, Engen=fuel, Vodacom=telco, etc.)
- If uncertain, use "uncategorized"
- credit + salary patterns → "salary"
- credit + business patterns → "business"

Return a JSON array of objects: [{"id": "...", "category": "..."}]

Transactions:
${JSON.stringify(safeItems)}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again in a moment" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway returned ${status}`);
    }

    const aiData = await aiResponse.json();
    const aiText = aiData.choices?.[0]?.message?.content || "[]";

    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    // Validate categories
    const results = parsed
      .filter((r: any) => r.id && r.category && VALID_CATEGORIES.includes(r.category))
      .map((r: any) => ({ id: r.id, category: r.category }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("bank-categorize-ai error:", e);
    return new Response(JSON.stringify({ error: e.message || "AI categorization failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});