import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { portfolioChatService, type PortfolioThread, type PortfolioMessage } from "@/services/portfolioChatService";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send, Loader2, Plus, MessageSquare, Pin, Trash2,
  Hash, BookOpen, FolderKanban, Globe, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TAG_OPTIONS = [
  { value: "@all-projects", label: "All Projects", icon: FolderKanban },
  { value: "@knowledge", label: "Knowledge Base", icon: BookOpen },
  { value: "@global-only", label: "Global Only", icon: Globe },
];

interface PortfolioPartnerChatProps {
  projects: { id: string; name: string }[];
}

export default function PortfolioPartnerChat({ projects }: PortfolioPartnerChatProps) {
  const [threads, setThreads] = useState<PortfolioThread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortfolioMessage[]>([]);
  const [input, setInput] = useState("");
  const [contextTags, setContextTags] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    const data = await portfolioChatService.listThreads();
    setThreads(data);
    setLoadingThreads(false);
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const loadMessages = useCallback(async (threadId: string) => {
    const data = await portfolioChatService.listMessages(threadId);
    setMessages(data);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  }, []);

  useEffect(() => {
    if (activeThread) loadMessages(activeThread);
    else setMessages([]);
  }, [activeThread, loadMessages]);

  const handleNewThread = async () => {
    try {
      const thread = await portfolioChatService.createThread();
      setThreads(prev => [thread, ...prev]);
      setActiveThread(thread.id);
      setMessages([]);
      inputRef.current?.focus();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleArchiveThread = async (id: string) => {
    await portfolioChatService.archiveThread(id);
    setThreads(prev => prev.filter(t => t.id !== id));
    if (activeThread === id) { setActiveThread(null); setMessages([]); }
  };

  const handlePinThread = async (id: string, pinned: boolean) => {
    await portfolioChatService.updateThread(id, { pinned: !pinned });
    loadThreads();
  };

  const toggleTag = (tag: string) => {
    setContextTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const addProjectTag = (name: string) => {
    const tag = `@project:${name}`;
    if (!contextTags.includes(tag)) setContextTags(prev => [...prev, tag]);
  };

  const removeTag = (tag: string) => setContextTags(prev => prev.filter(t => t !== tag));

  const parseInlineTags = (text: string): { cleanText: string; tags: string[] } => {
    const tagPattern = /@(all-projects|knowledge|global-only|project:[^\s]+|doc:[^\s]+)/g;
    const foundTags: string[] = [];
    let match;
    while ((match = tagPattern.exec(text)) !== null) {
      foundTags.push(`@${match[1]}`);
    }
    const cleanText = text.replace(tagPattern, "").trim();
    return { cleanText, tags: foundTags };
  };

  const handleSend = async () => {
    if (!input.trim() || streaming) return;

    let threadId = activeThread;
    if (!threadId) {
      const thread = await portfolioChatService.createThread(input.slice(0, 50));
      setThreads(prev => [thread, ...prev]);
      threadId = thread.id;
      setActiveThread(threadId);
    }

    const { cleanText, tags: inlineTags } = parseInlineTags(input);
    const allTags = [...new Set([...contextTags, ...inlineTags])];
    const prompt = cleanText || input;

    const userMsg = await portfolioChatService.addMessage(threadId, "user", input, allTags);
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamText("");

    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);

    const history = messages.map(m => ({ role: m.role, content: m.content }));

    await portfolioChatService.sendChatSSE(
      threadId,
      prompt,
      allTags,
      history,
      (text) => {
        setStreamText(text);
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      },
      async (fullText, retrievalMeta) => {
        setStreaming(false);
        setStreamText("");
        const assistantMsg = await portfolioChatService.addMessage(threadId!, "assistant", fullText, [], retrievalMeta);
        setMessages(prev => [...prev, assistantMsg]);
        if (messages.length === 0) {
          const titleSlice = prompt.slice(0, 50);
          await portfolioChatService.updateThread(threadId!, { title: titleSlice });
          loadThreads();
        }
      },
      (err) => {
        setStreaming(false);
        setStreamText("");
        toast.error(err);
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] border rounded-lg overflow-hidden bg-background relative">
      {/* Thread sidebar - full overlay on mobile, side panel on desktop */}
      {/* Desktop: always visible sidebar. Mobile: overlay when toggled */}
      <div className={cn(
        "border-r flex-col bg-background",
        "sm:relative sm:inset-auto sm:w-64 sm:bg-muted/20",
        showSidebar ? "flex absolute inset-0 z-20 w-full" : "hidden sm:!flex"
      )}>
          <div className="p-2 border-b flex items-center gap-2">
            <Button size="sm" variant="default" className="flex-1 gap-1 h-8 text-xs" onClick={handleNewThread}>
              <Plus className="h-3 w-3" /> New Chat
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 sm:hidden" onClick={() => setShowSidebar(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-1 space-y-0.5">
              {loadingThreads ? (
                <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
              ) : threads.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground text-center">No conversations yet</p>
              ) : threads.map(t => (
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center gap-1 p-2 rounded-md cursor-pointer text-xs hover:bg-muted/50 transition-colors",
                    activeThread === t.id && "bg-primary/10 text-primary"
                  )}
                  onClick={() => { setActiveThread(t.id); setShowSidebar(false); }}
                >
                  {t.pinned && <Pin className="h-3 w-3 text-warning shrink-0" />}
                  <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{t.title}</span>
                  <div className="hidden group-hover:flex gap-0.5">
                    <button onClick={(e) => { e.stopPropagation(); handlePinThread(t.id, t.pinned); }} className="p-0.5 hover:text-primary">
                      <Pin className="h-3 w-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleArchiveThread(t.id); }} className="p-0.5 hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar with thread list toggle */}
        <div className="flex items-center gap-2 p-2 border-b sm:hidden">
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setShowSidebar(true)}>
            <MessageSquare className="h-3.5 w-3.5" /> Chats
          </Button>
          <Button size="sm" variant="default" className="h-8 gap-1 text-xs ml-auto" onClick={handleNewThread}>
            <Plus className="h-3 w-3" /> New
          </Button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeThread && messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Portfolio Partner</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Your AI co-founder for the full VantoOS portfolio. Ask about projects, risks, tasks, knowledge docs, or strategy.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("How was the day today? What was done well, and what could be done better?"); inputRef.current?.focus(); }}>
                  📊 Daily review
                </Badge>
                <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("Give me a full portfolio health check"); inputRef.current?.focus(); }}>
                  Portfolio health check
                </Badge>
                <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("What should I focus on this week?"); inputRef.current?.focus(); }}>
                  Weekly focus
                </Badge>
                <Badge variant="outline" className="cursor-pointer text-xs" onClick={() => { setInput("What are my biggest risks right now?"); inputRef.current?.focus(); }}>
                  Top risks
                </Badge>
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-xl px-4 py-2.5",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 border"
              )}>
                {msg.context_tags_json?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {msg.context_tags_json.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[9px] px-1.5 py-0">{tag}</Badge>
                    ))}
                  </div>
                )}
                {msg.role === "assistant" ? (
                  <>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.retrieval_meta_json?.is_daily_review && msg.retrieval_meta_json.daily_review_counts && (
                      <div className="mt-2 pt-2 border-t border-border/40">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">📊 DAILY REVIEW SOURCES</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(msg.retrieval_meta_json.daily_review_counts as Record<string, number>).map(([key, val]) => (
                            <Badge key={key} variant="secondary" className="text-[9px] px-1.5 py-0">
                              {key.replace(/_/g, " ")}: {val}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.retrieval_meta_json?.data_sources?.length > 0 && !msg.retrieval_meta_json?.is_daily_review && (
                      <div className="mt-2 pt-2 border-t border-border/40">
                        <div className="flex flex-wrap gap-1">
                          {(msg.retrieval_meta_json.data_sources as string[]).map((src: string) => (
                            <Badge key={src} variant="outline" className="text-[9px] px-1.5 py-0">
                              {src.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl px-4 py-2.5 bg-muted/50 border">
                {streamText ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown>{streamText}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs">Thinking…</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {contextTags.length > 0 && (
          <div className="px-4 pb-1 flex flex-wrap gap-1">
            {contextTags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-[10px] gap-0.5 pr-1">
                {tag}
                <button onClick={() => removeTag(tag)}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            ))}
          </div>
        )}

        <div className="border-t p-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {TAG_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                size="sm"
                variant={contextTags.includes(opt.value) ? "default" : "ghost"}
                className="h-6 text-[10px] px-2 gap-1"
                onClick={() => toggleTag(opt.value)}
              >
                <opt.icon className="h-3 w-3" /> {opt.label}
              </Button>
            ))}
            {projects.slice(0, 5).map(p => (
              <Button
                key={p.id}
                size="sm"
                variant={contextTags.includes(`@project:${p.name}`) ? "default" : "ghost"}
                className="h-6 text-[10px] px-2 gap-1"
                onClick={() => {
                  const tag = `@project:${p.name}`;
                  contextTags.includes(tag) ? removeTag(tag) : addProjectTag(p.name);
                }}
              >
                <Hash className="h-3 w-3" /> {p.name.slice(0, 15)}
              </Button>
            ))}
          </div>
          <div className="flex gap-2 items-end">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your portfolio partner…"
              className="min-h-[44px] max-h-28 resize-none text-sm flex-1"
              rows={1}
            />
            <Button onClick={handleSend} disabled={!input.trim() || streaming} size="icon" className="shrink-0 h-11 w-11 mb-0 relative z-30">
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
