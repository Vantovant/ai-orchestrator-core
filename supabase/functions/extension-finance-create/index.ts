import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token",
};

async function resolveUser(req: Request): Promise<string> {
  const extToken = req.headers.get("x-extension-token");
  if (!extToken) throw new Error("Unauthorized");

  const tokenHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extToken)))
  ).map(b => b.toString(16).padStart(2, "0")).join("");

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await sb
    .from("extension_tokens")
    .select("user_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) throw new Error("Unauthorized");
  return data.user_id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const userId = await resolveUser(req);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { type, amount, category, entry_date, notes, source_chat_key, source_message_hash } = await req.json();

    if (!type || !["income", "expense"].includes(type)) throw new Error("type must be income or expense");
    if (!amount || amount <= 0) throw new Error("amount must be positive");
    if (!source_chat_key || !source_message_hash) throw new Error("source_chat_key and source_message_hash required");

    // Check for existing entry (idempotency)
    const { data: existing } = await sb
      .from("finance_entries")
      .select("id, type, amount, category")
      .eq("user_id", userId)
      .eq("source_chat_key", source_chat_key)
      .eq("source_message_hash", source_message_hash)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        action: "merged",
        finance_entry_id: existing.id,
        message: "Entry already exists",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create new entry
    const { data, error } = await sb
      .from("finance_entries")
      .insert({
        user_id: userId,
        type,
        amount,
        category: category || "general",
        entry_date: entry_date || new Date().toISOString().split("T")[0],
        notes: notes || null,
        source: "whatsapp",
        source_chat_key,
        source_message_hash,
      })
      .select("id, type, amount, category, entry_date")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({
      action: "created",
      finance_entry_id: data.id,
      entry: data,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Unauthorized" ? 401 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
