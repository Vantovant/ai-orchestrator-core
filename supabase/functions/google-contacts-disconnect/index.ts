import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/google-contacts-token.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "AUTH_MISSING" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "AUTH_MISSING" }, 401);

    const body = await req.json().catch(() => ({}));
    const accountId = body.account_id as string | undefined;

    const db = createClient(supabaseUrl, serviceKey);
    let q = db.from("google_contacts_accounts").update({
      status: "disconnected",
      deleted_at: new Date().toISOString(),
      token_encrypted: null,
      refresh_token_encrypted: null,
    }).eq("user_id", user.id);
    if (accountId) q = q.eq("id", accountId);
    const { error } = await q;
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
