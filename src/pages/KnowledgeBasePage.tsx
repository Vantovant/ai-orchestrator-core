import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BookOpen, Upload, Search, Plus, Database, Shield, AlertTriangle, FileText } from "lucide-react";

interface KBWorkspace {
  id: string;
  workspace_id: string;
  workspace_type: string;
  default_provider: string;
  openai_vector_store_id: string | null;
  vertex_corpus_resource: string | null;
  created_at: string;
}

interface KBFile {
  id: string;
  filename: string | null;
  provider: string;
  status: string;
  tags: any;
  created_at: string;
}

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<KBWorkspace[]>([]);
  const [activeWs, setActiveWs] = useState<KBWorkspace | null>(null);
  const [files, setFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<any>(null);

  // Create workspace form
  const [newWsType, setNewWsType] = useState<string>("private");
  const [showCreate, setShowCreate] = useState(false);

  const fetchWorkspaces = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kb_workspaces")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setWorkspaces((data as any[]) || []);
    if (data && data.length > 0 && !activeWs) setActiveWs(data[0] as any);
    setLoading(false);
  };

  const fetchFiles = async (wsId: string) => {
    const { data } = await supabase
      .from("kb_files")
      .select("*")
      .eq("workspace_id", wsId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setFiles((data as any[]) || []);
  };

  useEffect(() => { fetchWorkspaces(); }, []);
  useEffect(() => { if (activeWs) fetchFiles(activeWs.id); }, [activeWs]);

  const createWorkspace = async () => {
    if (!user) return;
    const defaultProvider = newWsType === "gov" ? "vertex" : "openai";
    const { data, error } = await supabase.from("kb_workspaces").insert({
      workspace_id: crypto.randomUUID(),
      user_id: user.id,
      workspace_type: newWsType,
      default_provider: defaultProvider,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success(`${newWsType.toUpperCase()} workspace created`);
    setShowCreate(false);
    fetchWorkspaces();
    setActiveWs(data as any);
  };

  const createStore = async () => {
    if (!activeWs) return;
    const fnName = activeWs.default_provider === "vertex" ? "kb-vertex-store" : "kb-openai-store";
    const { data, error } = await supabase.functions.invoke(fnName, {
      body: { workspace_id: activeWs.id },
    });
    if (error || data?.error) { toast.error(data?.error || error?.message || "Failed"); return; }
    toast.success("Knowledge store created!");
    fetchWorkspaces();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !activeWs) return;
    setUploading(true);
    const file = e.target.files[0];
    const fnName = activeWs.default_provider === "vertex" ? "kb-vertex-upload" : "kb-openai-upload";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("workspace_id", activeWs.id);
    formData.append("tags", JSON.stringify([]));

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast.success(`Uploaded: ${data.filename}`);
      fetchFiles(activeWs.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleQuery = async () => {
    if (!activeWs || !question.trim()) return;
    setQuerying(true);
    setAnswer(null);
    try {
      const { data, error } = await supabase.functions.invoke("kb-query", {
        body: { workspace_id: activeWs.id, question },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setAnswer(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setQuerying(false);
    }
  };

  const storeReady = activeWs && (activeWs.openai_vector_store_id || activeWs.vertex_corpus_resource);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6" /> Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">Upload documents, query your knowledge — OpenAI (default) or Vertex (GOV)</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)} className="gap-1">
          <Plus className="h-4 w-4" /> New Workspace
        </Button>
      </div>

      {/* Create workspace */}
      {showCreate && (
        <Card>
          <CardContent className="p-4 flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Workspace Type</label>
              <Select value={newWsType} onValueChange={setNewWsType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (OpenAI default)</SelectItem>
                  <SelectItem value="gov">GOV (Vertex AI default)</SelectItem>
                  <SelectItem value="nm">NM (OpenAI default)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createWorkspace}>Create</Button>
          </CardContent>
        </Card>
      )}

      {/* Workspace selector */}
      {workspaces.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {workspaces.map(ws => (
            <Button
              key={ws.id}
              size="sm"
              variant={activeWs?.id === ws.id ? "default" : "outline"}
              onClick={() => setActiveWs(ws)}
              className="gap-1"
            >
              <Shield className="h-3 w-3" />
              {ws.workspace_type.toUpperCase()}
              <Badge variant="secondary" className="text-[10px] ml-1">
                {ws.default_provider}
              </Badge>
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : activeWs ? (
        <Tabs defaultValue="docs">
          <TabsList>
            <TabsTrigger value="docs">Documents</TabsTrigger>
            <TabsTrigger value="query">Query</TabsTrigger>
            <TabsTrigger value="info">Info</TabsTrigger>
          </TabsList>

          <TabsContent value="docs" className="space-y-4">
            {/* Store creation */}
            {!storeReady && (
              <Card className="border-dashed">
                <CardContent className="p-6 text-center space-y-3">
                  <Database className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No knowledge store yet. Create one to start uploading documents.
                  </p>
                  <Button onClick={createStore}>
                    Create {activeWs.default_provider === "vertex" ? "Vertex Corpus" : "OpenAI Vector Store"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Upload */}
            {storeReady && (
              <Card>
                <CardContent className="p-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <span className="text-sm font-medium">{uploading ? "Uploading…" : "Upload Document"}</span>
                    <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept=".pdf,.txt,.md,.csv,.docx,.xlsx" />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">PII is automatically redacted before upload</p>
                </CardContent>
              </Card>
            )}

            {/* Files list */}
            {files.length > 0 ? (
              <div className="space-y-2">
                {files.map(f => (
                  <Card key={f.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{f.filename || "Unnamed"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{f.provider}</Badge>
                        <Badge variant={f.status === "ready" ? "default" : "outline"} className="text-[10px]">{f.status}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : storeReady ? (
              <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet</p>
            ) : null}
          </TabsContent>

          <TabsContent value="query" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Ask Your Knowledge</CardTitle>
                <CardDescription>Questions are redacted for PII before being sent to {activeWs.default_provider === "vertex" ? "Vertex AI" : "OpenAI"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="What do you want to know?"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  rows={3}
                />
                <Button onClick={handleQuery} disabled={querying || !question.trim()} className="gap-1">
                  <Search className="h-4 w-4" /> {querying ? "Searching…" : "Query"}
                </Button>
              </CardContent>
            </Card>

            {answer && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  {answer.needs_verification && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{answer.verification_warning}</span>
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <p className="whitespace-pre-wrap">{answer.answer}</p>
                  </div>
                  {answer.had_pii && (
                    <Badge variant="outline" className="text-[10px]">PII was redacted from query</Badge>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">{answer.routed_provider || answer.provider}</Badge>
                    {answer.workspace_type && <Badge variant="outline">{answer.workspace_type}</Badge>}
                  </div>
                  {answer.citations?.length > 0 && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-medium">Citations:</p>
                      {answer.citations.map((c: any, i: number) => (
                        <p key={i}>• {c.filename || c.source}{c.score ? ` (${(c.score * 100).toFixed(0)}%)` : ""}</p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="info">
            <Card>
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Workspace Type</span><Badge>{activeWs.workspace_type.toUpperCase()}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><Badge variant="secondary">{activeWs.default_provider}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">OpenAI Store</span><span className="font-mono text-xs">{activeWs.openai_vector_store_id || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vertex Corpus</span><span className="font-mono text-xs truncate max-w-[200px]">{activeWs.vertex_corpus_resource || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Documents</span><span>{files.length}</span></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No workspaces yet. Create one to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
