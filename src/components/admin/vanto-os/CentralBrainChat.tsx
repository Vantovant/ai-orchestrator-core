import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brain, Send, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Summarise today's Central Brain activity.",
  "List the latest approval requests and their status.",
  "Have any kill-switches changed recently?",
  "What is the current state of Axis A and Axis B platform flags?",
  "Show recent CRM internal notes and any archives.",
  "Are there any pending dry-run actions or proposals?",
];

export default function CentralBrainChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: prompt }];
    setMessages(next);
    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke("portfolio-ai-partner", {
        body: {
          mode: "chat",
          prompt,
          context_tags: ["@central_brain"],
          history: next.slice(-20),
          stream: false,
          tz_offset: new Date().getTimezoneOffset(),
        },
      });

      if (error) throw error;
      const content = data?.result?.content ?? "No response.";
      setMessages([...next, { role: "assistant", content }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Central Brain query failed");
      setMessages([...next, { role: "assistant", content: "_Sorry — the Central Brain query failed. Please try again._" }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col h-[70vh]">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-primary" />
          Central Brain — AI Partner
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Shield className="h-3 w-3" /> Admin · Read-Only
          </Badge>
        </CardTitle>
        <CardDescription>
          Ask the AI Partner about anything happening inside the VantoOS Central Brain — Receipts,
          Approvals, Dry-Runs, Manual Actions, Integration Drafts, CRM Internal Notes, Kill-Switches,
          and Platform Flags. The Partner reads, never writes.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 p-3 min-h-0">
        <ScrollArea className="flex-1 pr-3" ref={scrollRef as any}>
          {messages.length === 0 ? (
            <div className="space-y-3 py-6">
              <p className="text-xs text-muted-foreground text-center">Try one of these:</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map(s => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    className="justify-start text-left h-auto py-2 text-xs whitespace-normal"
                    onClick={() => send(s)}
                    disabled={busy}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:my-2 prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Reading Central Brain…
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2 border-t pt-3">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about console activity, approvals, receipts, axis state…"
            className="resize-none text-sm min-h-[44px]"
            rows={1}
            disabled={busy}
          />
          <Button onClick={() => send()} disabled={busy || !input.trim()} size="icon">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
