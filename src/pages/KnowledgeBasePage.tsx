import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { knowledgeService, suggestProject, type KnowledgeDocInsert, type ProjectSuggestion } from "@/services/knowledgeService";
import { uploadKnowledgeFile, getFileDownloadUrl, getKnowledgeFile } from "@/services/knowledgeUploadService";
import { ACCEPTED_FILE_TYPES } from "@/lib/fileExtractor";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Trash2, ExternalLink, Tag, Filter, Sparkles, Check, ArrowRight, Upload, Download, FileText, X, Search } from "lucide-react";
import { toast } from "sonner";

type KBFilter = "all" | "global" | "project";

const STATUS_COLORS: Record<string, string> = {
  ready: "default",
  processed: "default",
  uploading: "secondary",
  extraction_failed: "destructive",
};

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
  const [suggestions, setSuggestions] = useState<ProjectSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [showSuggestion, setShowSuggestion] = useState(false);

  const projectIdForQuery = filter === "project" ? filterProjectId : undefined;

  const docs = useQuery({
    queryKey: ["knowledge_docs", "kb-page", filter, projectIdForQuery],
    queryFn: () => knowledgeService.list(projectIdForQuery || null, filter === "project" && filterProjectId ? "project" : filter === "global" ? "global" : "all"),
  });

  const projects = useQuery({
    queryKey: ["projects_for_kb"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: (doc: KnowledgeDocInsert) => knowledgeService.create(doc),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge_docs"] });
      toast.success("Knowledge doc added");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => knowledgeService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge_docs"] });
      toast.success("Removed");
    },
  });

  const resetForm = () => {
    setAddOpen(false);
    setTitle("");
    setRawText("");
    setSourceUrl("");
    setTags("");
    setSuggestions([]);
    setShowSuggestion(false);
    setSelectedProjectId("");
    setSelectedFile(null);
    setUploading(false);
  };

  const handleSmartSuggest = async () => {
    if (!title.trim() && !rawText.trim()) return;
    setSuggestLoading(true);
    try {
      const results = await suggestProject(title, rawText);
      setSuggestions(results);
      setShowSuggestion(true);
      if (results.length > 0) {
        toast.info(`Suggested: ${results[0].project_name} (${results[0].confidence}%)`);
      } else {
        toast.info("No strong project match — will save as Global");
      }
    } catch {
      toast.error("Suggestion failed");
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
      const result = await uploadKnowledgeFile(
        selectedFile,
        selectedProjectId || null,
        title.trim() || undefined,
        tagList.length > 0 ? tagList : undefined,
      );
      qc.invalidateQueries({ queryKey: ["knowledge_docs"] });
      if (result.extractionError) {
        toast.warning(`File uploaded but text extraction failed. You can paste text manually.`);
      } else {
        toast.success(`Uploaded! ${result.chunksCreated} chunks created.`);
      }
      resetForm();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = () => {
    if (selectedFile) { handleFileUpload(); return; }
    if (!title.trim()) { toast.error("Title required"); return; }
    addMutation.mutate({
      title: title.trim(),
      raw_text: rawText.trim(),
      source_url: sourceUrl.trim() || undefined,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      project_id: selectedProjectId || undefined,
      source_type: "manual",
    });
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  }, [title]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleDownload = async (docId: string) => {
    try {
      const kf = await getKnowledgeFile(docId);
      if (!kf?.path) { toast.error("No file attached"); return; }
      const url = await getFileDownloadUrl(kf.path);
      window.open(url, "_blank");
    } catch {
      toast.error("Download failed");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const projectNameMap = new Map((projects.data ?? []).map(p => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground">
            All documents stored in Supabase — scoped by project
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Add Knowledge
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filter} onValueChange={v => setFilter(v as KBFilter)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
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
              {(projects.data ?? []).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="secondary" className="text-[10px]">{docs.data?.length ?? 0} docs</Badge>
      </div>

      {/* Docs list */}
      {docs.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" />
        </div>
      ) : docs.data?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No knowledge docs found. Upload files or add text to get started.
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
                      <span className="text-sm font-medium truncate">{doc.title}</span>
                      <Badge variant="outline" className="text-[9px] shrink-0">{doc.source_type}</Badge>
                      {doc.status && doc.status !== "ready" && (
                        <Badge
                          variant={(STATUS_COLORS[doc.status] as any) || "outline"}
                          className="text-[9px]"
                        >
                          {doc.status}
                        </Badge>
                      )}
                      {doc.source_type === "upload" && (
                        <Badge variant="secondary" className="text-[9px] gap-0.5">
                          <FileText className="h-2 w-2" /> File
                        </Badge>
                      )}
                      {doc.project_id ? (
                        <Badge variant="secondary" className="text-[9px]">
                          {projectNameMap.get(doc.project_id) || "Project"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px]">Global</Badge>
                      )}
                    </div>
                    {doc.raw_text && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.raw_text}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5">
                      {doc.tags?.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-[9px]">
                          <Tag className="h-2 w-2 mr-0.5" />{tag}
                        </Badge>
                      ))}
                      {doc.source_url && (
                        <a href={doc.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary flex items-center gap-0.5 hover:underline">
                          <ExternalLink className="h-2.5 w-2.5" /> source
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {doc.source_type === "upload" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-primary"
                        onClick={() => handleDownload(doc.id)}
                        title="Download file"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => removeMutation.mutate(doc.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Knowledge Dialog */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) resetForm(); else setAddOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Knowledge
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* File Upload Zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50"
              }`}
              onClick={() => document.getElementById("kb-page-file-input")?.click()}
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium truncate max-w-[300px]">{selectedFile.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatSize(selectedFile.size)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 ml-2"
                    onClick={e => { e.stopPropagation(); setSelectedFile(null); }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Drop a file here or <span className="text-primary underline">browse</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">PDF, DOCX, TXT, MD, CSV, JSON, HTML</p>
                </div>
              )}
              <input
                id="kb-page-file-input"
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                className="hidden"
                onChange={onFileSelect}
              />
            </div>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-muted" />
              <span className="px-2 text-[10px] text-muted-foreground">or paste text</span>
              <div className="flex-1 border-t border-muted" />
            </div>

            <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <Textarea placeholder="Content / notes / raw text" value={rawText} onChange={e => setRawText(e.target.value)} rows={3} />
            <Input placeholder="Source URL (optional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
            <Input placeholder="Tags (comma-separated)" value={tags} onChange={e => setTags(e.target.value)} />

            {/* Project assignment */}
            <div className="border rounded-md p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Project Assignment</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs gap-1 h-6"
                  onClick={handleSmartSuggest}
                  disabled={suggestLoading || (!title.trim() && !rawText.trim())}
                >
                  <Sparkles className="h-3 w-3" />
                  {suggestLoading ? "Analyzing…" : "Smart Suggest"}
                </Button>
              </div>

              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Global (no project)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Global (no project)</SelectItem>
                  {(projects.data ?? []).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {showSuggestion && suggestions.length > 0 && (
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <button
                      key={s.project_id}
                      onClick={() => setSelectedProjectId(s.project_id)}
                      className={`w-full text-left p-2 rounded text-xs border transition-colors ${
                        selectedProjectId === s.project_id
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.project_name}</span>
                        <div className="flex items-center gap-1">
                          <Badge variant={i === 0 ? "default" : "secondary"} className="text-[9px]">
                            {s.confidence}%
                          </Badge>
                          {selectedProjectId === s.project_id && <Check className="h-3 w-3 text-primary" />}
                        </div>
                      </div>
                      <p className="text-muted-foreground text-[10px] mt-0.5">{s.reasons.join(" · ")}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={handleAdd}
              disabled={addMutation.isPending || uploading || (!selectedFile && !title.trim())}
              className="w-full gap-1"
            >
              {uploading ? "Uploading & Processing…" : addMutation.isPending ? "Adding…" : (
                <>
                  {selectedFile ? <Upload className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                  {selectedFile ? "Upload & Process" : "Add Knowledge Doc"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
