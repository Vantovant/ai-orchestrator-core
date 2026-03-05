import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BODY_PREVIEW_CAP = 2000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "AUTH_MISSING" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "AUTH_MISSING" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const messageId = body.message_id;
    const fetchBody = body.fetch_body ?? false;

    if (!messageId) {
      return new Response(JSON.stringify({ error: "message_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get message from our DB
    const { data: message, error: msgErr } = await userClient
      .from("email_messages")
      .select("*")
      .eq("id", messageId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (msgErr) throw msgErr;
    if (!message) {
      return new Response(JSON.stringify({ error: "Message not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If body requested and not stored, fetch from Gmail API on-demand
    if (fetchBody && !message.has_body && message.gmail_message_id) {
      const db = createClient(supabaseUrl, serviceKey);

      // Get account tokens
      const { data: account } = await db
        .from("email_accounts")
        .select("token_encrypted, refresh_token_encrypted, token_expires_at")
        .eq("id", message.account_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (account?.token_encrypted) {
        let accessToken = account.token_encrypted;

        // Check token expiry
        if (account.token_expires_at && new Date(account.token_expires_at) < new Date() && account.refresh_token_encrypted) {
          const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID")!;
          const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET")!;
          const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: GOOGLE_CLIENT_ID,
              client_secret: GOOGLE_CLIENT_SECRET,
              refresh_token: account.refresh_token_encrypted,
              grant_type: "refresh_token",
            }),
          });
          if (refreshRes.ok) {
            const tokens = await refreshRes.json();
            accessToken = tokens.access_token;
            await db.from("email_accounts").update({
              token_encrypted: accessToken,
              token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
            }).eq("id", message.account_id);
          }
        }

        // Fetch full message
        const fullRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.gmail_message_id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (fullRes.ok) {
          const fullData = await fullRes.json();
          const bodyPreview = extractBodyPreview(fullData);

          // Store truncated body
          await db.from("email_messages").update({
            body_preview: bodyPreview.slice(0, BODY_PREVIEW_CAP),
            has_body: true,
            updated_at: new Date().toISOString(),
          }).eq("id", messageId);

          message.body_preview = bodyPreview.slice(0, BODY_PREVIEW_CAP);
          message.has_body = true;
        }
      }
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[gmail-get] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function extractBodyPreview(gmailMessage: any): string {
  const parts = gmailMessage.payload?.parts ?? [];
  
  // Try plain text first
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }

  // Try top-level body
  if (gmailMessage.payload?.body?.data) {
    return decodeBase64Url(gmailMessage.payload.body.data);
  }

  // Try multipart children
  for (const part of parts) {
    if (part.parts) {
      for (const sub of part.parts) {
        if (sub.mimeType === "text/plain" && sub.body?.data) {
          return decodeBase64Url(sub.body.data);
        }
      }
    }
  }

  // Fallback to snippet
  return gmailMessage.snippet || "";
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
  } catch {
    return data;
  }
}
