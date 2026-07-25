import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://executive.onlinecourseformlm.com";

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const err = url.searchParams.get("error");

    if (err) return redirect(`${APP_URL}/contacts?gcontacts=error&code=${encodeURIComponent(err)}`);
    if (!code || !state) return redirect(`${APP_URL}/contacts?gcontacts=error&code=missing_params`);

    let stateData: { user_id: string; ts: number };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return redirect(`${APP_URL}/contacts?gcontacts=error&code=invalid_state`);
    }
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      return redirect(`${APP_URL}/contacts?gcontacts=error&code=state_expired`);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID")!;
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET")!;
    const redirectUri = `${supabaseUrl}/functions/v1/google-contacts-auth-callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("[google-contacts-auth-callback] token exchange failed:", t);
      if (t.includes("access_denied")) return redirect(`${APP_URL}/contacts?gcontacts=error&code=access_denied`);
      return redirect(`${APP_URL}/contacts?gcontacts=error&code=token_exchange_failed`);
    }
    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresIn = tokens.expires_in ?? 3600;

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();
    const emailAddress = profile.email;
    if (!emailAddress) return redirect(`${APP_URL}/contacts?gcontacts=error&code=no_email`);

    const db = createClient(supabaseUrl, serviceKey);
    const { data: existing } = await db
      .from("google_contacts_accounts")
      .select("id")
      .eq("user_id", stateData.user_id)
      .eq("email_address", emailAddress)
      .maybeSingle();

    const row = {
      user_id: stateData.user_id,
      email_address: emailAddress,
      display_name: profile.name || emailAddress,
      status: "connected",
      scopes: ["https://www.googleapis.com/auth/contacts", "openid", "email", "profile"],
      token_encrypted: accessToken,
      refresh_token_encrypted: refreshToken || null,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      deleted_at: null,
    };

    if (existing) {
      await db.from("google_contacts_accounts").update(row).eq("id", existing.id);
    } else {
      await db.from("google_contacts_accounts").insert(row);
    }

    return redirect(`${APP_URL}/contacts?gcontacts=connected`);
  } catch (e) {
    console.error("[google-contacts-auth-callback] error:", e);
    return redirect(`${APP_URL}/contacts?gcontacts=error&code=unknown`);
  }
});
