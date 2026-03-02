import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function redact(text: string): string {
  return text
    .replace(/\b\d{13}\b/g, "[ID_REDACTED]")
    .replace(/\b\d{10,12}\b/g, "[ACCT_REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]")
    .replace(/\b(?:\+27|0)\d{9}\b/g, "[PHONE_REDACTED]");
}

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { project_id, region = "South Africa", funding_types = [] } = await req.json();

    // Get project context for better search
    let projectContext = "";
    if (project_id) {
      const { data: project } = await supabase.from("projects").select("name, description, status").eq("id", project_id).single();
      const { data: memory } = await supabase.from("project_partner_memory").select("stage, business_model, target_customer").eq("project_id", project_id).maybeSingle();
      if (project) projectContext = `Project: ${project.name}. ${project.description || ""}`;
      if (memory) projectContext += ` Stage: ${(memory as any).stage}. Model: ${(memory as any).business_model || "unknown"}.`;
      projectContext = redact(projectContext.slice(0, 500));
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typesStr = funding_types.length > 0 ? funding_types.join(", ") : "grant, accelerator, angel, vc";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a funding research assistant for African tech startups. Find REAL, VERIFIABLE funding programs.
CRITICAL: Only return programs you are confident exist. Include the actual URL where someone can verify the program.
If you are unsure about a program, do NOT include it.
Focus on: ${region}. Types: ${typesStr}.
Context: ${projectContext}`,
          },
          {
            role: "user",
            content: `Find real funding programs available in ${region} for these types: ${typesStr}. Return only programs you can cite with real URLs.`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_funding_programs",
            description: "Return verified funding programs with source URLs",
            parameters: {
              type: "object",
              properties: {
                programs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      org_name: { type: "string" },
                      program_name: { type: "string" },
                      funding_type: { type: "string", enum: ["grant", "accelerator", "angel", "vc", "debt", "corporate", "government", "competition"] },
                      ticket_size_range: { type: "string" },
                      eligibility: { type: "string" },
                      summary: { type: "string" },
                      source_url: { type: "string" },
                      source_name: { type: "string" },
                    },
                    required: ["org_name", "program_name", "funding_type", "summary", "source_url"],
                  },
                },
              },
              required: ["programs"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_funding_programs" } },
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    let programs: any[] = [];
    if (toolCall) {
      try { programs = JSON.parse(toolCall.function.arguments).programs ?? []; } catch {}
    }

    // Store in funding_cache, avoid duplicates
    let inserted = 0;
    for (const p of programs) {
      if (!p.source_url || !p.org_name) continue;

      // Check for duplicate
      const { data: existing } = await supabase
        .from("funding_cache")
        .select("id")
        .eq("user_id", user.id)
        .eq("org_name", p.org_name)
        .eq("program_name", p.program_name)
        .eq("source_url", p.source_url)
        .maybeSingle();

      if (!existing) {
        await supabase.from("funding_cache").insert({
          user_id: user.id,
          project_id: project_id || null,
          region,
          org_name: p.org_name,
          program_name: p.program_name,
          funding_type: p.funding_type || "grant",
          ticket_size_range: p.ticket_size_range || null,
          eligibility: p.eligibility || null,
          summary: p.summary || "",
          source_url: p.source_url,
          source_name: p.source_name || null,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
        inserted++;
      }
    }

    return new Response(JSON.stringify({ count: inserted, total_found: programs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("funding-search error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
