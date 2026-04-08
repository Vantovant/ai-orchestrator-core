import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { taskService } from "@/services/taskService";
import { knowledgeService } from "@/services/knowledgeService";
import PartnerMemoryPanel from "@/components/projects/PartnerMemoryPanel";
import FundingPathwaysTab from "@/components/projects/FundingPathwaysTab";
import ReactMarkdown from "react-markdown";
import {
  Brain, Zap, Target, ShieldCheck, Loader2, CheckCircle2,
  AlertTriangle, ArrowRight, Sparkles, Banknote, MessageCircle,
  Send, BookOpen, ChevronDown, FileText, Info, X,
} from "lucide-react";
import { toast } from "sonner";

type Mode = "executive_brief" | "sprint_plan" | "sell_readiness" | "funding_pathways" | "chat";

interface AIPartnerTabProps {
  projectId: string;
  projectName: string;
}

interface RetrievalMeta {
  project_id: string;
  docs_used: { id: string; title: string }[];
  retrieval_type: string;
  missing_docs: string[];
  unindexed_docs: string[];
  data_sources?: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  retrieval_meta?: RetrievalMeta;
}

const modeConfig: Record<Exclude<Mode, "chat">, { label: string; icon: any; description: string; color: string }> = {
  executive_brief: { label: "Executive Brief", icon: Brain, description: "Status, priorities, risks, prep", color: "text-primary" },
  sprint_plan: { label: "Sprint Plan", icon: Zap, description: "7-day action plan with daily items", color: "text-warning" },
  sell_readiness: { label: "Sell-Readiness", icon: ShieldCheck, description: "Scorecard & missing items audit", color: "text-success" },
  funding_pathways: { label: "Funding", icon: Banknote, description: "Funding types, readiness & sources", color: "text-primary" },
};

