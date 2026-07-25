import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getValidAccessToken, loadAccount, corsHeaders, json } from "../_shared/google-contacts-token.ts";

// Pulls selected Google contacts (by resourceName[]) into hub_contacts and creates hub_contact_links.
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

    const body = await req.json().catch(() => ({}));
    const resourceNames: string[] = Array.isArray(body.resource_names) ? body.resource_names : [];
    if (resourceNames.length === 0) return json({ error: "no_resource_names" }, 400);
    if (resourceNames.length > 200) return json({ error: "too_many" }, 400);

    const db = createClient(supabaseUrl, serviceKey);
    const account = await loadAccount(db, user.id);
    if (!account) return json({ error: "not_connected" }, 404);
    const token = await getValidAccessToken(db, account);
    if (!token) return json({ error: "reconnect_needed" }, 401);

    // Batch fetch (max 200 per request)
    const params = new URLSearchParams({
      personFields: "names,emailAddresses,phoneNumbers,organizations,biographies,metadata",
    });
    resourceNames.forEach(rn => params.append("resourceNames", rn));

    const res = await fetch(`https://people.googleapis.com/v1/people:batchGet?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[google-contacts-pull] batchGet failed:", res.status, t);
      return json({ error: "google_error", status: res.status, details: t }, res.status);
    }
    const data = await res.json();

    let imported = 0, updated = 0, skipped = 0;
    const results: any[] = [];

    for (const resp of data.responses ?? []) {
      const p = resp.person;
      if (!p) { skipped++; continue; }
      const name = p.names?.[0];
      const email = p.emailAddresses?.[0]?.value ?? null;
      const phone = p.phoneNumbers?.[0]?.value ?? null;
      const org = p.organizations?.[0];
      const notes = p.biographies?.[0]?.value ?? null;
      const full_name = name?.displayName ?? [name?.givenName, name?.familyName].filter(Boolean).join(" ") ?? email ?? "(Unnamed)";

      // Check existing link
      const { data: existingLink } = await db
        .from("hub_contact_links")
        .select("hub_contact_id")
        .eq("app_key", "google_contacts")
        .eq("remote_id", p.resourceName)
        .maybeSingle();

      let hubId: string;
      const contactPayload = {
        user_id: user.id,
        full_name,
        first_name: name?.givenName ?? null,
        last_name: name?.familyName ?? null,
        email,
        phone_e164: phone,
        contact_type: "mixed",
        contact_source: "google_contacts",
        contact_confidence: "confirmed",
        source_app: "google_contacts",
        source_id: p.resourceName,
        notes: notes ?? (org?.name ? `Org: ${org.name}${org.title ? " — " + org.title : ""}` : null),
        last_synced_at: new Date().toISOString(),
      };

      if (existingLink) {
        const { error: upErr } = await db.from("hub_contacts").update({
          ...contactPayload,
          updated_at: new Date().toISOString(),
        }).eq("id", existingLink.hub_contact_id).eq("user_id", user.id);
        if (upErr) { skipped++; continue; }
        hubId = existingLink.hub_contact_id;
        await db.from("hub_contact_links").update({
          last_pulled_at: new Date().toISOString(),
        }).eq("hub_contact_id", hubId).eq("app_key", "google_contacts");
        updated++;
        results.push({ resource_name: p.resourceName, hub_contact_id: hubId, action: "updated" });
      } else {
        const { data: inserted, error: insErr } = await db
          .from("hub_contacts")
          .insert(contactPayload)
          .select("id")
          .single();
        if (insErr || !inserted) { skipped++; continue; }
        hubId = inserted.id;
        await db.from("hub_contact_links").insert({
          hub_contact_id: hubId,
          app_key: "google_contacts",
          remote_id: p.resourceName,
          last_pulled_at: new Date().toISOString(),
        });
        imported++;
        results.push({ resource_name: p.resourceName, hub_contact_id: hubId, action: "imported" });
      }
    }

    await db.from("google_contacts_accounts").update({
      last_pull_at: new Date().toISOString(),
    }).eq("id", account.id);

    return json({ ok: true, imported, updated, skipped, results });
  } catch (e) {
    console.error("[google-contacts-pull] error:", e);
    return json({ error: String(e) }, 500);
  }
});
