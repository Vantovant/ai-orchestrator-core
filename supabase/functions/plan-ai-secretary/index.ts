import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SNAPSHOT_CHAR_LIMIT = 3000;

function redactPII(text: string): string {
  return text
    .replace(/\b\d{13}\b/g, "[ID_REDACTED]")
    .replace(/\b\d{10,12}\b/g, "[ACCT_REDACTED]")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[CARD_REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]");
}

function buildSnapshot(tasks: any[], meetings: any[], reminders: any[], notes: any): string {
  let snap = "";
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
  const todayMeetings = meetings.slice(0, 8);
  if (todayMeetings.length > 0) {
    snap += "MEETINGS:\n";
    todayMeetings.forEach((m: any) => {
      snap += `- ${m.title} at ${m.start_time?.slice(11, 16)}${m.location ? ` (${m.location})` : ""}\n`;
    });
    snap += "\n";
  }
  const upcomingReminders = reminders.filter((r: any) => !r.is_done).slice(0, 10);
  if (upcomingReminders.length > 0) {
    snap += "REMINDERS:\n";
    upcomingReminders.forEach((r: any) => {
      snap += `- ${r.title} at ${r.reminder_time?.slice(0, 16)}\n`;
    });
    snap += "\n";
  }
  if (notes?.content) {
    snap += `TODAY'S NOTES:\n${notes.content.slice(0, 800)}\n`;
  }
  return redactPII(snap.slice(0, SNAPSHOT_CHAR_LIMIT));
}

function buildPromptSet(action: string, meetingContext: string, snapshot: string, safeNotes: string, today: string) {
  if (action === "briefing") {
    return {
      system: "You are an executive AI secretary. Generate a concise morning briefing based ONLY on the provided snapshot. If a section has no data in the snapshot, say 'None today' — do NOT invent tasks, meetings, or people. Include: top priorities, today's meetings, conflicts, and exactly 3 short actionable commands drawn from the snapshot.",
      user: `Today is ${today}. Snapshot:\n\n${snapshot || "(empty)"}\n\nGenerate the briefing.`,
    };
  }
  if (action === "prep") {
    return {
      system: "You are an executive AI secretary preparing a meeting brief. Generate agenda, prep checklist, key questions, risks. Concise and actionable.",
      user: `${meetingContext}\n\nContext snapshot:\n${snapshot}\n\nGenerate the preparation pack.`,
    };
  }
  if (action === "eod") {
    return {
      system: "You are an executive AI secretary doing an end-of-day review. Analyze what got completed, what slipped, extract action items and tomorrow's Top 3 priorities. Direct and actionable.",
      user: `Today is ${today}. Snapshot:\n\n${snapshot}\n\nGenerate the end-of-day review.`,
    };
  }
  return {
    system: "You are a strategic meeting advisor. Provide 3-5 brief, actionable suggestions based on live meeting notes. Return JSON with a 'suggestions' array.",
    user: `${meetingContext}Current meeting notes:\n${safeNotes}\n\nContext snapshot:\n${snapshot}\n\nProvide strategic advice.`,
  };
}

function toolFor(action: string) {
  const name = action === "briefing" ? "generate_briefing" : action === "prep" ? "generate_prep" : action === "meeting_advisor" ? "generate_advice" : "generate_eod";
  const props = action === "briefing" ? {
    priorities: { type: "string" }, meetings: { type: "string" }, conflicts: { type: "string" }, commands3: { type: "string" },
  } : action === "prep" ? {
    agenda: { type: "string" }, questions: { type: "string" }, risks: { type: "string" }, checklist: { type: "string" },
  } : action === "meeting_advisor" ? {
    suggestions: { type: "array", items: { type: "string" } },
  } : {
    completed: { type: "string" }, slipped: { type: "string" }, tomorrow_top3: { type: "string" }, action_items: { type: "string" },
  };
  const required = action === "briefing" ? ["priorities", "commands3"] : action === "prep" ? ["agenda", "questions"] : action === "meeting_advisor" ? ["suggestions"] : ["completed", "tomorrow_top3"];
  return { name, tool: { type: "function", function: { name, description: name, parameters: { type: "object", properties: props, required, additionalProperties: false } } } };
}

async function callLovable(key: string, system: string, user: string, tool: any, name: string) {
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      tools: [tool],
      tool_choice: { type: "function", function: { name } },
    }),
  });
}

async function callOpenAI(key: string, system: string, user: string, tool: any, name: string) {
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      tools: [tool],
      tool_choice: { type: "function", function: { name } },
    }),
  });
}

async function callGemini(key: string, system: string, user: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system + "\n\nReturn ONLY valid JSON object matching the requested fields." }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) return { ok: false, res, result: null as any };
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  let result: any = {};
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) result = JSON.parse(match[0]);
  } catch { /* noop */ }
  return { ok: true, res, result };
}

