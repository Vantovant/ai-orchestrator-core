import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token",
};

const APP_URL = Deno.env.get("APP_URL") || "https://vantoos-ai-core.lovable.app";
const SNAPSHOT_MAX_CHARS = 8000;

// PII patterns (SA-focused)
const PII_PATTERNS: Record<string, RegExp> = {
  sa_id: /\b\d{13}\b/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone_intl: /\+27\s?\d[\d\s-]{7,12}/g,
  phone_local: /\b0[1-9]\d[\d\s-]{7,10}\b/g,
};

function redactPII(text: string): { redacted: string; hadPII: boolean } {
  let result = text;
  let hadPII = false;
  for (const [, pattern] of Object.entries(PII_PATTERNS)) {
    const re = new RegExp(pattern.source, pattern.flags);
    if (re.test(result)) {
      hadPII = true;
      result = result.replace(new RegExp(pattern.source, pattern.flags), "[REDACTED]");
    }
  }
  return { redacted: result, hadPII };
}

function truncateSnapshot(snapshot: any): { truncated: any; wasTruncated: boolean } {
  let totalChars = 0;
  const count = (s: string) => { totalChars += (s || "").length; };

  count(snapshot.title || "");
  count(snapshot.metaDescription || "");
  count(snapshot.selectedText || "");
  (snapshot.headings || []).forEach((h: string) => count(h));
  (snapshot.textBlocks || []).forEach((t: string) => count(t));

  if (totalChars <= SNAPSHOT_MAX_CHARS) return { truncated: snapshot, wasTruncated: false };

  const trimmed = { ...snapshot };
  if (trimmed.textBlocks) {
    while (totalChars > SNAPSHOT_MAX_CHARS && trimmed.textBlocks.length > 1) {
      const removed = trimmed.textBlocks.pop();
      totalChars -= (removed || "").length;
    }
  }
  if (trimmed.tables && totalChars > SNAPSHOT_MAX_CHARS) {
    trimmed.tables = trimmed.tables.slice(0, 1);
  }
  if (trimmed.headings && totalChars > SNAPSHOT_MAX_CHARS) {
    trimmed.headings = trimmed.headings.slice(0, 10);
  }
  return { truncated: trimmed, wasTruncated: true };
}

