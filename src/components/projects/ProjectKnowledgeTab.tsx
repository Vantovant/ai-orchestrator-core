import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { knowledgeService, suggestProject, type KnowledgeDocInsert, type ProjectSuggestion } from "@/services/knowledgeService";
import { uploadKnowledgeFile, getFileDownloadUrl, getKnowledgeFile, retryIngestion } from "@/services/knowledgeUploadService";
import { ACCEPTED_FILE_TYPES } from "@/lib/fileExtractor";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Plus, Trash2, ExternalLink, Tag, Filter, Sparkles, Check, ArrowRight, Upload, Download, FileText, X, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: string;
  projectName: string;
}

type KBFilter = "project" | "all" | "global";

export default function ProjectKnowledgeTab({ projectId, projectName }: Props) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<KBFilter>("project");
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tags, setTags] = useState("");

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Smart assignment state
  const [suggestions, setSuggestions] = useState<ProjectSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId);
  const [showSuggestion, setShowSuggestion] = useState(false);

  const docs = useQuery({
    queryKey: ["knowledge_docs", projectId, filter],
    queryFn: () => knowledgeService.list(projectId, filter),
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
    setSelectedProjectId(projectId);
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
        toast.info("No strong project match found — keeping current project");
      }
    } catch {
      toast.error("Suggestion failed");
    } finally {
      setSuggestLoading(false);
    }
  };

  // File upload handler
  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
      const result = await uploadKnowledgeFile(
        selectedFile,
        selectedProjectId,
        title.trim() || undefined,
        tagList.length > 0 ? tagList : undefined,
      );
      qc.invalidateQueries({ queryKey: ["knowledge_docs"] });
      if (result.extractionError) {
        toast.warning(`File uploaded but text extraction failed: ${result.extractionError}. You can paste text manually.`);
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
    if (selectedFile) {
      handleFileUpload();
      return;
    }
    if (!title.trim()) { toast.error("Title required"); return; }
    addMutation.mutate({
      title: title.trim(),
      raw_text: rawText.trim(),
      source_url: sourceUrl.trim() || undefined,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      project_id: selectedProjectId,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Project Knowledge</h3>
          <Badge variant="secondary" className="text-[10px]">{docs.data?.length ?? 0} docs</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={v => setFilter(v as KBFilter)}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">This Project</SelectItem>
              <SelectItem value="all">All Projects</SelectItem>
              <SelectItem value="global">Global Only</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      {docs.data?.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No knowledge docs yet. Add documents, notes, or upload files to build this project's knowledge base.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {docs.data?.map(doc => (
          <Card key={doc.id} className="group">
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{doc.title}</span>
                    <Badge variant="outline" className="text-[9px] shrink-0">{doc.source_type}</Badge>
                    {doc.project_id === null && <Badge variant="secondary" className="text-[9px]">Global</Badge>}
                    {doc.source_type === "upload" && (
                      <Badge variant="secondary" className="text-[9px] gap-0.5">
                        <FileText className="h-2 w-2" /> File
                      </Badge>
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

      {/* Add dialog with file upload + smart assignment */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) resetForm(); else setAddOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Knowledge to {projectName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* File Upload Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50"
              }`}
              onClick={() => document.getElementById("kb-file-input")?.click()}
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
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
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
                id="kb-file-input"
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
            <Textarea placeholder="Content / notes / raw text" value={rawText} onChange={e => setRawText(e.target.value)} rows={4} />
            <Input placeholder="Source URL (optional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
            <Input placeholder="Tags (comma-separated)" value={tags} onChange={e => setTags(e.target.value)} />

            {/* Smart project suggestion */}
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

              {showSuggestion && suggestions.length === 0 && (
                <p className="text-[10px] text-muted-foreground">No strong match — will save to current project.</p>
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
