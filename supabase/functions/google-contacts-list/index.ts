import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getValidAccessToken, loadAccount, corsHeaders, json } from "../_shared/google-contacts-token.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "AUTH_MISSING" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "AUTH_MISSING" }, 401);

    const url = new URL(req.url);
    const pageToken = url.searchParams.get("pageToken") ?? "";
    const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") ?? "100"), 500);

    const db = createClient(supabaseUrl, serviceKey);
    const account = await loadAccount(db, user.id);
    if (!account) return json({ error: "not_connected" }, 404);

    const token = await getValidAccessToken(db, account);
    if (!token) return json({ error: "reconnect_needed" }, 401);

    const params = new URLSearchParams({
      personFields: "names,emailAddresses,phoneNumbers,organizations,metadata",
      pageSize: String(pageSize),
      sortOrder: "LAST_MODIFIED_DESCENDING",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`https://people.googleapis.com/v1/people/me/connections?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[google-contacts-list] people api error:", res.status, t);
      return json({ error: "google_error", status: res.status, details: t }, res.status);
    }
    const data = await res.json();

    const items = (data.connections ?? []).map((p: any) => {
      const name = p.names?.[0];
      const email = p.emailAddresses?.[0]?.value ?? null;
      const phone = p.phoneNumbers?.[0]?.value ?? null;
      const org = p.organizations?.[0];
      return {
        resource_name: p.resourceName,
        etag: p.etag,
        full_name: name?.displayName ?? [name?.givenName, name?.familyName].filter(Boolean).join(" ") ?? "",
        first_name: name?.givenName ?? null,
        last_name: name?.familyName ?? null,
        email,
        phone,
        organization: org?.name ?? null,
        title: org?.title ?? null,
      };
    });

    // Determine which are already linked to hub_contacts for this user
    const resourceNames = items.map((i: any) => i.resource_name);
    let linked: Record<string, string> = {};
    if (resourceNames.length > 0) {
      const { data: links } = await db
        .from("hub_contact_links")
        .select("hub_contact_id, remote_id")
        .eq("app_key", "google_contacts")
        .in("remote_id", resourceNames);
      linked = Object.fromEntries((links ?? []).map((l: any) => [l.remote_id, l.hub_contact_id]));
    }

    return json({
      contacts: items.map((i: any) => ({ ...i, hub_contact_id: linked[i.resource_name] ?? null })),
      nextPageToken: data.nextPageToken ?? null,
      totalPeople: data.totalPeople ?? null,
      account: { id: account.id, email: account.email_address, display_name: account.display_name },
    });
  } catch (e) {
    console.error("[google-contacts-list] error:", e);
    return json({ error: String(e) }, 500);
  }
});