async function hashString(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function resolveUser(req: Request): Promise<{ userId: string }> {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const extToken = req.headers.get("x-extension-token");
  if (extToken) {
    const tokenHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extToken)))
    ).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data } = await supabaseAdmin
      .from("extension_tokens")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (data) return { userId: data.user_id };
    throw new Error("Unauthorized");
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await supabaseUser.auth.getUser();
    if (user && !error) return { userId: user.id };
  }

  throw new Error("Unauthorized");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const { userId } = await resolveUser(req);
    const { url, title, snapshot, project_id, metadata } = await req.json();

    if (!url || !snapshot) throw new Error("url and snapshot required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Domain check
    const domain = new URL(url).hostname;
    const { data: allowedDomain } = await supabaseAdmin
      .from("user_allowed_domains")
      .select("id")
      .eq("user_id", userId)
      .eq("domain", domain)
      .eq("enabled", true)
      .maybeSingle();

    if (!allowedDomain) {
      return new Response(JSON.stringify({ error: "Domain not in allowlist", domain }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check BYOK keys
    const { data: keyData } = await supabaseAdmin
      .from("user_ai_keys")
      .select("use_own_keys, openai_key_encrypted, gemini_key_encrypted")
      .eq("user_id", userId)
      .maybeSingle();

    const hasKey = keyData?.use_own_keys && (keyData.openai_key_encrypted || keyData.gemini_key_encrypted);

    // Check Beta Assist eligibility if no BYOK
    let isBetaAssist = false;
    let betaRemaining = 0;
    if (!hasKey) {
      const { data: betaData } = await supabaseAdmin
        .from("beta_testers")
        .select("is_active, assisted_ai_remaining, assisted_ai_expires_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (betaData?.is_active && betaData.assisted_ai_remaining > 0) {
        const notExpired = !betaData.assisted_ai_expires_at || new Date(betaData.assisted_ai_expires_at) > new Date();
        if (notExpired) {
          isBetaAssist = true;
          betaRemaining = betaData.assisted_ai_remaining;
        }
      }

      if (!isBetaAssist) {
        return new Response(JSON.stringify({
          error: "ai_keys_missing",
          message: "To guarantee data sovereignty, connect your personal OpenAI or Gemini key in Settings → AI Keys.",
          ai_status: "blocked",
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Redact PII from snapshot text fields
    let redactionToast = false;
    const redactField = (val: string | undefined | null): string => {
      if (!val) return "";
      const { redacted, hadPII } = redactPII(val);
      if (hadPII) redactionToast = true;
      return redacted;
    };

    const cleanSnapshot = {
      ...snapshot,
      selectedText: redactField(snapshot.selectedText),
      metaDescription: redactField(snapshot.metaDescription),
      textBlocks: (snapshot.textBlocks || []).map((t: string) => redactField(t)),
      headings: (snapshot.headings || []).map((h: string) => redactField(h)),
    };

    // Truncate
    const { truncated, wasTruncated } = truncateSnapshot(cleanSnapshot);

    // Build AI prompt
    const snapshotText = [
      `URL: ${url}`,
      `Title: ${title || ""}`,
      truncated.metaDescription ? `Description: ${truncated.metaDescription}` : "",
      truncated.selectedText ? `Selected text: ${truncated.selectedText}` : "",
      truncated.headings?.length ? `Headings:\n${truncated.headings.join("\n")}` : "",
      truncated.textBlocks?.length ? `Content:\n${truncated.textBlocks.join("\n\n")}` : "",
      truncated.tables?.length ? `Tables:\n${JSON.stringify(truncated.tables).slice(0, 2000)}` : "",
      truncated.entities?.length ? `Detected entities: ${JSON.stringify(truncated.entities).slice(0, 500)}` : "",
    ].filter(Boolean).join("\n\n");

    // Call AI gateway
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        calling_function: "smart-capture-web",
        workspace_type: "private",
        beta_assist_mode: isBetaAssist,
        beta_user_id: isBetaAssist ? userId : undefined,
        messages: [
          {
            role: "system",
            content: `You are a smart web capture assistant for VantoOS (executive OS for South African entrepreneurs). Analyze the captured web page and return structured insights. Be concise and actionable.

CRITICAL: Every claim in your summary MUST be backed by a direct quote from the page content. If you cannot find a supporting quote, do NOT make the claim. Set needs_verification=true and provide only what is directly evidenced.`,
          },
          {
            role: "user",
            content: `Analyze this captured web page and extract:\n1. A 2-3 sentence summary (each statement must reference specific page content)\n2. Evidence quotes backing each summary statement\n3. Any actionable tasks (max 5)\n4. If I have projects, suggest which project this relates to\n\nPage data:\n${snapshotText.slice(0, 3000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "smart_capture_result",
              description: "Return structured smart capture analysis with evidence",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "2-3 sentence summary of the page, each statement backed by evidence" },
                  evidence: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        claim: { type: "string", description: "A specific claim from the summary" },
                        quote: { type: "string", description: "Direct quote from the page content supporting this claim" },
                        source: { type: "string", description: "Where on the page (heading, paragraph, etc)" },
                      },
                      required: ["claim", "quote"],
                    },
                    description: "Evidence backing each summary claim",
                  },
                  extracted_actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                        category: { type: "string" },
                      },
                      required: ["title", "priority"],
                    },
                    description: "Actionable tasks extracted from the page (max 5)",
                  },
                  suggested_project_name: { type: "string", description: "Name of project this might relate to, or empty" },
                  confidence: { type: "number", description: "0-1 confidence in suggestion" },
                  needs_verification: { type: "boolean", description: "Whether info needs human verification (true if any claim lacks direct evidence)" },
                  verification_reasons: {
                    type: "array",
                    items: { type: "string" },
                    description: "Why verification is needed",
                  },
                },
                required: ["summary", "evidence", "extracted_actions", "needs_verification"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "smart_capture_result" } },
      }),
    });

    const aiData = await aiResponse.json();

    let aiResult: any = null;
    if (aiData.result && typeof aiData.result === "object") {
      aiResult = aiData.result;
    } else if (typeof aiData.result === "string") {
      try { aiResult = JSON.parse(aiData.result); } catch { /* fallback */ }
    }

    // Graceful degradation: if AI failed, still save the capture
    const aiProviderFailed = !aiResult || aiData.ai_status === "error" || aiData.all_providers_failed;
    if (!aiResult) {
      aiResult = {
        summary: `Captured page: ${title || url}`,
        extracted_actions: [],
        needs_verification: true,
        verification_reasons: ["AI analysis unavailable — basic context captured"],
      };
    }

    // Try to match suggested project
    let suggestedProjectId: string | null = null;
    if (aiResult.suggested_project_name && !project_id) {
      const { data: projects } = await supabaseAdmin
        .from("projects")
        .select("id, name")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .ilike("name", `%${aiResult.suggested_project_name}%`)
        .limit(1);
      if (projects?.length) suggestedProjectId = projects[0].id;
    }

    // Save source_context (dedupe)
    const normalizedText = (snapshot.selectedText || "").toLowerCase().replace(/\s+/g, " ").trim();
    const dedupeInput = `${userId}|${project_id || ""}|${url}|${normalizedText}`;
    const dedupeKey = await hashString(dedupeInput);

    const { data: existing } = await supabaseAdmin
      .from("source_context")
      .select("id")
      .eq("user_id", userId)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    let sourceContextId: string;
    let action: "created" | "merged" = "created";

    if (existing) {
      sourceContextId = existing.id;
      action = "merged";
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("source_context")
        .insert({
          user_id: userId,
          source_url: url,
          source_title: title || null,
          domain,
          snippet_text: aiResult.summary || null,
          metadata_json: { ...metadata, smart_capture: true, ai_summary: aiResult.summary },
          dedupe_key: dedupeKey,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      sourceContextId = inserted.id;
    }

    // Save inbox item if project_id
    let inboxItemId: string | null = null;
    const effectiveProjectId = project_id || suggestedProjectId;

    if (effectiveProjectId) {
      const { data: existingInbox } = await supabaseAdmin
        .from("project_inbox_items")
        .select("id")
        .eq("user_id", userId)
        .eq("project_id", effectiveProjectId)
        .eq("source_context_id", sourceContextId)
        .is("deleted_at", null)
        .maybeSingle();

      if (existingInbox) {
        inboxItemId = existingInbox.id;
        await supabaseAdmin
          .from("project_inbox_items")
          .update({ title: title || url, body: aiResult.summary || null })
          .eq("id", existingInbox.id);
      } else {
        const { data: inbox, error: inboxErr } = await supabaseAdmin
          .from("project_inbox_items")
          .insert({
            user_id: userId,
            project_id: effectiveProjectId,
            title: title || url,
            body: aiResult.summary || null,
            source_context_id: sourceContextId,
          })
          .select("id")
          .single();
        if (inboxErr) throw inboxErr;
        inboxItemId = inbox!.id;
      }
    }

    const deepLinkUrl = effectiveProjectId
      ? `${APP_URL}/projects?id=${effectiveProjectId}&tab=inbox${inboxItemId ? `&highlight=${inboxItemId}` : ""}`
      : `${APP_URL}/projects`;

    const recommendedDestination = effectiveProjectId
      ? "project_inbox"
      : aiResult.extracted_actions?.length
        ? "ask_user"
        : "tasks_only";

    return new Response(JSON.stringify({
      action,
      source_context_id: sourceContextId,
      inbox_item_id: inboxItemId,
      project_id: effectiveProjectId || null,
      suggested_project_id: suggestedProjectId,
      deep_link_url: deepLinkUrl,
      summary: aiResult.summary,
      extracted_actions: aiResult.extracted_actions || [],
      needs_verification: aiResult.needs_verification ?? true,
      verification_reasons: aiResult.verification_reasons || [],
      recommended_destination: recommendedDestination,
      redaction_toast: redactionToast,
      ai_status: aiData.ai_status || "ok",
      provider_used: aiData.provider_used || "unknown",
      mode: aiData.mode || "byok",
      assisted_remaining: aiData.assisted_remaining,
      ai_provider_failed: aiProviderFailed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Unauthorized" ? 401 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
