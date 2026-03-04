import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    if (req.method === "POST") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action") || "generate";

      if (action === "generate") {
        // Generate a 6-char pairing code
        const code = Array.from(crypto.getRandomValues(new Uint8Array(3)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();

        const { data, error } = await supabase
          .from("extension_pairing_codes")
          .insert({ user_id: user.id, code })
          .select()
          .single();
        if (error) throw error;

        return new Response(JSON.stringify({ code: data.code, expires_at: data.expires_at }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "exchange") {
        // Exchange pairing code for token (called by extension, no auth required — handled below)
        throw new Error("Use the exchange endpoint without auth");
      }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
