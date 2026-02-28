import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

    // Parallel queries — token-disciplined: only curated fields
    const [tasksRes, meetingsRes, remindersRes, contextRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, estimated_minutes")
        .is("deleted_at", null)
        .in("status", ["pending", "in_progress"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(10),
      supabase
        .from("meetings")
        .select("id, title, start_time, end_time, location, attendees")
        .is("deleted_at", null)
        .gte("start_time", todayStart)
        .lt("start_time", todayEnd)
        .order("start_time", { ascending: true }),
      supabase
        .from("reminders")
        .select("id, title, reminder_time, is_done")
        .is("deleted_at", null)
        .eq("is_done", false)
        .lte("reminder_time", next48h)
        .order("reminder_time", { ascending: true })
        .limit(10),
      supabase
        .from("executive_context")
        .select("context_key, context_value")
        .is("deleted_at", null)
        .limit(20),
    ]);

    const snapshot = {
      generatedAt: now.toISOString(),
      topTasks: tasksRes.data ?? [],
      todayMeetings: meetingsRes.data ?? [],
      urgentReminders: remindersRes.data ?? [],
      executiveContext: Object.fromEntries(
        (contextRes.data ?? []).map((c: any) => [c.context_key, c.context_value])
      ),
    };

    return new Response(JSON.stringify(snapshot), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("snapshot-build error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
