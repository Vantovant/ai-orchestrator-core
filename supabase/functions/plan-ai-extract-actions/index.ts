import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

const SYSTEM_PROMPT = (noteDate: string) => `You are an executive assistant analyzing daily notes to extract actionable items.
Today's date context: ${noteDate}.

Rules:
- Extract tasks, reminders, and meeting prep items from the note content.
- For tasks: infer a reasonable due_date (ISO format) and priority (P1/P2/P3).
- For reminders: infer a remind_at datetime (ISO format) based on context clues like "tomorrow 9am", "Monday", etc.
- Source should always be "notes".
- Only extract items that are clearly actionable. Do not fabricate items.
- Return between 0 and 10 suggestions maximum.
- Return ONLY valid JSON matching: {"suggestions":[{"type":"task"|"reminder","title":string,"due_at"?:string,"remind_at"?:string,"priority"?:"P1"|"P2"|"P3","source":"notes"}]}`;

const TOOL_SCHEMA = {
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
              due_at: { type: "string" },
              remind_at: { type: "string" },
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
};

function parseSuggestions(data: any): any[] {
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      return JSON.parse(toolCall.function.arguments)?.suggestions ?? [];
    } catch {}
  }
  const content = data?.choices?.[0]?.message?.content;
  if (content) {
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0])?.suggestions ?? [];
    } catch {}
  }
  return [];
}

async function callLovable(apiKey: string, systemPrompt: string, userContent: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract action items from these notes:\n\n${userContent}` },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "extract_actions" } },
    }),
  });
  return res;
}

async function callOpenAI(apiKey: string, systemPrompt: string, userContent: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract action items from these notes:\n\n${userContent}` },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "extract_actions" } },
    }),
  });
  return res;
}

async function callGemini(apiKey: string, systemPrompt: string, userContent: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: `Extract action items from these notes:\n\n${userContent}` }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) return { ok: false, res, suggestions: [] };
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  let suggestions: any[] = [];
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) suggestions = JSON.parse(match[0])?.suggestions ?? [];
  } catch {}
  return { ok: true, res, suggestions };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content, note_date } = await req.json();
    if (!content || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "content is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeContent = redactPII(content.slice(0, 3000));
    const systemPrompt = SYSTEM_PROMPT(note_date || new Date().toISOString().split("T")[0]);

    const attempts: string[] = [];
    let suggestions: any[] = [];
    let providerUsed: string | null = null;
    let lastError: { status?: number; message: string } | null = null;

    // 1) Try Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      attempts.push("lovable");
      try {
        const res = await callLovable(LOVABLE_API_KEY, systemPrompt, safeContent);
        if (res.ok) {
          const data = await res.json();
          suggestions = parseSuggestions(data);
          providerUsed = "lovable";
        } else {
          const txt = await res.text();
          console.error("Lovable AI error:", res.status, txt);
          lastError = { status: res.status, message: res.status === 402 ? "Lovable AI credits exhausted" : res.status === 429 ? "Lovable AI rate limited" : `Lovable AI error ${res.status}` };
        }
      } catch (e) {
        console.error("Lovable AI exception:", e);
        lastError = { message: "Lovable AI network error" };
      }
    }

    // 2) Fallback to user's own keys
    if (!providerUsed) {
      const authHeader = req.headers.get("Authorization");
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY");
      if (authHeader && SUPABASE_URL && SUPABASE_ANON) {
        const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: keys } = await sb
          .from("user_ai_keys")
          .select("openai_key_encrypted, gemini_key_encrypted")
          .maybeSingle();

        // Try Gemini
        if (!providerUsed && keys?.gemini_key_encrypted) {
          attempts.push("gemini");
          try {
            const g = await callGemini(keys.gemini_key_encrypted, systemPrompt, safeContent);
            if (g.ok) {
              suggestions = g.suggestions;
              providerUsed = "gemini";
            } else {
              const txt = await g.res.text();
              console.error("Gemini error:", g.res.status, txt);
              lastError = { status: g.res.status, message: `Gemini error ${g.res.status}` };
            }
          } catch (e) {
            console.error("Gemini exception:", e);
            lastError = { message: "Gemini network error" };
          }
        }

        // Try OpenAI
        if (!providerUsed && keys?.openai_key_encrypted) {
          attempts.push("openai");
          try {
            const res = await callOpenAI(keys.openai_key_encrypted, systemPrompt, safeContent);
            if (res.ok) {
              const data = await res.json();
              suggestions = parseSuggestions(data);
              providerUsed = "openai";
            } else {
              const txt = await res.text();
              console.error("OpenAI error:", res.status, txt);
              lastError = { status: res.status, message: `OpenAI error ${res.status}` };
            }
          } catch (e) {
            console.error("OpenAI exception:", e);
            lastError = { message: "OpenAI network error" };
          }
        }
      }
    }

    if (!providerUsed) {
      const msg = lastError?.status === 402
        ? "Lovable AI credits exhausted. Add your own OpenAI or Gemini key in Settings → AI Keys to keep extracting."
        : lastError?.status === 429
        ? "AI is rate-limited. Try again in a moment, or add a personal OpenAI/Gemini key in Settings for a fallback."
        : (lastError?.message || "AI extraction failed") + ". Add a personal OpenAI or Gemini key in Settings → AI Keys as a fallback.";
      return new Response(JSON.stringify({ error: msg, attempts }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ suggestions, provider_used: providerUsed, attempts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-actions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
