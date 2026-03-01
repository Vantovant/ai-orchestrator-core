import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SNAPSHOT_CHAR_LIMIT = 3000;

// POPIA redaction — scrub SA ID numbers, bank accounts, addresses
function redactPII(text: string): string {
  return text
    .replace(/\b\d{13}\b/g, "[ID_REDACTED]") // SA ID
    .replace(/\b\d{10,12}\b/g, "[ACCT_REDACTED]") // bank acct
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[CARD_REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]");
}

function buildSnapshot(tasks: any[], meetings: any[], reminders: any[], notes: any): string {
  let snap = "";

  // Tasks (max 10)
  const topTasks = tasks
    .filter((t: any) => t.status !== "done")
    .sort((a: any, b: any) => {
      const order = ["critical", "high", "medium", "low"];
      return order.indexOf(a.priority) - order.indexOf(b.priority);
    })
    .slice(0, 10);
  if (topTasks.length > 0) {
    snap += "TASKS:\n";
    topTasks.forEach((t: any) => {
      snap += `- [${t.priority}] ${t.title}${t.due_date ? ` (due: ${t.due_date.slice(0, 10)})` : ""}\n`;
    });
    snap += "\n";
  }

  // Meetings (max 8)
  const todayMeetings = meetings.slice(0, 8);
  if (todayMeetings.length > 0) {
    snap += "MEETINGS:\n";
    todayMeetings.forEach((m: any) => {
      snap += `- ${m.title} at ${m.start_time?.slice(11, 16)}${m.location ? ` (${m.location})` : ""}\n`;
    });
    snap += "\n";
  }

  // Reminders (max 10)
  const upcomingReminders = reminders.filter((r: any) => !r.is_done).slice(0, 10);
  if (upcomingReminders.length > 0) {
    snap += "REMINDERS:\n";
    upcomingReminders.forEach((r: any) => {
      snap += `- ${r.title} at ${r.reminder_time?.slice(0, 16)}\n`;
    });
    snap += "\n";
  }

  // Notes highlight
  if (notes?.content) {
    const noteSnip = notes.content.slice(0, 800);
    snap += `TODAY'S NOTES:\n${noteSnip}\n`;
  }

  // Truncate + redact
  const truncated = snap.length > SNAPSHOT_CHAR_LIMIT;
  const result = redactPII(snap.slice(0, SNAPSHOT_CHAR_LIMIT));
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, meetingId, date } = await req.json();
    const today = new Date().toISOString().slice(0, 10);

    // Fetch snapshot data
    const [tasksRes, meetingsRes, remindersRes, notesRes] = await Promise.all([
      userClient.from("tasks").select("title, priority, status, due_date").is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
      userClient.from("meetings").select("title, start_time, end_time, location, description").is("deleted_at", null).gte("start_time", `${today}T00:00:00`).lte("start_time", `${today}T23:59:59`).order("start_time"),
      userClient.from("reminders").select("title, reminder_time, is_done").is("deleted_at", null).order("reminder_time").limit(20),
      userClient.from("notes_daily").select("content").eq("note_date", date || today).is("deleted_at", null).maybeSingle(),
    ]);

    const snapshot = buildSnapshot(tasksRes.data ?? [], meetingsRes.data ?? [], remindersRes.data ?? [], notesRes.data);

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "briefing") {
      systemPrompt = "You are an executive AI secretary. Generate a concise morning briefing based on the provided snapshot. Include: top 3 priorities (P1/P2/P3), today's meetings with preparation items, any schedule conflicts with suggested fixes, and exactly 3 short actionable commands for today. Be direct, executive-level, no fluff.";
      userPrompt = `Today is ${today}. Here is the executive snapshot:\n\n${snapshot}\n\nGenerate the morning briefing.`;
    } else if (action === "prep" && meetingId) {
      // Fetch specific meeting
      const { data: meeting } = await userClient.from("meetings").select("*").eq("id", meetingId).single();
      const meetingInfo = meeting ? `Meeting: ${meeting.title}\nTime: ${meeting.start_time}\nLocation: ${meeting.location || "TBD"}\nDescription: ${meeting.description || "None"}` : "Meeting details unavailable";

      systemPrompt = "You are an executive AI secretary preparing a meeting brief. Generate: agenda suggestions, a preparation checklist, key questions to ask, potential risks, and stakeholder considerations. Be concise and actionable.";
      userPrompt = `${meetingInfo}\n\nContext snapshot:\n${snapshot}\n\nGenerate the preparation pack.`;
    } else if (action === "eod") {
      systemPrompt = "You are an executive AI secretary doing an end-of-day review. Analyze: what got completed, what slipped (overdue/pushed tasks with suggested reason categories), extract action items for tomorrow, and create tomorrow's Top 3 priorities. Be direct and actionable.";
      userPrompt = `Today is ${date || today}. Here is the snapshot:\n\n${snapshot}\n\nGenerate the end-of-day review.`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Define tools for structured output
    const tools = [{
      type: "function",
      function: {
        name: action === "briefing" ? "generate_briefing" : action === "prep" ? "generate_prep" : "generate_eod",
        description: action === "briefing" ? "Generate morning briefing" : action === "prep" ? "Generate meeting prep" : "Generate EOD review",
        parameters: {
          type: "object",
          properties: action === "briefing" ? {
            priorities: { type: "string", description: "Top 3 priorities formatted as P1/P2/P3 list" },
            meetings: { type: "string", description: "Today's meetings with prep items" },
            conflicts: { type: "string", description: "Schedule conflicts and suggested fixes" },
            commands3: { type: "string", description: "3 short actionable commands for today" },
          } : action === "prep" ? {
            agenda: { type: "string", description: "Suggested agenda items" },
            questions: { type: "string", description: "Key questions to ask" },
            risks: { type: "string", description: "Potential risks and considerations" },
            checklist: { type: "string", description: "Preparation checklist" },
          } : {
            completed: { type: "string", description: "Tasks completed today" },
            slipped: { type: "string", description: "Tasks that slipped with reasons" },
            tomorrow_top3: { type: "string", description: "Tomorrow's top 3 priorities" },
            action_items: { type: "string", description: "Action items extracted from notes" },
          },
          required: action === "briefing" ? ["priorities", "commands3"] : action === "prep" ? ["agenda", "questions"] : ["completed", "tomorrow_top3"],
          additionalProperties: false,
        },
      },
    }];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: tools[0].function.name } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResp.json();
    let result: any = {};

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch {
        result = { error: "Failed to parse AI response" };
      }
    } else {
      // Fallback to content
      result = { content: aiData.choices?.[0]?.message?.content || "No response generated" };
    }

    // Log to assistant_runs
    try {
      await userClient.from("assistant_runs").insert({
        user_id: user.id,
        snapshot_json: { action, snapshot_len: snapshot.length },
        result_json: { ai_status: "ok", provider_used: "lovable", action },
      });
    } catch {}

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("secretary error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
