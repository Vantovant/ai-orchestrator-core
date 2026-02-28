import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMPTY_RESULT = {
  prioritizedTasks: [],
  triagedEmails: [],
  meetingBriefs: [],
  dailyPlan: {},
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Build snapshot via internal call
    const snapshotRes = await fetch(`${supabaseUrl}/functions/v1/snapshot-build`, {
      headers: {
        Authorization: authHeader ?? "",
        "Content-Type": "application/json",
        apikey: anonKey,
      },
    });

    const snapshot = await snapshotRes.json();
    if (!snapshotRes.ok) {
      return new Response(JSON.stringify({ ...EMPTY_RESULT, snapshot: {}, error: "Snapshot build failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Call AI with snapshot ONLY (token discipline)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // AI not configured — return snapshot with empty AI results (still 200)
      return new Response(JSON.stringify({ ...EMPTY_RESULT, snapshot }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an executive AI assistant. Analyze the following snapshot and return structured intelligence.

RULES:
- Only use data from the snapshot provided. Do not hallucinate additional data.
- Return valid JSON matching the tool schema exactly.

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
          { role: "user", content: "Analyze my day. Prioritize tasks, prepare meeting briefs, and create a daily plan." },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "executive_briefing",
              description: "Return the executive daily briefing with prioritized tasks, meeting briefs, and daily plan.",
              parameters: {
                type: "object",
                properties: {
                  prioritizedTasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                        reasoning: { type: "string" },
                        suggestedTimeSlot: { type: "string" },
                      },
                      required: ["id", "title", "priority", "reasoning"],
                      additionalProperties: false,
                    },
                  },
                  meetingBriefs: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        meetingId: { type: "string" },
                        title: { type: "string" },
                        talkingPoints: { type: "array", items: { type: "string" } },
                        preparationActions: { type: "array", items: { type: "string" } },
                      },
                      required: ["meetingId", "title", "talkingPoints"],
                      additionalProperties: false,
                    },
                  },
                  dailyPlan: {
                    type: "object",
                    properties: {
                      greeting: { type: "string" },
                      dayOverview: { type: "string" },
                      topPriorities: { type: "array", items: { type: "string" } },
                      timeBlocks: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            time: { type: "string" },
                            activity: { type: "string" },
                            type: { type: "string", enum: ["meeting", "deep_work", "admin", "break"] },
                          },
                          required: ["time", "activity", "type"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["greeting", "dayOverview", "topPriorities"],
                    additionalProperties: false,
                  },
                },
                required: ["prioritizedTasks", "meetingBriefs", "dailyPlan"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "executive_briefing" } },
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      if (status === 429) {
        return new Response(JSON.stringify({ ...EMPTY_RESULT, snapshot, error: "AI rate limited, try again later" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ ...EMPTY_RESULT, snapshot, error: "AI credits exhausted" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", status, await aiRes.text());
      return new Response(JSON.stringify({ ...EMPTY_RESULT, snapshot, error: "AI unavailable" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({ ...EMPTY_RESULT, snapshot, error: "AI returned no structured data" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const briefing = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({
      prioritizedTasks: briefing.prioritizedTasks ?? [],
      triagedEmails: [],
      meetingBriefs: briefing.meetingBriefs ?? [],
      dailyPlan: briefing.dailyPlan ?? {},
      snapshot,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("run-assistant error:", e);
    return new Response(JSON.stringify({ ...EMPTY_RESULT, snapshot: {}, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
