import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { knowledgeService, type KnowledgeDoc } from "@/services/knowledgeService";
import { uploadKnowledgeFile, getFileDownloadUrl, getKnowledgeFile, retryIngestion } from "@/services/knowledgeUploadService";
import { ACCEPTED_FILE_TYPES } from "@/lib/fileExtractor";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  BookOpen, Upload, Search, Plus, FileText, Trash2, Download,
  Tag, X, Filter, AlertTriangle, Database, FolderOpen, RefreshCw,
} from "lucide-react";

type KBFilter = "all" | "global" | "project";

export default function KnowledgeBasePage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<KBFilter>("all");
  const [filterProjectId, setFilterProjectId] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tags, setTags] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Query
  const [question, setQuestion] = useState("");
  const [querying, setQuerying] = useState(false);
  const [answer, setAnswer] = useState<any>(null);

  // Fetch all docs
  const docs = useQuery({
    queryKey: ["knowledge_docs_global", filter, filterProjectId],
    queryFn: async () => {
      if (filter === "global") return knowledgeService.list(null, "global");
      if (filter === "project" && filterProjectId) return knowledgeService.list(filterProjectId, "project");
      return knowledgeService.list(null, "all");
    },
  });

  // Fetch projects for badges & filter
  const projects = useQuery({
    queryKey: ["projects_for_kb"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const projectMap = new Map(projects.data?.map(p => [p.id, p.name]) ?? []);

  const removeMutation = useMutation({
    mutationFn: (id: string) => knowledgeService.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["knowledge_docs_global"] }); toast.success("Removed"); },
  });

  const resetForm = () => {
    setAddOpen(false);
    setTitle("");
    setRawText("");
    setSourceUrl("");
    setTags("");
    setSelectedFile(null);
    setUploading(false);
  };

  // File upload (Supabase pipeline)
  const handleAdd = async () => {
    if (selectedFile) {
      setUploading(true);
      try {
        const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
        const result = await uploadKnowledgeFile(selectedFile, null, title.trim() || undefined, tagList.length > 0 ? tagList : undefined);
        qc.invalidateQueries({ queryKey: ["knowledge_docs_global"] });
        if (result.extractionError) {
          toast.warning(`Uploaded but text extraction failed: ${result.extractionError}`);
        } else {
          toast.success(`Uploaded! ${result.chunksCreated} chunks created.`);
        }
        resetForm();
      } catch (e: any) {
        toast.error(e.message || "Upload failed");
      } finally {
        setUploading(false);
      }
      return;
    }

    // Text-only doc
    if (!title.trim()) { toast.error("Title required"); return; }
    try {
      await knowledgeService.create({
        title: title.trim(),
        raw_text: rawText.trim(),
        source_url: sourceUrl.trim() || undefined,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        project_id: null,
        source_type: "manual",
      });
      qc.invalidateQueries({ queryKey: ["knowledge_docs_global"] });
      toast.success("Knowledge doc added");
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) { setSelectedFile(file); if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, "")); }
  }, [title]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setSelectedFile(file); if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, "")); }
  };

  const handleDownload = async (docId: string) => {
    try {
      const kf = await getKnowledgeFile(docId);
      if (!kf?.path) { toast.error("No file attached"); return; }
      const url = await getFileDownloadUrl(kf.path);
      window.open(url, "_blank");
    } catch { toast.error("Download failed"); }
  };

  const handleQuery = async () => {
    if (!question.trim()) return;
    setQuerying(true);
    setAnswer(null);
    try {
      const { data, error } = await supabase.functions.invoke("kb-query", {
        body: { question, project_id: filter === "project" ? filterProjectId : null },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setAnswer(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setQuerying(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusColor = (s: string) => {
    if (s === "ready" || s === "processed") return "default";
    if (s === "extraction_failed") return "destructive";
    return "outline";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload documents, query your knowledge — stored securely in Supabase
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Upload Document
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filter} onValueChange={v => { setFilter(v as KBFilter); setFilterProjectId(""); }}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Documents</SelectItem>
            <SelectItem value="global">Global Only</SelectItem>
            <SelectItem value="project">By Project</SelectItem>
          </SelectContent>
        </Select>
        {filter === "project" && (
          <Select value={filterProjectId} onValueChange={setFilterProjectId}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Select project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.data?.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="secondary" className="text-[10px]">{docs.data?.length ?? 0} docs</Badge>
      </div>

      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">Documents</TabsTrigger>
          <TabsTrigger value="query">Query</TabsTrigger>
        </TabsList>

        <TabsContent value="docs" className="space-y-3">
          {docs.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : docs.data?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <Database className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No documents yet. Upload your first document to get started.</p>
                <Button onClick={() => setAddOpen(true)} className="gap-1"><Upload className="h-4 w-4" /> Upload Document</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {docs.data?.map(doc => (
                <Card key={doc.id} className="group">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">{doc.title}</span>
                          <Badge variant={statusColor(doc.status)} className="text-[9px]">{doc.status}</Badge>
                          <Badge variant="secondary" className="text-[9px]">supabase</Badge>
                          {doc.source_type === "upload" && (
                            <Badge variant="outline" className="text-[9px] gap-0.5"><Upload className="h-2 w-2" /> file</Badge>
                          )}
                          {doc.project_id ? (
                            <Badge variant="default" className="text-[9px] gap-0.5">
                              <FolderOpen className="h-2 w-2" /> {projectMap.get(doc.project_id) || "Project"}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px]">Global</Badge>
                          )}
                        </div>
                        {doc.raw_text && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 ml-6">{doc.raw_text}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1.5 ml-6">
                          {doc.tags?.map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-[9px]">
                              <Tag className="h-2 w-2 mr-0.5" />{tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {doc.status === "extraction_failed" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={async () => {
                            try {
                              toast.info("Retrying…");
                              const r = await retryIngestion(doc.id);
                              toast.success(`Done! ${r.chunksCreated} chunks created.`);
                              qc.invalidateQueries({ queryKey: ["knowledge_docs_global"] });
                            } catch (e: any) { toast.error(e.message); }
                          }}>
                            <RefreshCw className="h-3 w-3" /> Retry
                          </Button>
                        )}
                        {doc.source_type === "upload" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => handleDownload(doc.id)} title="Download">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={() => removeMutation.mutate(doc.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="query" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Ask Your Knowledge</CardTitle>
              <CardDescription>Queries your locally-stored knowledge chunks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea placeholder="What do you want to know?" value={question} onChange={e => setQuestion(e.target.value)} rows={3} />
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
                  <Badge variant="secondary">supabase</Badge>
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
      </Tabs>

      {/* Upload Dialog */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) resetForm(); else setAddOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload Document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Drag/drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50"
              }`}
              onClick={() => document.getElementById("kb-global-file-input")?.click()}
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium truncate max-w-[300px]">{selectedFile.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatSize(selectedFile.size)}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-5 w-5 ml-2" onClick={e => { e.stopPropagation(); setSelectedFile(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Drop a file here or <span className="text-primary underline">browse</span></p>
                  <p className="text-[10px] text-muted-foreground">PDF, DOCX, TXT, MD, CSV, JSON, HTML</p>
                </div>
              )}
              <input id="kb-global-file-input" type="file" accept={ACCEPTED_FILE_TYPES} className="hidden" onChange={onFileSelect} />
            </div>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-muted" />
              <span className="px-2 text-[10px] text-muted-foreground">or paste text</span>
              <div className="flex-1 border-t border-muted" />
            </div>

            <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <Textarea placeholder="Content / notes / raw text" value={rawText} onChange={e => setRawText(e.target.value)} rows={4} />
            <Input placeholder="Source URL (optional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
            <Input placeholder="Tags (comma-separated)" value={tags} onChange={e => setTags(e.target.value)} />

            <Button onClick={handleAdd} disabled={uploading || (!selectedFile && !title.trim())} className="w-full gap-1">
              {uploading ? "Uploading & Processing…" : selectedFile ? <><Upload className="h-3 w-3" /> Upload & Process</> : "Add Knowledge Doc"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
