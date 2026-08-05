// VantoOS — MCP Bridge
// Lets Claude (via the standalone mcp-server) read and update hub_contacts.
// Authenticates via a static x-mcp-token header, compared with a timing-safe
// check against MCP_BRIDGE_TOKEN. Uses the service-role key to bypass RLS,
// since hub_contacts is a suite-wide table with no per-row owner column.
//
// Fail-closed by design, matching the pattern already verified correct in
// maytapi-hub-bridge and suite-bridge-hub's signed actions:
//   - missing/invalid token -> 401
//   - unknown action -> 400
//   - every write is scoped to explicit, allow-listed fields only
//
// supabase/config.toml must set: [functions.mcp-bridge] verify_jwt = false
// (this function authenticates via x-mcp-token, not a Supabase user JWT).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-mcp-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

const CONTACT_FIELDS =
  "id, full_name, first_name, last_name, whatsapp_display_name, phone_e164, email, " +
  "contact_type, lead_type, temperature, tags, consent_whatsapp, consent_email, consent_sms, " +
  "unsubscribed_channels, notes, version, is_deleted, updated_at, source_app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // ---- Auth: static token, timing-safe compare, fail-closed ----
  const expectedToken = Deno.env.get("MCP_BRIDGE_TOKEN") ?? "";
  const providedToken = req.headers.get("x-mcp-token") ?? "";
  if (!expectedToken) return json({ ok: false, error: "server_misconfigured" }, 500);
  if (!providedToken || !timingSafeEqual(providedToken, expectedToken)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let parsed: any;
  try {
    parsed = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  const action = parsed?.action as string | undefined;
  const body = parsed?.body ?? {};
  if (!action) return json({ ok: false, error: "missing_action" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (action) {
      // ---------------------------------------------------------------
      case "list_contacts": {
        const search = String(body?.search ?? "").trim();
        const contact_type = body?.contact_type ? String(body.contact_type) : null;
        const lead_type = body?.lead_type ? String(body.lead_type) : null;
        const temperature = body?.temperature ? String(body.temperature) : null;
        const tag = body?.tag ? String(body.tag) : null;
        const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);

        let q = supabase.from("hub_contacts").select(CONTACT_FIELDS)
          .eq("is_deleted", false)
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (contact_type) q = q.eq("contact_type", contact_type);
        if (lead_type) q = q.eq("lead_type", lead_type);
        if (temperature) q = q.eq("temperature", temperature);
        if (tag) q = q.contains("tags", [tag]);
        if (search) {
          q = q.or(
            `full_name.ilike.%${search}%,email.ilike.%${search}%,phone_e164.ilike.%${search}%`,
          );
        }

        const { data, error } = await q;
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, contacts: data ?? [], count: data?.length ?? 0 });
      }

      // ---------------------------------------------------------------
      case "get_contact": {
        const id = body?.id ? String(body.id) : null;
        const phone = body?.phone ? String(body.phone) : null;
        const email = body?.email ? String(body.email).toLowerCase() : null;
        if (!id && !phone && !email) {
          return json({ ok: false, error: "id_phone_or_email_required" }, 400);
        }

        let q = supabase.from("hub_contacts").select(CONTACT_FIELDS).eq("is_deleted", false);
        if (id) q = q.eq("id", id);
        else if (phone) q = q.eq("phone_e164", phone);
        else q = q.eq("email", email);

        const { data: contact, error } = await q.maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        if (!contact) return json({ ok: false, error: "not_found" }, 404);

        return json({ ok: true, contact });
      }

      // ---------------------------------------------------------------
      case "update_contact": {
        const id = body?.id ? String(body.id) : null;
        if (!id) return json({ ok: false, error: "id_required" }, 400);

        // Explicit allow-list — only these fields can ever be changed via MCP,
        // and only when provided. Never blanks a field the caller omitted.
        const patch: Record<string, unknown> = {};
        if (typeof body?.full_name === "string") patch.full_name = body.full_name.trim();
        if (typeof body?.first_name === "string") patch.first_name = body.first_name.trim();
        if (typeof body?.last_name === "string") patch.last_name = body.last_name.trim();
        if (typeof body?.email === "string") patch.email = body.email.trim().toLowerCase();
        if (typeof body?.lead_type === "string") patch.lead_type = body.lead_type;
        if (typeof body?.temperature === "string") patch.temperature = body.temperature;
        if (Array.isArray(body?.tags)) patch.tags = body.tags;
        if (typeof body?.consent_whatsapp === "boolean") patch.consent_whatsapp = body.consent_whatsapp;
        if (typeof body?.consent_email === "boolean") patch.consent_email = body.consent_email;
        if (typeof body?.consent_sms === "boolean") patch.consent_sms = body.consent_sms;
        if (Array.isArray(body?.unsubscribed_channels)) patch.unsubscribed_channels = body.unsubscribed_channels;

        if (Object.keys(patch).length === 0) {
          return json({ ok: false, error: "no_updatable_fields_provided" }, 400);
        }
        patch.updated_at = new Date().toISOString();

        const { data: existing, error: fetchErr } = await supabase
          .from("hub_contacts").select("version").eq("id", id).eq("is_deleted", false).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);
        patch.version = (existing.version ?? 1) + 1;

        const { data: updated, error } = await supabase
          .from("hub_contacts").update(patch).eq("id", id).select(CONTACT_FIELDS).maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, contact: updated });
      }

      // ---------------------------------------------------------------
      // Strictly additive — appends a timestamped line to the existing
      // notes field rather than overwriting it. There is no separate
      // contact_activities table for hub_contacts in this schema, so the
      // append happens directly on the notes column.
      case "add_contact_note": {
        const id = body?.id ? String(body.id) : null;
        const note = body?.note ? String(body.note).trim() : "";
        if (!id) return json({ ok: false, error: "id_required" }, 400);
        if (!note) return json({ ok: false, error: "note_required" }, 400);

        const { data: existing, error: fetchErr } = await supabase
          .from("hub_contacts").select("notes, version").eq("id", id).eq("is_deleted", false).maybeSingle();
        if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
        if (!existing) return json({ ok: false, error: "not_found" }, 404);

        const stamp = new Date().toISOString();
        const appended = [existing.notes, `[${stamp}] ${note}`].filter(Boolean).join("\n");

        const { data: updated, error } = await supabase
          .from("hub_contacts")
          .update({ notes: appended, version: (existing.version ?? 1) + 1, updated_at: stamp })
          .eq("id", id)
          .select(CONTACT_FIELDS)
          .maybeSingle();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, contact: updated });
      }

      default:
        return json({ ok: false, error: `unknown_action:${action}` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
