import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SNAPSHOT_CAP = 3000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? serviceKey;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { project_id, solution_type } = await req.json();
    if (!project_id) throw new Error("project_id required");

    // Gather snapshot data
    const [projectRes, tasksRes, bcRes, fmRes, fpRes, milestonesRes] = await Promise.all([
      supabase.from("projects").select("name, status, health, solution_type").eq("id", project_id).single(),
      supabase.from("tasks").select("id, title, status, priority, due_date")
        .eq("project_id", project_id).is("deleted_at", null)
        .in("status", ["pending", "in_progress", "todo"]).limit(10),
      supabase.from("business_cases").select("problem, customer, offer, model").eq("project_id", project_id).is("deleted_at", null).maybeSingle(),
      supabase.from("financial_models").select("funding_target_amount, runway_months, startup_costs_json, monthly_costs_json, pricing_json")
        .eq("project_id", project_id).is("deleted_at", null).maybeSingle(),
      supabase.from("funding_packs").select("ask_amount, use_of_funds_json, status")
        .eq("project_id", project_id).is("deleted_at", null).maybeSingle(),
      supabase.from("project_milestones").select("title, due_date, status")
        .eq("project_id", project_id).is("deleted_at", null).order("due_date", { ascending: true }).limit(5),
    ]);

    const snapshot: any = {
      project: projectRes.data,
      openTasks: tasksRes.data ?? [],
      solutionType: solution_type || projectRes.data?.solution_type || "standard",
    };

    if (snapshot.solutionType === "funded_business") {
      snapshot.businessCase = bcRes.data ? {
        hasP: !!bcRes.data.problem, hasC: !!bcRes.data.customer,
        hasO: !!bcRes.data.offer, hasM: !!bcRes.data.model,
      } : null;
      snapshot.financial = fmRes.data ? {
        target: fmRes.data.funding_target_amount, runway: fmRes.data.runway_months,
        hasStartup: Array.isArray(fmRes.data.startup_costs_json) && fmRes.data.startup_costs_json.length > 0,
        hasMonthly: Array.isArray(fmRes.data.monthly_costs_json) && fmRes.data.monthly_costs_json.length > 0,
        hasPricing: Array.isArray(fmRes.data.pricing_json) && fmRes.data.pricing_json.length > 0,
      } : null;
      snapshot.fundingPack = fpRes.data ? { ask: fpRes.data.ask_amount, hasFunds: Array.isArray(fpRes.data.use_of_funds_json) && fpRes.data.use_of_funds_json.length > 0, status: fpRes.data.status } : null;
    }

    if (snapshot.solutionType === "tender") {
      const tenderRes = await supabase.from("tenders").select("entity, ref_no, closing_at, status")
        .eq("project_id", project_id).is("deleted_at", null).maybeSingle();
      const tenderId = tenderRes.data ? (await supabase.from("tenders").select("id").eq("project_id", project_id).is("deleted_at", null).maybeSingle()).data?.id : null;
      snapshot.tender = tenderRes.data;
      if (tenderId) {
        const [reqsRes, compRes] = await Promise.all([
          supabase.from("tender_requirements").select("mandatory, status").eq("tender_id", tenderId).is("deleted_at", null),
          supabase.from("tender_compliance_items").select("required, status").eq("tender_id", tenderId).is("deleted_at", null),
        ]);
        const mandReqs = (reqsRes.data ?? []).filter((r: any) => r.mandatory);
        const metReqs = mandReqs.filter((r: any) => r.status === "met");
        const reqDocs = (compRes.data ?? []).filter((c: any) => c.required);
        const uploadedDocs = reqDocs.filter((c: any) => c.status === "uploaded");
        snapshot.bidReadiness = {
          reqsMet: metReqs.length, reqsTotal: mandReqs.length,
          docsMet: uploadedDocs.length, docsTotal: reqDocs.length,
        };
      }
    }

    snapshot.milestones = (milestonesRes.data ?? []).slice(0, 3);

    // Truncate snapshot
    let snapshotStr = JSON.stringify(snapshot);
    const wasTruncated = snapshotStr.length > SNAPSHOT_CAP;
    if (wasTruncated) snapshotStr = snapshotStr.slice(0, SNAPSHOT_CAP);

    // Call AI gateway
    const systemPrompt = `You are a Senior Business Mentor for a ${snapshot.solutionType === "funded_business" ? "Funded Business" : snapshot.solutionType === "tender" ? "Government Tender" : "Standard"} project.
Based on the project snapshot, provide EXACTLY this JSON structure:
{
  "top3": [{"title": "action title", "reason": "why this matters"}],
  "blocker": {"issue": "...", "resolution": "..."} or null,
  "nextMilestone": {"title": "...", "dueDate": "YYYY-MM-DD"} or null,
  "readinessDriver": "One sentence: what single thing will most move the readiness score up"
}
Rules:
- top3 must have exactly 3 items — the highest-leverage actions TODAY
- Be specific and actionable, not generic
- For funding sources, only cite verified programs; otherwise say NEEDS_VERIFICATION
- Keep total response under 500 tokens`;

    const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader ?? "",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Project snapshot:\n${snapshotStr}` },
        ],
        calling_function: "solution-mentor",
        response_format: "json",
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "BYOK_REQUIRED" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiRes.status} ${errBody}`);
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content || aiData?.content || aiData?.text || "";

    // Log to assistant_runs
    const svc = createClient(supabaseUrl, serviceKey);
    await svc.from("assistant_runs").insert({
      user_id: user.id,
      snapshot_json: { project_id, solution_type: snapshot.solutionType, snapshot_len: snapshotStr.length, was_truncated: wasTruncated },
      result_json: { source: "solution-mentor", used_provider: aiData?.used_provider || "unknown" },
    });

    // Parse AI response
    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { top3: [], blocker: null, nextMilestone: null, readinessDriver: "Unable to parse mentor response" };
    } catch {
      parsed = { top3: [], blocker: null, nextMilestone: null, readinessDriver: content.slice(0, 200) };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("solution-mentor error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
