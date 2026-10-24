// Recompute stops/legs for one of the caller's trips (e.g. after assigning
// unassigned points or a late batch). Ownership is checked with the caller's
// JWT under RLS before the service-role recompute runs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { processTrip } from "../_shared/location-process.ts";

const headers = { ...corsHeaders, "Content-Type": "application/json" };
const reply = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return reply({ ok: false, error: "unauthorized" }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error } = await userClient.auth.getClaims(authHeader.slice(7));
  if (error || !claims?.claims?.sub) return reply({ ok: false, error: "unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  const parsed = z.object({ trip_id: z.string().uuid() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return reply({ ok: false, error: "trip_id_required" }, 400);

  const { data: trip } = await userClient.from("trips").select("id")
    .eq("id", parsed.data.trip_id).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (!trip) return reply({ ok: false, error: "not_found" }, 404);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const res = await processTrip(admin, userId, trip.id);
  return reply(res, res.ok ? 200 : 500);
});