function parseTool(data: any): any {
  const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (tc?.function?.arguments) {
    try { return JSON.parse(tc.function.arguments); } catch { /* fall through */ }
  }
  const content = data?.choices?.[0]?.message?.content;
  if (content) {
    try { const m = content.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch { /* noop */ }
  }
  return null;
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

    const { action, meetingId, date, notes_text } = await req.json();
    const today = new Date().toISOString().slice(0, 10);

    const [tasksRes, meetingsRes, remindersRes, notesRes] = await Promise.all([
      userClient.from("tasks").select("title, priority, status, due_date").is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
      userClient.from("meetings").select("title, start_time, end_time, location, description").is("deleted_at", null).gte("start_time", `${today}T00:00:00`).lte("start_time", `${today}T23:59:59`).order("start_time"),
      userClient.from("reminders").select("title, reminder_time, is_done").is("deleted_at", null).order("reminder_time").limit(20),
      userClient.from("notes_daily").select("content").eq("note_date", date || today).is("deleted_at", null).maybeSingle(),
    ]);

    const snapshot = buildSnapshot(tasksRes.data ?? [], meetingsRes.data ?? [], remindersRes.data ?? [], notesRes.data);

    let meetingContext = "";
    if ((action === "prep" || action === "meeting_advisor") && meetingId) {
      const { data: meeting } = await userClient.from("meetings").select("title, description, start_time, location").eq("id", meetingId).single();
      if (meeting) meetingContext = `Meeting: ${meeting.title}\nTime: ${meeting.start_time}\nLocation: ${meeting.location || "TBD"}\nDescription: ${meeting.description || "None"}\n\n`;
    }
    const safeNotes = notes_text ? redactPII(String(notes_text).slice(0, 2000)) : "";

    if (!["briefing", "prep", "eod", "meeting_advisor"].includes(action)) {
      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { system, user: userPrompt } = buildPromptSet(action, meetingContext, snapshot, safeNotes, today);
    const { name: toolName, tool } = toolFor(action);

    let result: any = null;
    let providerUsed: string | null = null;
    const attempts: string[] = [];
    let lastError: { status?: number; message: string } | null = null;

    // 1) Lovable
    if (lovableKey) {
      attempts.push("lovable");
      try {
        const res = await callLovable(lovableKey, system, userPrompt, tool, toolName);
        if (res.ok) {
          const parsed = parseTool(await res.json());
          if (parsed) { result = parsed; providerUsed = "lovable"; }
          else lastError = { message: "Lovable AI returned empty response" };
        } else {
          const txt = await res.text();
          console.error("Lovable AI error:", res.status, txt);
          lastError = { status: res.status, message: res.status === 402 ? "Lovable AI credits exhausted" : res.status === 429 ? "Lovable AI rate limited" : `Lovable AI error ${res.status}` };
        }
      } catch (e) { console.error("Lovable exc:", e); lastError = { message: "Lovable network error" }; }
    }

    // 2) User keys
    if (!providerUsed) {
      const { data: keys } = await userClient
        .from("user_ai_keys")
        .select("openai_key_encrypted, gemini_key_encrypted")
        .maybeSingle();

      if (!providerUsed && keys?.gemini_key_encrypted) {
        attempts.push("gemini");
        try {
          const g = await callGemini(keys.gemini_key_encrypted, system, userPrompt);
          if (g.ok && g.result) { result = g.result; providerUsed = "gemini"; }
          else if (!g.ok) { const txt = await g.res.text(); console.error("Gemini error:", g.res.status, txt); lastError = { status: g.res.status, message: `Gemini error ${g.res.status}` }; }
        } catch (e) { console.error("Gemini exc:", e); lastError = { message: "Gemini network error" }; }
      }

      if (!providerUsed && keys?.openai_key_encrypted) {
        attempts.push("openai");
        try {
          const res = await callOpenAI(keys.openai_key_encrypted, system, userPrompt, tool, toolName);
          if (res.ok) { const parsed = parseTool(await res.json()); if (parsed) { result = parsed; providerUsed = "openai"; } }
          else { const txt = await res.text(); console.error("OpenAI error:", res.status, txt); lastError = { status: res.status, message: `OpenAI error ${res.status}` }; }
        } catch (e) { console.error("OpenAI exc:", e); lastError = { message: "OpenAI network error" }; }
      }
    }

    if (!providerUsed || !result) {
      const msg = lastError?.status === 402
        ? "Lovable AI credits exhausted. Add your own OpenAI or Gemini key in Settings → AI Keys to keep the secretary running."
        : lastError?.status === 429
        ? "AI is rate-limited. Try again shortly, or add a personal OpenAI/Gemini key in Settings for a fallback."
        : (lastError?.message || "AI briefing failed") + ". Add a personal OpenAI or Gemini key in Settings → AI Keys.";
      return new Response(JSON.stringify({ error: msg, attempts }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      await userClient.from("assistant_runs").insert({
        user_id: user.id,
        snapshot_json: { action, snapshot_len: snapshot.length },
        result_json: { ai_status: "ok", provider_used: providerUsed, action },
      });
    } catch { /* noop */ }

    return new Response(JSON.stringify({ ...result, provider_used: providerUsed, attempts }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("secretary error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
