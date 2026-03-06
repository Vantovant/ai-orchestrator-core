import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token",
};

const APP_URL = "https://vantoos-ai-core.lovable.app";

async function resolveUser(req: Request): Promise<string> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const extToken = req.headers.get("x-extension-token");
  if (extToken) {
    const tokenHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(extToken)))
    ).map(b => b.toString(16).padStart(2, "0")).join("");
    const { data } = await sb
      .from("extension_tokens").select("user_id")
      .eq("token_hash", tokenHash).is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (data) return data.user_id;
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await uc.auth.getUser();
    if (user && !error) return user.id;
  }
  throw new Error("Unauthorized");
}

async function hashString(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new Error("POST only");

    const userId = await resolveUser(req);
    const {
      chat_key, chat_title, transcript_text, ai_summary, ai_evidence,
      extracted_actions_count, message_count, project_id,
    } = await req.json();

    if (!chat_key) throw new Error("chat_key required");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const today = new Date().toISOString().split("T")[0];
    const noteTitle = `WhatsApp — ${chat_title || "Chat"} — ${today}`;

    // Build note body as structured markdown
    const sections = [
      `# ${noteTitle}\n`,
      `## Transcript\n\`\`\`\n${(transcript_text || "").slice(0, 4000)}\n\`\`\`\n`,
    ];

    if (ai_summary) {
      sections.push(`## AI Summary\n${ai_summary}\n`);
    }

    if (ai_evidence && ai_evidence.length > 0) {
      sections.push(`## Evidence\n${ai_evidence.map((e: any) =>
        `- **${e.claim}**: "${e.quote}" _(${e.source || "transcript"})_`
      ).join("\n")}\n`);
    }

    sections.push(`\n---\n_Source: WhatsApp Smart Extract · ${message_count || 0} messages · ${extracted_actions_count || 0} actions_`);

    const noteBody = sections.join("\n");

    // Save as a notes_daily entry for today
    // Dedupe by chat_key + date
    const dedupeKey = await hashString(`${userId}|whatsapp|${chat_key}|${today}`);

    // Check if note already exists for this chat+date
    const { data: existingNote } = await sb
      .from("notes_daily")
      .select("id, content")
      .eq("user_id", userId)
      .eq("note_date", today)
      .is("deleted_at", null)
      .maybeSingle();

    let noteId: string;
    let noteAction: "created" | "merged" = "created";

    if (existingNote) {
      // Append to existing note
      const separator = "\n\n---\n\n";
      const existingContent = existingNote.content || "";
      // Check if this chat was already captured today
      if (existingContent.includes(`WhatsApp — ${chat_title || "Chat"} — ${today}`)) {
        noteId = existingNote.id;
        noteAction = "merged";
      } else {
        const updatedContent = existingContent + separator + noteBody;
        await sb.from("notes_daily").update({ content: updatedContent }).eq("id", existingNote.id);
        noteId = existingNote.id;
        noteAction = "merged";
      }
    } else {
      const { data: newNote, error } = await sb
        .from("notes_daily")
        .insert({
          user_id: userId,
          note_date: today,
          content: noteBody,
        })
        .select("id")
        .single();
      if (error) throw error;
      noteId = newNote.id;
    }

    // Deep link to Plan page
    const deepLinkUrl = project_id
      ? `${APP_URL}/projects/${project_id}`
      : `${APP_URL}/plan`;

    return new Response(JSON.stringify({
      action: noteAction,
      note_id: noteId,
      note_date: today,
      deep_link_url: deepLinkUrl,
      plan_url: project_id ? `${APP_URL}/projects/${project_id}` : `${APP_URL}/plan`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Unauthorized" ? 401 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
