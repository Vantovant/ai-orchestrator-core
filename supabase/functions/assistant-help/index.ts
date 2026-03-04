import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token",
};

async function resolveUser(req: Request): Promise<{ userId: string }> {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const extToken = req.headers.get("x-extension-token");
  if (extToken) {
    const tokenHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extToken)))
    ).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data } = await supabaseAdmin
      .from("extension_tokens")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (data) return { userId: data.user_id };
    throw new Error("Unauthorized");
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await supabaseUser.auth.getUser();
    if (user && !error) return { userId: user.id };
  }

  throw new Error("Unauthorized");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const { userId } = await resolveUser(req);
    const { current_tab, url, domain, minimal_snapshot, user_question } = await req.json();

    if (!user_question) throw new Error("user_question required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check BYOK
    const { data: keyData } = await supabaseAdmin
      .from("user_ai_keys")
      .select("use_own_keys, openai_key_encrypted, gemini_key_encrypted")
      .eq("user_id", userId)
      .maybeSingle();

    const hasKey = keyData?.use_own_keys && (keyData.openai_key_encrypted || keyData.gemini_key_encrypted);
    if (!hasKey) {
      return new Response(JSON.stringify({
        error: "ai_keys_missing",
        message: "Connect your AI key in VantoOS → Settings → AI Keys to unlock Ask Assistant.",
        ai_status: "blocked",
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context
    const contextParts = [
      `User is on tab: ${current_tab || "unknown"}`,
      url ? `Current URL: ${url}` : "",
      domain ? `Domain: ${domain}` : "",
      minimal_snapshot ? `Page context: ${JSON.stringify(minimal_snapshot).slice(0, 1000)}` : "",
    ].filter(Boolean).join("\n");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        calling_function: "assistant-help",
        workspace_type: "private",
        messages: [
          {
            role: "system",
            content: `You are the VantoOS Companion assistant, a helpful guide for the Chrome extension side panel. VantoOS is an executive operating system for South African entrepreneurs. The extension helps capture web pages, manage projects and tasks. Answer concisely (max 150 words). If the question involves sensitive financial/legal matters, add a safety note.

Extension tabs:
- Capture: Capture current web page (Quick or Smart AI capture), send to project inbox
- Projects: View and select projects
- Tasks: View tasks, filter by project
- Settings: Pair with VantoOS, manage allowed domains, grant browser permissions`,
          },
          {
            role: "user",
            content: `Context:\n${contextParts}\n\nQuestion: ${user_question}`,
          },
        ],
      }),
    });

    const aiData = await aiResponse.json();

    const answer = aiData.result || "I couldn't generate an answer right now. Please try again.";
    const needsSafetyNote = typeof answer === "string" &&
      /\b(tax|legal|investment|financial advice|compliance)\b/i.test(answer);

    return new Response(JSON.stringify({
      answer: typeof answer === "string" ? answer : JSON.stringify(answer),
      safety_note: needsSafetyNote
        ? "⚠️ This is general guidance only. Consult a qualified professional for specific advice."
        : null,
      ai_status: aiData.ai_status || "ok",
      provider_used: aiData.provider_used || "unknown",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Unauthorized" ? 401 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
