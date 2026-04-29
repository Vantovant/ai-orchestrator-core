// Vanto OS — Idempotency Verifier (verify-only)
// Phase 1 Step 2. Checks 32-char SHA-256 key format & duplicate against vos_signed_inbox.
// Read-only against DB. Does NOT insert, dispatch, publish, or consume.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KEY_REGEX = /^[a-f0-9]{32}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { idempotency_key } = await req.json();

    const checks = {
      key_present: !!idempotency_key,
      key_format_valid: false,
      duplicate_found: false,
    };

    if (!idempotency_key || typeof idempotency_key !== "string") {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing_idempotency_key", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    checks.key_format_valid = KEY_REGEX.test(idempotency_key);
    if (!checks.key_format_valid) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "invalid_key_format",
          expected: "32 lowercase hex chars (truncated SHA-256)",
          checks,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Read-only duplicate check
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabase
      .from("vos_signed_inbox")
      .select("id, source_app, event_name, processing_state, received_at")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, reason: "db_lookup_error", error: error.message, checks }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    checks.duplicate_found = !!data;

    return new Response(
      JSON.stringify({
        ok: !checks.duplicate_found,
        deduped: checks.duplicate_found,
        existing: data ?? null,
        checks,
        notice: "Phase 1 verifier. Read-only. No insert. No dispatch.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, reason: "exception", error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
