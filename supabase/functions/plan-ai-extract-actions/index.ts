import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function redactPII(text: string): string {
  return text
    .replace(/\b\d{13}\b/g, "[REDACTED_ID]")
    .replace(/\b\d{10,12}\b/g, "[REDACTED_ACCT]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(/\b(?:\+27|0)\d{9}\b/g, "[REDACTED_PHONE]")
    .replace(/\[CONFIDENTIAL\][\s\S]*?\[\/CONFIDENTIAL\]/gi, "[REDACTED_CONFIDENTIAL]");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { content, note_date } = await req.json();
    if (!content || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "content is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap and redact
    const safeContent = redactPII(content.slice(0, 3000));

    const systemPrompt = `You are an executive assistant analyzing daily notes to extract actionable items.
Today's date context: ${note_date || new Date().toISOString().split("T")[0]}.

Rules:
- Extract tasks, reminders, and meeting prep items from the note content.
- For tasks: infer a reasonable due_date (ISO format) and priority (P1/P2/P3).
- For reminders: infer a remind_at datetime (ISO format) based on context clues like "tomorrow 9am", "Monday", etc.
- Source should always be "notes".
- Only extract items that are clearly actionable. Do not fabricate items.
- Return between 0 and 10 suggestions maximum.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract action items from these notes:\n\n${safeContent}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_actions",
            description: "Return extracted action items from notes.",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["task", "reminder"] },
                      title: { type: "string" },
                      due_at: { type: "string", description: "ISO datetime for tasks" },
                      remind_at: { type: "string", description: "ISO datetime for reminders" },
                      priority: { type: "string", enum: ["P1", "P2", "P3"] },
                      source: { type: "string", enum: ["notes"] },
                    },
                    required: ["type", "title", "source"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_actions" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted — please top up." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let suggestions: any[] = [];

    // Parse tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        suggestions = parsed.suggestions || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    // Fallback: try to parse from content
    if (suggestions.length === 0 && data.choices?.[0]?.message?.content) {
      try {
        const match = data.choices[0].message.content.match(/\[[\s\S]*\]/);
        if (match) suggestions = JSON.parse(match[0]);
      } catch {}
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-actions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
