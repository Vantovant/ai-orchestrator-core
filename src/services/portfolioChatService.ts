import { supabase } from "@/integrations/supabase/client";

export interface PortfolioThread {
  id: string;
  user_id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface PortfolioMessage {
  id: string;
  thread_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments_json: any[];
  context_tags_json: string[];
  retrieval_meta_json: any | null;
  created_at: string;
}

export interface BriefingPreferences {
  id: string;
  user_id: string;
  weekly_enabled: boolean;
  delivery_channel: string;
  weekday: number;
  send_hour: number;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface ScoreHistory {
  id: string;
  user_id: string;
  project_id: string;
  momentum_score: number;
  risk_level: string;
  sell_readiness_score: number;
  captured_at: string;
}

export const portfolioChatService = {
  // === Threads ===
  async listThreads(): Promise<PortfolioThread[]> {
    const { data } = await supabase
      .from("portfolio_partner_threads" as any)
      .select("*")
      .eq("archived", false)
      .order("pinned", { ascending: false })
      .order("last_message_at", { ascending: false })
      .limit(50);
    return (data as any) ?? [];
  },

  async createThread(title?: string): Promise<PortfolioThread> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("portfolio_partner_threads" as any)
      .insert({ user_id: user.id, title: title || "New Conversation" } as any)
      .select()
      .single();
    if (error) throw error;
    return data as any;
  },

  async updateThread(id: string, fields: Partial<Pick<PortfolioThread, "title" | "pinned" | "archived">>): Promise<void> {
    await supabase
      .from("portfolio_partner_threads" as any)
      .update(fields as any)
      .eq("id", id);
  },

  async archiveThread(id: string): Promise<void> {
    await supabase
      .from("portfolio_partner_threads" as any)
      .update({ archived: true } as any)
      .eq("id", id);
  },

  // === Messages ===
  async listMessages(threadId: string): Promise<PortfolioMessage[]> {
    const { data } = await supabase
      .from("portfolio_partner_messages" as any)
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(200);
    return (data as any) ?? [];
  },

  async addMessage(
    threadId: string,
    role: string,
    content: string,
    contextTags: string[] = [],
    retrievalMeta?: any
  ): Promise<PortfolioMessage> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("portfolio_partner_messages" as any)
      .insert({
        thread_id: threadId,
        user_id: user.id,
        role,
        content,
        context_tags_json: contextTags,
        retrieval_meta_json: retrievalMeta || null,
        attachments_json: [],
      } as any)
      .select()
      .single();
    if (error) throw error;

    // Update thread last_message_at
    await supabase
      .from("portfolio_partner_threads" as any)
      .update({ last_message_at: new Date().toISOString() } as any)
      .eq("id", threadId);

    return data as any;
  },

  // === Briefing Preferences ===
  async getBriefingPrefs(): Promise<BriefingPreferences | null> {
    const { data } = await supabase
      .from("partner_briefing_preferences" as any)
      .select("*")
      .maybeSingle();
    return data as any;
  },

  async upsertBriefingPrefs(fields: Partial<BriefingPreferences>): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("partner_briefing_preferences" as any)
      .upsert({ ...fields, user_id: user.id } as any, { onConflict: "user_id" });
  },

  // === Score History ===
  async getScoreHistory(projectId: string, limit = 20): Promise<ScoreHistory[]> {
    const { data } = await supabase
      .from("project_partner_score_history" as any)
      .select("*")
      .eq("project_id", projectId)
      .order("captured_at", { ascending: true })
      .limit(limit);
    return (data as any) ?? [];
  },

  async getAllScoreHistory(limit = 100): Promise<ScoreHistory[]> {
    const { data } = await supabase
      .from("project_partner_score_history" as any)
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(limit);
    return (data as any) ?? [];
  },

  // === SSE Chat ===
  async sendChatSSE(
    threadId: string,
    prompt: string,
    contextTags: string[],
    history: { role: string; content: string }[],
    onChunk: (text: string) => void,
    onDone: (fullText: string, retrievalMeta?: any) => void,
    onError: (err: string) => void,
  ): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { onError("Not authenticated"); return; }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portfolio-ai-partner`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          mode: "chat",
          thread_id: threadId,
          prompt,
          context_tags: contextTags,
          history: history.slice(-20),
          stream: true,
          tz_offset: new Date().getTimezoneOffset(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        onError(errData.error || `Error ${res.status}`);
        return;
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        const reader = res.body?.getReader();
        if (!reader) { onError("No stream reader"); return; }
        const decoder = new TextDecoder();
        let fullText = "";
        let retrievalMeta: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const payload = line.slice(6);
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                if (parsed.type === "text") {
                  fullText += parsed.content;
                  onChunk(fullText);
                } else if (parsed.type === "retrieval_meta") {
                  retrievalMeta = parsed.data;
                } else if (parsed.type === "error") {
                  onError(parsed.message);
                  return;
                }
              } catch {}
            }
          }
        }
        onDone(fullText, retrievalMeta);
      } else {
        // Fallback: JSON response
        const data = await res.json();
        if (data.error) { onError(data.error); return; }
        const text = data.result?.content || data.result?.summary || JSON.stringify(data.result);
        onDone(text, data.result?.retrieval_meta);
      }
    } catch (e: any) {
      onError(e.message || "Network error");
    }
  },
};
