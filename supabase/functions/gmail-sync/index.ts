import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_MESSAGES = 50;

async function refreshAccessToken(db: any, accountId: string, refreshToken: string): Promise<string | null> {
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID")!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("[gmail-sync] Token refresh failed:", await res.text());
    return null;
  }

  const tokens = await res.json();
  const newAccessToken = tokens.access_token;
  const expiresIn = tokens.expires_in ?? 3600;

  await db.from("email_accounts").update({
    token_encrypted: newAccessToken,
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", accountId);

  return newAccessToken;
}

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

    const body = await req.json().catch(() => ({}));
    const accountId = body.account_id;

    const db = createClient(supabaseUrl, serviceKey);

    // Get connected Gmail accounts for this user
    let accountQuery = db
      .from("email_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .eq("status", "connected")
      .is("deleted_at", null);

    if (accountId) {
      accountQuery = accountQuery.eq("id", accountId);
    }

    const { data: accounts, error: accErr } = await accountQuery;
    if (accErr) throw accErr;

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ error: "No connected Gmail accounts found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: any[] = [];

    for (const account of accounts) {
      try {
        let accessToken = account.token_encrypted;
        const refreshToken = account.refresh_token_encrypted;

        // Check if token is expired and refresh if needed
        if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
          if (!refreshToken) {
            results.push({ account_id: account.id, email: account.email_address, error: "Token expired and no refresh token" });
            continue;
          }
          accessToken = await refreshAccessToken(db, account.id, refreshToken);
          if (!accessToken) {
            // Mark account as needing reconnect
            await db.from("email_accounts").update({ status: "reconnect_needed", updated_at: new Date().toISOString() }).eq("id", account.id);
            results.push({ account_id: account.id, email: account.email_address, error: "Token refresh failed — reconnect needed" });
            continue;
          }
        }

        // Fetch messages from Gmail API (last 7 days default)
        const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
        const query = `after:${sevenDaysAgo}`;

        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${MAX_MESSAGES}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!listRes.ok) {
          const errText = await listRes.text();
          console.error(`[gmail-sync] List failed for ${account.email_address}:`, listRes.status, errText);
          if (listRes.status === 401) {
            // Try refresh
            if (refreshToken) {
              accessToken = await refreshAccessToken(db, account.id, refreshToken);
              if (!accessToken) {
                await db.from("email_accounts").update({ status: "reconnect_needed" }).eq("id", account.id);
                results.push({ account_id: account.id, error: "Auth expired — reconnect needed" });
                continue;
              }
              // Retry list
              const retryRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${MAX_MESSAGES}`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (!retryRes.ok) {
                results.push({ account_id: account.id, error: "Gmail API failed after refresh" });
                continue;
              }
              const retryData = await retryRes.json();
              await processMessages(db, user.id, account, accessToken, retryData.messages ?? [], results);
              continue;
            }
            results.push({ account_id: account.id, error: "Token expired" });
            continue;
          }
          results.push({ account_id: account.id, error: `Gmail API error: ${listRes.status}` });
          continue;
        }

        const listData = await listRes.json();
        const messageIds = listData.messages ?? [];

        await processMessages(db, user.id, account, accessToken, messageIds, results);

        // Update last_sync_at
        await db.from("email_accounts").update({
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", account.id);

      } catch (accError) {
        console.error(`[gmail-sync] Error for account ${account.id}:`, accError);
        results.push({ account_id: account.id, error: String(accError) });
      }
    }

    console.log("[gmail-sync] Completed for user:", user.id, "results:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[gmail-sync] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function processMessages(db: any, userId: string, account: any, accessToken: string, messageIds: any[], results: any[]) {
  let synced = 0;
  let skipped = 0;

  // Batch fetch message metadata (format=metadata for efficiency)
  for (const msg of messageIds) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!msgRes.ok) {
        skipped++;
        continue;
      }

      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers ?? [];

      const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

      const from = getHeader("From");
      const to = getHeader("To");
      const cc = getHeader("Cc");
      const subject = getHeader("Subject");
      const dateHeader = getHeader("Date");

      const permalink = `https://mail.google.com/mail/u/0/#inbox/${msg.id}`;

      // Upsert into email_messages
      const { error: upsertErr } = await db.from("email_messages").upsert({
        user_id: userId,
        account_id: account.id,
        message_id: msg.id,
        gmail_message_id: msg.id,
        gmail_thread_id: msgData.threadId || null,
        sender: from,
        recipients: to ? to.split(",").map((s: string) => s.trim()) : [],
        cc: cc ? cc.split(",").map((s: string) => s.trim()) : [],
        subject: subject || "(no subject)",
        snippet: msgData.snippet || "",
        date: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
        internal_date: msgData.internalDate ? parseInt(msgData.internalDate) : null,
        label_ids: msgData.labelIds ?? [],
        permalink,
        has_body: false,
        is_read: !(msgData.labelIds ?? []).includes("UNREAD"),
        raw_size: msgData.sizeEstimate || null,
      }, {
        onConflict: "user_id,account_id,gmail_message_id",
        ignoreDuplicates: false,
      });

      if (upsertErr) {
        // If upsert fails due to missing unique constraint match, try insert
        if (upsertErr.code === "42P10" || upsertErr.code === "23505") {
          skipped++;
        } else {
          console.error("[gmail-sync] upsert error:", upsertErr);
          skipped++;
        }
        continue;
      }

      // Upsert email_inbox_items
      await db.from("email_inbox_items").upsert({
        user_id: userId,
        source: "gmail",
        source_id: msg.id,
        account_id: account.id,
        status: "new",
        last_touched_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,source,source_id",
        ignoreDuplicates: true,
      });

      synced++;
    } catch (msgErr) {
      console.error("[gmail-sync] message error:", msgErr);
      skipped++;
    }
  }

  results.push({ account_id: account.id, email: account.email_address, synced, skipped, total: messageIds.length });
}