export default function AIPartnerTab({ projectId, projectName }: AIPartnerTabProps) {
  const qc = useQueryClient();
  const [activeMode, setActiveMode] = useState<Mode | null>(null);
  const [result, setResult] = useState<any>(null);
  const [applying, setApplying] = useState(false);
  const [appliedTasks, setAppliedTasks] = useState<Set<number>>(new Set());

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Knowledge doc picker state
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [docPickerOpen, setDocPickerOpen] = useState(false);

  // Fetch project knowledge docs for the picker
  const { data: projectDocs } = useQuery({
    queryKey: ["knowledge_docs_project", projectId],
    queryFn: () => knowledgeService.list(projectId, "project"),
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Structured mode mutation (existing)
  const aiMut = useMutation({
    mutationFn: async (mode: Exclude<Mode, "chat">) => {
      const { data, error } = await supabase.functions.invoke("project-ai-partner", {
        body: { project_id: projectId, mode, selected_doc_ids: selectedDocIds.length ? selectedDocIds : undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setAppliedTasks(new Set());
      qc.invalidateQueries({ queryKey: ["partner_scores_all"] });
    },
    onError: (e: any) => {
      toast.error(e.message || "AI Partner unavailable");
    },
  });

  // Chat mutation
  const chatMut = useMutation({
    mutationFn: async (prompt: string) => {
      const { data, error } = await supabase.functions.invoke("project-ai-partner", {
        body: { project_id: projectId, mode: "chat", prompt, selected_doc_ids: selectedDocIds.length ? selectedDocIds : undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      const content = data.result?.summary || data.result?.content || "No response";
      setChatMessages(prev => [...prev, {
        role: "assistant",
        content,
        retrieval_meta: data.retrieval_meta,
      }]);
    },
    onError: (e: any) => {
      setChatMessages(prev => [...prev, { role: "assistant", content: `❌ Error: ${e.message}` }]);
    },
  });

  const handleRun = (mode: Exclude<Mode, "chat">) => {
    if (mode === "funding_pathways") {
      setActiveMode(mode);
      setResult(null);
      return;
    }
    setActiveMode(mode);
    setResult(null);
    aiMut.mutate(mode);
  };

  const handleSendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setActiveMode("chat");
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: msg }]);
    chatMut.mutate(msg);
  };

  const handleApplyTask = async (task: any, index: number) => {
    setApplying(true);
    try {
      const dueDate = task.due_in_days
        ? new Date(Date.now() + task.due_in_days * 86400000).toISOString()
        : undefined;
      await taskService.create({
        title: task.title,
        priority: task.priority || "medium",
        due_date: dueDate,
        source: "ai_partner",
        project_id: projectId,
      } as any);
      setAppliedTasks(prev => new Set(prev).add(index));
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`Task created: ${task.title}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create task");
    }
    setApplying(false);
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds(prev =>
      prev.includes(docId) ? prev.filter(d => d !== docId) : [...prev, docId]
    );
  };

  const r = result?.result;

  return (
    <div className="space-y-4">
      {/* Partner Memory */}
      <PartnerMemoryPanel projectId={projectId} projectName={projectName} />

      {/* Knowledge Scope Picker */}
      <Collapsible open={docPickerOpen} onOpenChange={setDocPickerOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Knowledge Scope
                  {selectedDocIds.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedDocIds.length} doc{selectedDocIds.length > 1 ? "s" : ""} selected
                    </Badge>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${docPickerOpen ? "rotate-180" : ""}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Select specific documents to focus the AI, or leave empty for automatic project-wide retrieval.
              </p>
              {selectedDocIds.length > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setSelectedDocIds([])}>
                  <X className="h-3 w-3 mr-1" /> Clear selection
                </Button>
              )}
              <ScrollArea className="max-h-40">
                <div className="space-y-1">
                  {(projectDocs ?? []).map(doc => (
                    <label key={doc.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/30 cursor-pointer">
                      <Checkbox
                        checked={selectedDocIds.includes(doc.id)}
                        onCheckedChange={() => toggleDocSelection(doc.id)}
                      />
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs truncate">{doc.title}</span>
                      <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{doc.source_type}</Badge>
                    </label>
                  ))}
                  {(!projectDocs || projectDocs.length === 0) && (
                    <p className="text-xs text-muted-foreground p-2">No knowledge documents in this project yet.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Mode buttons */}
      <div className="grid gap-3 sm:grid-cols-4">
        {(Object.entries(modeConfig) as [Exclude<Mode, "chat">, typeof modeConfig[Exclude<Mode, "chat">]][]).map(([mode, cfg]) => {
          const Icon = cfg.icon;
          const isActive = activeMode === mode;
          const isLoading = aiMut.isPending && activeMode === mode;
          return (
            <Button
              key={mode}
              variant={isActive ? "default" : "outline"}
              className="h-auto py-3 px-4 flex flex-col items-start gap-1 text-left"
              onClick={() => handleRun(mode)}
              disabled={aiMut.isPending || chatMut.isPending}
            >
              <div className="flex items-center gap-2 w-full">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className={`h-4 w-4 ${isActive ? "" : cfg.color}`} />}
                <span className="font-semibold text-sm">{cfg.label}</span>
              </div>
              <span className="text-[11px] opacity-70 font-normal">{cfg.description}</span>
            </Button>
          );
        })}
      </div>

      {/* Chat Interface */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            Ask the AI Partner
            <span className="text-[10px] text-muted-foreground font-normal ml-auto">
              Uses project context + Knowledge Base
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {chatMessages.length > 0 && (
            <ScrollArea className="max-h-[400px] border rounded-lg p-3">
              <div className="space-y-3">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : msg.content}
                    </div>
                    {msg.retrieval_meta && <SourcesUsed meta={msg.retrieval_meta} />}
                  </div>
                ))}
                {chatMut.isPending && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
          )}
          <div className="flex gap-2">
            <Textarea
              placeholder={`Ask about ${projectName}… e.g. "refer to 05_Outstanding_Tasks and tell me what's done"`}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
              className="min-h-[60px] text-sm resize-none"
              rows={2}
            />
            <Button
              size="icon"
              onClick={handleSendChat}
              disabled={!chatInput.trim() || chatMut.isPending}
              className="shrink-0 h-[60px] w-10"
            >
              {chatMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading for structured modes */}
      {aiMut.isPending && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">AI Senior Partner is analyzing {projectName}…</p>
          </CardContent>
        </Card>
      )}

      {/* Funding Pathways */}
      {activeMode === "funding_pathways" && !aiMut.isPending && (
        <FundingPathwaysTab projectId={projectId} projectName={projectName} />
      )}

      {/* Structured Results */}
      {r && activeMode === "executive_brief" && <ExecutiveBriefResult data={r} onApplyTask={handleApplyTask} appliedTasks={appliedTasks} applying={applying} />}
      {r && activeMode === "sprint_plan" && <SprintPlanResult data={r} onApplyTask={handleApplyTask} appliedTasks={appliedTasks} applying={applying} />}
      {r && activeMode === "sell_readiness" && <SellReadinessResult data={r} onApplyTask={handleApplyTask} appliedTasks={appliedTasks} applying={applying} />}

      {/* Retrieval metadata for structured modes */}
      {result && activeMode !== "funding_pathways" && activeMode !== "chat" && (
        <div className="space-y-1">
          {result.retrieval_meta && <SourcesUsed meta={result.retrieval_meta} />}
          <p className="text-[10px] text-muted-foreground text-right">
            Snapshot: {result.snapshot_len} chars {result.was_truncated && "(truncated)"}
            {result.kb_len > 0 && ` • KB: ${result.kb_len} chars`}
            {result.kb_truncated && " (kb truncated)"}
            {" "}• AI status: {result.ai_status}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sources Used ──
function SourcesUsed({ meta }: { meta: RetrievalMeta }) {
  const hasContent = meta.docs_used?.length || meta.missing_docs?.length || meta.unindexed_docs?.length || (meta.data_sources?.length && meta.data_sources.length > 0);
  if (!hasContent) return null;

  const sourceLabels: Record<string, string> = {
    project: "📋 Project", tasks: "✅ Tasks", meetings: "📅 Meetings",
    notes: "📝 Notes", partner_memory: "🧠 Memory", emails: "📧 Emails",
    finance: "💰 Finance", plan_hub: "📌 Plan Hub", knowledge_base: "📚 Knowledge",
    projects: "📋 Projects", memories: "🧠 Memories", scores: "📊 Scores",
    planning_notes: "📝 Plan Notes", project_notes: "📝 Project Notes",
    project_links: "🔗 Links", score_history: "📈 Trends", reminders: "⏰ Reminders",
  };

  return (
    <div className="mt-1 p-2 rounded bg-muted/40 border border-border/50 max-w-[85%]">
      <div className="flex items-center gap-1 mb-1">
        <Info className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase">Sources Used</span>
        <Badge variant="outline" className="text-[9px] ml-1">{meta.retrieval_type?.replace(/_/g, " ") || "auto"}</Badge>
      </div>
      {meta.data_sources && meta.data_sources.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {meta.data_sources.map(src => (
            <Badge key={src} variant="outline" className="text-[9px] gap-0.5">
              {sourceLabels[src] || src}
            </Badge>
          ))}
        </div>
      )}
      {meta.docs_used?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.docs_used.map(d => (
            <Badge key={d.id} variant="secondary" className="text-[9px] gap-1">
              <FileText className="h-2.5 w-2.5" />{d.title.length > 30 ? d.title.slice(0, 30) + "…" : d.title}
            </Badge>
          ))}
        </div>
      )}
      {meta.missing_docs?.length > 0 && (
        <p className="text-[10px] text-destructive mt-1">⚠ Not found: {meta.missing_docs.join(", ")}</p>
      )}
      {meta.unindexed_docs?.length > 0 && (
        <p className="text-[10px] text-warning mt-1">⏳ Not indexed: {meta.unindexed_docs.join(", ")}</p>
      )}
    </div>
  );
}

// ── Executive Brief ──
function ExecutiveBriefResult({ data, onApplyTask, appliedTasks, applying }: any) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> Executive Brief</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{data.status_summary}</p>
          {data.top_priorities?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">TOP PRIORITIES</h4>
              <div className="space-y-2">
                {data.top_priorities.map((p: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.priority}</p>
                      <p className="text-xs text-muted-foreground">{p.reason}</p>
                      <p className="text-xs text-primary mt-0.5">→ {p.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.biggest_risk && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">BIGGEST RISK</h4>
              <div className="p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{data.biggest_risk.risk}</p>
                    <p className="text-xs text-muted-foreground">Impact: {data.biggest_risk.impact}</p>
                    <p className="text-xs text-success mt-0.5">Mitigation: {data.biggest_risk.mitigation}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {data.meeting_prep && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">MEETING PREP</h4>
              <p className="text-sm bg-muted/30 p-2 rounded-lg">{data.meeting_prep}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <SuggestedTasksList tasks={data.suggested_tasks} onApply={onApplyTask} applied={appliedTasks} applying={applying} />
    </div>
  );
}

// ── Sprint Plan ──
function SprintPlanResult({ data, onApplyTask, appliedTasks, applying }: any) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-warning" /> 7-Day Sprint Plan</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {data.focus_areas?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">FOCUS AREAS</h4>
              <div className="flex flex-wrap gap-1.5">
                {data.focus_areas.map((f: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">{f}</Badge>
                ))}
              </div>
            </div>
          )}
          {data.daily_plan?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">DAILY ACTIONS</h4>
              <div className="space-y-2">
                {data.daily_plan.map((d: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-muted/30">
                    <p className="text-xs font-semibold text-primary mb-1">{d.day}</p>
                    <ul className="space-y-0.5">
                      {d.actions?.map((a: string, j: number) => (
                        <li key={j} className="text-xs flex items-start gap-1.5">
                          <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.postpone?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">POSTPONE</h4>
              {data.postpone.map((p: any, i: number) => (
                <div key={i} className="text-xs p-2 rounded-lg bg-muted/30 mb-1">
                  <span className="font-medium">{p.item}</span> — <span className="text-muted-foreground">{p.reason}</span>
                </div>
              ))}
            </div>
          )}
          {data.quick_wins?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">QUICK WINS</h4>
              <ul className="space-y-1">
                {data.quick_wins.map((w: string, i: number) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <Sparkles className="h-3 w-3 text-warning shrink-0 mt-0.5" />{w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <SuggestedTasksList tasks={data.suggested_tasks} onApply={onApplyTask} applied={appliedTasks} applying={applying} />
    </div>
  );
}

// ── Sell Readiness ──
function SellReadinessResult({ data, onApplyTask, appliedTasks, applying }: any) {
  const dimensions = [
    { key: "problem_clarity", label: "Problem Clarity" },
    { key: "solution_maturity", label: "Solution Maturity" },
    { key: "mvp_stability", label: "MVP Stability" },
    { key: "onboarding_ux", label: "Onboarding & UX" },
    { key: "pricing_packaging", label: "Pricing & Packaging" },
    { key: "compliance", label: "Compliance" },
    { key: "support_docs", label: "Support & Docs" },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" /> Sell-Readiness Audit</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{data.overall_score ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">/ 100</p>
            </div>
            <div className="flex-1">
              <Progress value={data.overall_score ?? 0} className="h-3" />
              <p className={`text-xs font-semibold mt-1 capitalize`}>
                {data.verdict?.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          {data.summary && <p className="text-sm text-muted-foreground">{data.summary}</p>}
          {data.scores && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">SCORECARD</h4>
              <div className="space-y-2">
                {dimensions.map(({ key, label }) => {
                  const score = data.scores[key] ?? 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-xs w-32 shrink-0">{label}</span>
                      <Progress value={score} className="h-2 flex-1" />
                      <span className="text-xs font-mono w-8 text-right">{score}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {data.missing_items?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">MISSING ITEMS</h4>
              <div className="space-y-1.5">
                {data.missing_items.map((m: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <Badge variant="outline" className="text-[10px] mb-0.5">{m.area}</Badge>
                        <p className="text-xs">{m.issue}</p>
                        <p className="text-[11px] text-primary mt-0.5">→ {m.next_step}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <SuggestedTasksList tasks={data.suggested_tasks} onApply={onApplyTask} applied={appliedTasks} applying={applying} />
    </div>
  );
}

// ── Suggested Tasks ──
function SuggestedTasksList({ tasks, onApply, applied, applying }: { tasks?: any[]; onApply: (t: any, i: number) => void; applied: Set<number>; applying: boolean }) {
  if (!tasks?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Suggested Tasks</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground mb-2">Click to add to your project. Each task requires confirmation.</p>
        {tasks.map((t: any, i: number) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <div className="flex-1 min-w-0">
              <p className="text-sm">{t.title}</p>
              <div className="flex gap-1 mt-0.5">
                <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                {t.due_in_days && <Badge variant="secondary" className="text-[10px]">{t.due_in_days}d</Badge>}
              </div>
            </div>
            {applied.has(i) ? (
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            ) : (
              <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1" onClick={() => onApply(t, i)} disabled={applying}>
                {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />} Add
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
