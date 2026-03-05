import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("[gmail-auth-callback] OAuth error:", error);
      return new Response(redirectHtml("Gmail connection cancelled."), { headers: { "Content-Type": "text/html" } });
    }

    if (!code || !state) {
      return new Response(redirectHtml("Missing code or state."), { headers: { "Content-Type": "text/html" } });
    }

    // Decode state to get user_id
    let stateData: { user_id: string; ts: number };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return new Response(redirectHtml("Invalid state."), { headers: { "Content-Type": "text/html" } });
    }

    // Validate state age (max 10 minutes)
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      return new Response(redirectHtml("State expired. Please try again."), { headers: { "Content-Type": "text/html" } });
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
      return new Response(redirectHtml("Token exchange failed."), { headers: { "Content-Type": "text/html" } });
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
      return new Response(redirectHtml("Could not retrieve email address."), { headers: { "Content-Type": "text/html" } });
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

    // Redirect back to VantoOS settings
    const appUrl = Deno.env.get("VANTOOS_APP_URL") || "https://vantoos-ai-core.lovable.app";
    return new Response(redirectHtml("Gmail connected successfully!", `${appUrl}/settings`), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (e) {
    console.error("[gmail-auth-callback] error:", e);
    return new Response(redirectHtml("An error occurred. Please try again."), { headers: { "Content-Type": "text/html" } });
  }
});

function redirectHtml(message: string, redirectUrl?: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>VantoOS Gmail</title>
    ${redirectUrl ? `<meta http-equiv="refresh" content="2;url=${redirectUrl}">` : ""}
    <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fff}
    .card{text-align:center;padding:2rem;border-radius:12px;background:#1a1a1a;border:1px solid #333}
    </style></head><body><div class="card"><h2>${message}</h2>
    ${redirectUrl ? "<p>Redirecting to VantoOS...</p>" : "<p>You can close this window.</p>"}
    </div></body></html>`;
}
