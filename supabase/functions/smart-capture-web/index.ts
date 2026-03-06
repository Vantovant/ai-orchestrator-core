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

async function resolveUser(req: Request): Promise<{ userId: string; isExtensionAuth: boolean }> {
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

    if (data) return { userId: data.user_id, isExtensionAuth: true };
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
    if (user && !error) return { userId: user.id, isExtensionAuth: false };
  }

  throw new Error("Unauthorized");
}

/**
 * Robust tool-output parser: tries multiple shapes that ai providers may return.
 */
function extractToolArgs(aiData: any): any {
  // 1) aiData.result is already a parsed object with summary
  if (aiData.result && typeof aiData.result === "object" && aiData.result.summary) {
    return aiData.result;
  }
  // 2) aiData.result is a JSON string
  if (typeof aiData.result === "string") {
    try { const parsed = JSON.parse(aiData.result); if (parsed.summary) return parsed; } catch { /* continue */ }
  }
  // 3) aiData.tool_calls[0].function.arguments
  try {
    const args = aiData.tool_calls?.[0]?.function?.arguments;
    if (args) { const parsed = typeof args === "string" ? JSON.parse(args) : args; if (parsed.summary) return parsed; }
  } catch { /* continue */ }
  // 4) aiData.choices[0].message.tool_calls[0].function.arguments
  try {
    const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (args) { const parsed = typeof args === "string" ? JSON.parse(args) : args; if (parsed.summary) return parsed; }
  } catch { /* continue */ }
  // 5) aiData.message.tool_calls[0].function.arguments
  try {
    const args = aiData.message?.tool_calls?.[0]?.function?.arguments;
    if (args) { const parsed = typeof args === "string" ? JSON.parse(args) : args; if (parsed.summary) return parsed; }
  } catch { /* continue */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const originalAuthHeader = req.headers.get("Authorization") ?? "";
    const { userId, isExtensionAuth } = await resolveUser(req);
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

    const systemPrompt = `You are a smart web capture assistant for VantoOS (executive OS for South African entrepreneurs). Analyze the captured web page and return structured insights. Be concise and actionable.

CRITICAL: Every claim in your summary MUST be backed by a direct quote from the page content. If you cannot find a supporting quote, do NOT make the claim. Set needs_verification=true and provide only what is directly evidenced.`;

    const userPrompt = `Analyze this captured web page and extract:\n1. A 2-3 sentence summary (each statement must reference specific page content)\n2. Evidence quotes backing each summary statement\n3. Any actionable tasks (max 5)\n4. If I have projects, suggest which project this relates to\n\nPage data:\n${snapshotText.slice(0, 3000)}`;

    const toolDef = {
      type: "function" as const,
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
    };

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    // ── AI Call: Extension-token path (direct provider) vs JWT path (ai-gateway) ──
    let aiResult: any = null;
    let providerUsed = "unknown";
    let aiMode = "byok";
    let assistedRemaining: number | undefined;
    let aiProviderFailed = false;

    if (isExtensionAuth) {
      // Extension auth: call providers directly (same pattern as smart-capture-whatsapp)
      const openaiKey = keyData?.use_own_keys ? keyData?.openai_key_encrypted : null;
      const geminiKey = keyData?.use_own_keys ? keyData?.gemini_key_encrypted : null;

      if (!openaiKey && !geminiKey && !isBetaAssist) {
        return new Response(JSON.stringify({
          error: "ai_keys_missing",
          message: "Connect your personal OpenAI or Gemini key in Settings → AI Keys.",
          ai_status: "blocked",
        }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let providerUrl: string;
      let providerHeaders: Record<string, string>;

      const requestBody: any = {
        model: geminiKey ? "gemini-2.5-flash" : "gpt-4o-mini",
        messages,
        tools: [toolDef],
        tool_choice: { type: "function", function: { name: "smart_capture_result" } },
      };

      if (geminiKey) {
        providerUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
        providerHeaders = { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" };
        providerUsed = "gemini";
      } else if (openaiKey) {
        providerUrl = "https://api.openai.com/v1/chat/completions";
        providerHeaders = { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" };
        providerUsed = "openai";
      } else {
        // Beta assist — would need Lovable AI. For now, graceful degrade.
        aiProviderFailed = true;
        providerUrl = "";
        providerHeaders = {};
        providerUsed = "none";
      }

      if (!aiProviderFailed && providerUrl) {
        const directRes = await fetch(providerUrl, {
          method: "POST",
          headers: providerHeaders,
          body: JSON.stringify(requestBody),
        });

        if (!directRes.ok) {
          const errBody = await directRes.text();
          console.error(`[smart-capture-web] Direct ${providerUsed} failed: ${directRes.status}`, errBody.slice(0, 300));
          // Graceful degradation: still save the capture
          aiProviderFailed = true;
        } else {
          const directData = await directRes.json();
          const toolCall = directData?.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            try { aiResult = JSON.parse(toolCall.function.arguments); } catch { /* continue */ }
          }
          if (!aiResult) aiResult = extractToolArgs(directData);
        }
      }
    } else {
      // Standard JWT auth path: forward to ai-gateway
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: originalAuthHeader,
        },
        body: JSON.stringify({
          calling_function: "smart-capture-web",
          workspace_type: "private",
          beta_assist_mode: isBetaAssist,
          beta_user_id: isBetaAssist ? userId : undefined,
          messages,
          tools: [toolDef],
          tool_choice: { type: "function", function: { name: "smart_capture_result" } },
        }),
      });

      const aiData = await aiResponse.json();

      if (aiResponse.ok) {
        aiResult = extractToolArgs(aiData);
        providerUsed = aiData.provider_used || "unknown";
        aiMode = aiData.mode || "byok";
        assistedRemaining = aiData.assisted_remaining;
      } else {
        console.error("[smart-capture-web] ai-gateway failed:", aiResponse.status);
        aiProviderFailed = true;
      }
    }

    // Graceful degradation: if AI failed, still save the capture
    if (!aiResult) {
      aiProviderFailed = true;
      aiResult = {
        summary: `Captured page: ${title || url}`,
        extracted_actions: [],
        evidence: [],
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
      evidence: aiResult.evidence || [],
      extracted_actions: aiResult.extracted_actions || [],
      needs_verification: aiResult.needs_verification ?? true,
      verification_reasons: aiResult.verification_reasons || [],
      recommended_destination: recommendedDestination,
      redaction_toast: redactionToast,
      ai_status: aiProviderFailed ? "degraded" : "ok",
      provider_used: providerUsed,
      mode: aiMode,
      assisted_remaining: assistedRemaining,
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
