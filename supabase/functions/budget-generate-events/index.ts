import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { from_date, to_date } = await req.json();
    if (!from_date || !to_date) return new Response(JSON.stringify({ error: "from_date and to_date required" }), { status: 400, headers: corsHeaders });

    // Fetch active budget items
    const { data: items, error: itemsErr } = await supabase
      .from("finance_budget_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null);

    if (itemsErr) throw itemsErr;

    const fromD = new Date(from_date);
    const toD = new Date(to_date);
    let created = 0;
    let skipped = 0;

    for (const item of (items || [])) {
      const occurrences: string[] = [];

      if (item.cadence === "monthly" && item.due_day_of_month) {
        // Generate for each month in range
        const cur = new Date(fromD);
        while (cur <= toD) {
          const y = cur.getFullYear();
          const m = cur.getMonth();
          const maxDay = new Date(y, m + 1, 0).getDate();
          const day = Math.min(item.due_day_of_month, maxDay);
          const dueDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          if (dueDate >= from_date && dueDate <= to_date) {
            occurrences.push(dueDate);
          }
          cur.setMonth(cur.getMonth() + 1);
        }
      } else if (item.cadence === "yearly" && item.due_day_of_month && item.due_month_of_year) {
        for (let y = fromD.getFullYear(); y <= toD.getFullYear(); y++) {
          const m = item.due_month_of_year - 1;
          const maxDay = new Date(y, m + 1, 0).getDate();
          const day = Math.min(item.due_day_of_month, maxDay);
          const dueDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          if (dueDate >= from_date && dueDate <= to_date) {
            occurrences.push(dueDate);
          }
        }
      } else if (item.cadence === "weekly" && item.due_day_of_month) {
        // due_day_of_month used as day of week (1=Mon, 7=Sun)
        const cur = new Date(fromD);
        while (cur <= toD) {
          const dow = cur.getDay() || 7; // convert 0->7
          if (dow === item.due_day_of_month) {
            const dueDate = cur.toISOString().slice(0, 10);
            if (dueDate >= from_date && dueDate <= to_date) {
              occurrences.push(dueDate);
            }
          }
          cur.setDate(cur.getDate() + 1);
        }
      } else if (item.cadence === "quarterly" && item.due_day_of_month) {
        const cur = new Date(fromD);
        while (cur <= toD) {
          const m = cur.getMonth();
          if (m % 3 === 0) { // Jan, Apr, Jul, Oct
            const y = cur.getFullYear();
            const maxDay = new Date(y, m + 1, 0).getDate();
            const day = Math.min(item.due_day_of_month, maxDay);
            const dueDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            if (dueDate >= from_date && dueDate <= to_date) {
              occurrences.push(dueDate);
            }
          }
          cur.setMonth(cur.getMonth() + 1);
        }
      } else if (item.cadence === "custom" && item.due_date_custom) {
        if (item.due_date_custom >= from_date && item.due_date_custom <= to_date) {
          occurrences.push(item.due_date_custom);
        }
      }

      // Upsert events (skip duplicates via unique constraint)
      for (const dueAt of occurrences) {
        const today = new Date().toISOString().slice(0, 10);
        const status = dueAt < today ? "overdue" : dueAt === today ? "due" : "upcoming";

        const { error: insertErr } = await supabase
          .from("finance_budget_events")
          .upsert(
            {
              user_id: user.id,
              budget_item_id: item.id,
              due_at: dueAt,
              amount: item.amount,
              status,
            },
            { onConflict: "budget_item_id,due_at", ignoreDuplicates: true }
          );

        if (insertErr) {
          if (insertErr.code === "23505") { skipped++; continue; }
          console.error("Insert error:", insertErr);
        } else {
          created++;
        }
      }
    }

    return new Response(JSON.stringify({ created, skipped, items_processed: (items || []).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
