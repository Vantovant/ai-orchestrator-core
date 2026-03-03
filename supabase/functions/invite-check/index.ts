import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { action, token, user_id } = await req.json();

    if (action === "validate") {
      // Check if invite is valid
      const { data: invite, error } = await db
        .from("invites")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !invite) {
        return new Response(JSON.stringify({ valid: false, error: "Invalid invite code" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (invite.uses_count >= invite.max_uses) {
        return new Response(JSON.stringify({ valid: false, error: "Invite code has been fully used" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return new Response(JSON.stringify({ valid: false, error: "Invite code has expired" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ valid: true, label: invite.label, cohort: invite.cohort }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "redeem") {
      if (!user_id || !token) throw new Error("user_id and token required");

      const { data: invite, error } = await db
        .from("invites")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !invite) throw new Error("Invalid invite");
      if (invite.uses_count >= invite.max_uses) throw new Error("Invite fully used");
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Error("Invite expired");

      // Increment uses
      const newCount = invite.uses_count + 1;
      const updates: any = { uses_count: newCount, used_by: user_id, used_at: new Date().toISOString() };
      if (newCount >= invite.max_uses) updates.is_used = true;

      await db.from("invites").update(updates).eq("id", invite.id);

      // Assign 'user' role
      await db.from("user_roles").upsert({ user_id, role: "user" }, { onConflict: "user_id,role" });

      // Log activity
      await db.from("user_activity").insert({ user_id, action: "invite_redeemed", metadata: { token, cohort: invite.cohort } });

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
