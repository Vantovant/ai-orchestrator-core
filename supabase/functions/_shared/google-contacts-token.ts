// Shared helper: get a valid Google access token for a google_contacts_accounts row,
// refreshing when needed. Returns null if refresh fails (marks account reconnect_needed).
export async function getValidAccessToken(db: any, account: any): Promise<string | null> {
  const now = Date.now();
  const exp = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (account.token_encrypted && exp - 60_000 > now) return account.token_encrypted;

  const refresh = account.refresh_token_encrypted;
  if (!refresh) {
    await db.from("google_contacts_accounts").update({ status: "reconnect_needed" }).eq("id", account.id);
    return null;
  }
  const clientId = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET")!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("[google-contacts token refresh] failed:", await res.text());
    await db.from("google_contacts_accounts").update({ status: "reconnect_needed" }).eq("id", account.id);
    return null;
  }
  const tok = await res.json();
  const newAt = tok.access_token as string;
  const expiresIn = tok.expires_in ?? 3600;
  await db.from("google_contacts_accounts").update({
    token_encrypted: newAt,
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    status: "connected",
  }).eq("id", account.id);
  return newAt;
}

export async function loadAccount(db: any, userId: string, accountId?: string) {
  let q = db.from("google_contacts_accounts").select("*").eq("user_id", userId).is("deleted_at", null).eq("status", "connected");
  if (accountId) q = q.eq("id", accountId);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
