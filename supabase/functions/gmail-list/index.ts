import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "AUTH_MISSING" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "AUTH_MISSING" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") ?? "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "25"), 100);
    const search = url.searchParams.get("search") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const accountId = url.searchParams.get("account_id") ?? "";
    const offset = (page - 1) * limit;

    let query = userClient
      .from("email_messages")
      .select("id, message_id, gmail_message_id, gmail_thread_id, sender, recipients, cc, subject, snippet, date, internal_date, label_ids, permalink, is_read, is_starred, has_body, account_id", { count: "exact" })
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (accountId) {
      query = query.eq("account_id", accountId);
    }

    if (search) {
      query = query.or(`subject.ilike.%${search}%,sender.ilike.%${search}%,snippet.ilike.%${search}%`);
    }

    const { data: messages, count, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({
      messages: messages ?? [],
      total: count ?? 0,
      page,
      limit,
      has_more: (count ?? 0) > offset + limit,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[gmail-list] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
