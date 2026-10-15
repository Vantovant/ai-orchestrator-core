// Syncs ONE selected personal contact to the owner's connected Google account
// (Google People API). Explicit request only — never bulk, never auto-import.
// Tokens stay server-side; responses never include them.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getValidAccessToken, loadAccount, corsHeaders, json } from "../_shared/google-contacts-token.ts";

const FIELDS = "names,phoneNumbers,emailAddresses,organizations,biographies,metadata";
const digits = (s: string) => (s ?? "").replace(/\D/g, "");

async function g(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(`https://people.googleapis.com/v1/${url}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, body };
}

function summarize(p: any) {
  return {
    resource_name: p?.resourceName ?? null,
    etag: p?.etag ?? null,
    name: p?.names?.[0]?.displayName ?? null,
    phones: (p?.phoneNumbers ?? []).map((x: any) => x.canonicalForm ?? x.value),
    emails: (p?.emailAddresses ?? []).map((x: any) => x.value),
    organization: p?.organizations?.[0]?.name ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "AUTH_MISSING" }, 401);
    const userDb = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: cErr } = await userDb.auth.getClaims(authHeader.slice(7));
    const userId = claims?.claims?.sub;
    if (cErr || !userId) return json({ ok: false, error: "AUTH_MISSING" }, 401);

    const body = await req.json().catch(() => ({}));
    const contactId = typeof body?.contact_id === "string" ? body.contact_id : "";
    const mode = body?.mode === "status" ? "status" : "sync";
    if (!/^[0-9a-f-]{36}$/i.test(contactId)) return json({ ok: false, error: "contact_id_required" }, 400);

    // RLS: only the owner can read this row.
    const { data: c, error: rErr } = await userDb.from("personal_contacts").select("*")
      .eq("id", contactId).is("deleted_at", null).maybeSingle();
    if (rErr) return json({ ok: false, error: rErr.message }, 500);
    if (!c || c.user_id !== userId) return json({ ok: false, error: "not_found" }, 404);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const account = await loadAccount(admin, userId);
    const accountInfo = account ? { id: account.id, email: account.email_address, display_name: account.display_name } : null;
    if (!account) {
      return json({ ok: false, error: "google_not_connected", action: "Open VantoOS → Contacts → Google Contacts and click Connect, choosing the Google account used on your phone.", contact_status: c.google_sync_status }, 409);
    }
    const token = await getValidAccessToken(admin, account);
    if (!token) return json({ ok: false, error: "google_reconnect_needed", account: accountInfo }, 409);

    const setStatus = (patch: Record<string, unknown>) => admin.from("personal_contacts").update(patch).eq("id", c.id).eq("user_id", userId);

    if (mode === "status") {
      let google = null;
      if (c.google_resource_name) {
        const r = await g(token, `${c.google_resource_name}?personFields=${FIELDS}`);
        google = r.ok ? summarize(r.body) : { error: `google_${r.status}` };
      }
      return json({ ok: true, contact_id: c.id, status: c.google_sync_status, last_synced_at: c.google_last_synced_at, error: c.google_sync_error, account: accountInfo, google });
    }

    await setStatus({ google_sync_status: "pending", google_sync_error: null });

    // 1) Find existing Google person: stored resourceName, else search by phone (dedupe before create).
    let person: any = null;
    if (c.google_resource_name) {
      const r = await g(token, `${c.google_resource_name}?personFields=${FIELDS}`);
      if (r.ok) person = r.body;
      else if (r.status !== 404) {
        await setStatus({ google_sync_status: "error", google_sync_error: `get_${r.status}` });
        return json({ ok: false, error: `google_get_${r.status}`, details: r.body?.error?.message ?? null }, 502);
      }
    }
    if (!person && c.primary_phone_e164) {
      await g(token, `people:searchContacts?query=&readMask=names`); // required warm-up
      const want = digits(c.primary_phone_e164);
      const local = want.startsWith("27") ? "0" + want.slice(2) : want;
      for (const q of [c.primary_phone_e164, local]) {
        const s = await g(token, `people:searchContacts?query=${encodeURIComponent(q)}&readMask=${FIELDS}&pageSize=10`);
        const hit = (s.body?.results ?? []).map((x: any) => x.person).find((p: any) =>
          (p?.phoneNumbers ?? []).some((n: any) => digits(n.canonicalForm ?? "") === want || digits(n.value).endsWith(want.slice(-9))));
        if (hit) { person = hit; break; }
      }
    }

    const org = c.business_name ? [{ name: c.business_name, department: c.branch ?? undefined }] : undefined;
    const displayName = c.full_name;
    let result: any; let action: string;

    if (person) {
      // Merge: keep every existing Google value; add ours only if missing.
      const phones = [...(person.phoneNumbers ?? [])];
      for (const p of c.phones ?? []) {
        if (!phones.some((n: any) => digits(n.canonicalForm ?? n.value).endsWith(digits(p).slice(-9)))) phones.push({ value: p, type: "work" });
      }
      const emails = [...(person.emailAddresses ?? [])];
      if (c.email && !emails.some((e: any) => String(e.value).toLowerCase() === c.email)) emails.push({ value: c.email, type: "work" });
      const patch: any = { etag: person.etag, phoneNumbers: phones, emailAddresses: emails };
      const fields = ["phoneNumbers", "emailAddresses"];
      if (!(person.names ?? []).length) { patch.names = [{ unstructuredName: displayName }]; fields.push("names"); }
      if (org && !(person.organizations ?? []).length) { patch.organizations = org; fields.push("organizations"); }
      result = await g(token, `${person.resourceName}:updateContact?updatePersonFields=${fields.join(",")}&personFields=${FIELDS}`, { method: "PATCH", body: JSON.stringify(patch) });
      action = c.google_resource_name === person.resourceName ? "updated" : "linked_existing";
    } else {
      const create: any = {
        names: [{ unstructuredName: displayName }],
        phoneNumbers: (c.phones ?? []).map((p: string) => ({ value: p, type: "work" })),
        emailAddresses: c.email ? [{ value: c.email, type: "work" }] : undefined,
        organizations: org,
        biographies: c.notes ? [{ value: c.notes, contentType: "TEXT_PLAIN" }] : undefined,
      };
      result = await g(token, `people:createContact?personFields=${FIELDS}`, { method: "POST", body: JSON.stringify(create) });
      action = "created";
    }

    if (!result.ok) {
      const msg = result.body?.error?.message ?? `google_${result.status}`;
      await setStatus({ google_sync_status: "error", google_sync_error: String(msg).slice(0, 300) });
      return json({ ok: false, error: "google_write_failed", status: result.status, details: msg }, 502);
    }

    // 2) Read back from Google to verify.
    const rb = await g(token, `${result.body.resourceName}?personFields=${FIELDS}`);
    const verified = rb.ok && (rb.body?.phoneNumbers ?? []).some((n: any) => digits(n.canonicalForm ?? n.value).endsWith(digits(c.primary_phone_e164 ?? "").slice(-9)));
    const now = new Date().toISOString();
    await setStatus({
      google_account_id: account.id,
      google_resource_name: result.body.resourceName,
      google_etag: rb.ok ? rb.body.etag : result.body.etag,
      google_sync_status: verified ? "synced" : "error",
      google_sync_error: verified ? null : "readback_mismatch",
      google_last_synced_at: verified ? now : c.google_last_synced_at,
    });
    return json({ ok: verified, action, contact_id: c.id, account: accountInfo, verified, google: rb.ok ? summarize(rb.body) : null });
  } catch (e) {
    console.error("[personal-contact-google-sync]", String(e));
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
