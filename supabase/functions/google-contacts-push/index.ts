import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getValidAccessToken, loadAccount, corsHeaders, json } from "../_shared/google-contacts-token.ts";

// Push hub_contacts (all non-deleted, or a specific id) up to Google Contacts on vantovant@gmail.com.
// For contacts already linked to google_contacts: PATCH updateContact.
// For contacts not linked: POST createContact, then insert hub_contact_links.
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
    const contactId: string | undefined = body.contact_id;
    const maxBatch: number = Math.min(body.max ?? 200, 500);

    const db = createClient(supabaseUrl, serviceKey);
    const account = await loadAccount(db, user.id);
    if (!account) return json({ error: "not_connected" }, 404);
    const token = await getValidAccessToken(db, account);
    if (!token) return json({ error: "reconnect_needed" }, 401);

    // Load candidates
    let q = db.from("hub_contacts")
      .select("*, hub_contact_links(app_key, remote_id)")
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .limit(maxBatch);
    if (contactId) q = q.eq("id", contactId);
    const { data: contacts, error: cErr } = await q;
    if (cErr) throw cErr;

    let created = 0, updated = 0, failed = 0;
    const results: any[] = [];

    for (const c of contacts ?? []) {
      try {
        const links: any[] = (c as any).hub_contact_links ?? [];
        const gLink = links.find((l: any) => l.app_key === "google_contacts");

        const personBody: any = {
          names: c.full_name || c.first_name || c.last_name ? [{
            givenName: c.first_name ?? undefined,
            familyName: c.last_name ?? undefined,
            displayName: c.full_name ?? undefined,
          }] : undefined,
          emailAddresses: c.email ? [{ value: c.email }] : undefined,
          phoneNumbers: c.phone_e164 ? [{ value: c.phone_e164 }] : undefined,
          biographies: c.notes ? [{ value: c.notes, contentType: "TEXT_PLAIN" }] : undefined,
        };

        if (gLink?.remote_id) {
          // Fetch etag first
          const getRes = await fetch(`https://people.googleapis.com/v1/${gLink.remote_id}?personFields=names,emailAddresses,phoneNumbers,biographies`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!getRes.ok) {
            // If 404, treat as create
            if (getRes.status === 404) {
              await db.from("hub_contact_links").delete().eq("hub_contact_id", c.id).eq("app_key", "google_contacts");
              // fall through to create below
            } else {
              const t = await getRes.text();
              results.push({ contact_id: c.id, ok: false, error: `get_${getRes.status}: ${t.slice(0, 140)}` });
              failed++;
              continue;
            }
          } else {
            const existingPerson = await getRes.json();
            const updateFields = ["names", "emailAddresses", "phoneNumbers", "biographies"].join(",");
            const patchRes = await fetch(
              `https://people.googleapis.com/v1/${gLink.remote_id}:updateContact?updatePersonFields=${updateFields}`,
              {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ ...personBody, etag: existingPerson.etag }),
              },
            );
            if (!patchRes.ok) {
              const t = await patchRes.text();
              results.push({ contact_id: c.id, ok: false, error: `patch_${patchRes.status}: ${t.slice(0, 140)}` });
              failed++;
              continue;
            }
            await db.from("hub_contact_links").update({
              last_pushed_at: new Date().toISOString(),
            }).eq("hub_contact_id", c.id).eq("app_key", "google_contacts");
            updated++;
            results.push({ contact_id: c.id, ok: true, action: "updated" });
            continue;
          }
        }

        // Create
        const createRes = await fetch("https://people.googleapis.com/v1/people:createContact", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(personBody),
        });
        if (!createRes.ok) {
          const t = await createRes.text();
          results.push({ contact_id: c.id, ok: false, error: `create_${createRes.status}: ${t.slice(0, 140)}` });
          failed++;
          continue;
        }
        const newPerson = await createRes.json();
        await db.from("hub_contact_links").insert({
          hub_contact_id: c.id,
          app_key: "google_contacts",
          remote_id: newPerson.resourceName,
          last_pushed_at: new Date().toISOString(),
        });
        created++;
        results.push({ contact_id: c.id, ok: true, action: "created", resource_name: newPerson.resourceName });
      } catch (err) {
        failed++;
        results.push({ contact_id: (c as any).id, ok: false, error: String(err) });
      }
    }

    await db.from("google_contacts_accounts").update({
      last_push_at: new Date().toISOString(),
    }).eq("id", account.id);

    return json({ ok: true, created, updated, failed, total: (contacts ?? []).length, results });
  } catch (e) {
    console.error("[google-contacts-push] error:", e);
    return json({ error: String(e) }, 500);
  }
});
