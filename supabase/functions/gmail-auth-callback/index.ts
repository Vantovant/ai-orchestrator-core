import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://executive.onlinecourseformlm.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("[gmail-auth-callback] OAuth error:", error);
      return redirect(`${APP_URL}/settings?gmail=error&code=oauth_cancelled`);
    }

    if (!code || !state) {
      return redirect(`${APP_URL}/settings?gmail=error&code=missing_params`);
    }

    // Decode state to get user_id
    let stateData: { user_id: string; ts: number };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return redirect(`${APP_URL}/settings?gmail=error&code=invalid_state`);
    }

    // Validate state age (max 10 minutes)
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      return redirect(`${APP_URL}/settings?gmail=error&code=state_expired`);
    }

    const userId = stateData.user_id;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID")!;
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET")!;
    const redirectUri = `${supabaseUrl}/functions/v1/gmail-auth-callback`;

    // Exchange code for tokens
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
      const errText = await tokenRes.text();
      console.error("[gmail-auth-callback] Token exchange failed:", errText);
      // Detect 403 / access_denied
      if (errText.includes("access_denied") || errText.includes("403")) {
        return redirect(`${APP_URL}/settings?gmail=error&code=access_denied`);
      }
      return redirect(`${APP_URL}/settings?gmail=error&code=token_exchange_failed`);
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresIn = tokens.expires_in ?? 3600;

    // Get user's email from Google
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();
    const emailAddress = profile.email;

    if (!emailAddress) {
      return redirect(`${APP_URL}/settings?gmail=error&code=no_email`);
    }

    const db = createClient(supabaseUrl, serviceKey);

    // Upsert email_accounts
    const { data: existingAccount } = await db
      .from("email_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("email_address", emailAddress)
      .eq("provider", "gmail")
      .is("deleted_at", null)
      .maybeSingle();

    const accountData = {
      user_id: userId,
      email_address: emailAddress,
      provider: "gmail",
      status: "connected",
      display_name: profile.name || emailAddress,
      scopes: ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email"],
      token_encrypted: accessToken,
      refresh_token_encrypted: refreshToken || null,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };

    if (existingAccount) {
      await db.from("email_accounts").update(accountData).eq("id", existingAccount.id);
      console.log("[gmail-auth-callback] Updated existing account:", existingAccount.id);
    } else {
      await db.from("email_accounts").insert({ ...accountData, label: "Business" });
      console.log("[gmail-auth-callback] Created new account for:", emailAddress);
    }

    console.log("[gmail-auth-callback] Gmail connected for user:", userId, "email:", emailAddress);

    return redirect(`${APP_URL}/settings?gmail=connected`);
  } catch (e) {
    console.error("[gmail-auth-callback] error:", e);
    return redirect(`${APP_URL}/settings?gmail=error&code=unknown`);
  }
});

function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}
