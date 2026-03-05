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
      return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: "error", message: "Unauthorized", snapshot: {} }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Build snapshot
    const snapshotRes = await fetch(`${supabaseUrl}/functions/v1/snapshot-build`, {
      headers: { Authorization: authHeader ?? "", "Content-Type": "application/json", apikey: anonKey },
    });
    const snapshot = await snapshotRes.json();
    if (!snapshotRes.ok) {
      return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: "error", message: "Snapshot build failed", snapshot: {} }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user AI preference
    const { data: prefData } = await supabase
      .from("user_preferences")
      .select("preference_value")
      .eq("preference_key", "ai_preference")
      .eq("user_id", user.id)
      .maybeSingle();
    const preference = (prefData?.preference_value as any)?.order ?? "fastest";

    // Step 2: Call AI via gateway
    const systemPrompt = `You are an executive AI assistant. Analyze the following snapshot and return structured intelligence.

RULES:
- Only use data from the snapshot provided. Do not hallucinate additional data.
- Return valid JSON matching the tool schema exactly.
- For each prioritized task, include the original task id from the snapshot so the frontend can re-hydrate from live data.

SNAPSHOT:
${JSON.stringify(snapshot, null, 2)}`;

    const tools = [
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
              commands3: {
                type: "array",
                description: "Exactly 3 actionable commands for the user today. Short imperative sentences.",
                items: { type: "string" },
                minItems: 3,
                maxItems: 3,
              },
            },
            required: ["prioritizedTasks", "meetingBriefs", "dailyPlan", "commands3"],
            additionalProperties: false,
          },
        },
      },
    ];

    const gatewayRes = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: authHeader ?? `Bearer ${serviceKey}` },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Analyze my day. Prioritize tasks, prepare meeting briefs, and create a daily plan." },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "executive_briefing" } },
        preference,
        calling_function: "run-assistant",
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

    // Log to assistant_runs with token discipline metadata
    const snapshotLen = snapshot.snapshot_len ?? JSON.stringify(snapshot).length;
    const wasTruncated = snapshot.was_truncated ?? false;

    const adminClient = createClient(supabaseUrl, serviceKey);
    await adminClient.from("assistant_runs").insert({
      user_id: user.id,
      snapshot_json: { snapshot_len: snapshotLen, was_truncated: wasTruncated, generatedAt: snapshot.generatedAt },
      result_json: {
        ai_status: "ok",
        provider_used: gatewayData.provider_used,
        snapshot_len: snapshotLen,
        was_truncated: wasTruncated,
        task_count: (briefing.prioritizedTasks ?? []).length,
        meeting_count: (briefing.meetingBriefs ?? []).length,
      },
    });

    return new Response(JSON.stringify({
      prioritizedTasks: briefing.prioritizedTasks ?? [],
      triagedEmails: [],
      meetingBriefs: briefing.meetingBriefs ?? [],
      dailyPlan: briefing.dailyPlan ?? {},
      commands3: briefing.commands3 ?? [],
      ai_status: "ok",
      provider_used: gatewayData.provider_used,
      message: gatewayData.message,
      snapshot_len: snapshotLen,
      was_truncated: wasTruncated,
      snapshot,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("run-assistant error:", e);
    return new Response(JSON.stringify({ ...EMPTY_RESULT, ai_status: "error", message: String(e), snapshot: {} }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
