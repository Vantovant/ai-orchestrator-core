import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { knowledgeService, type KnowledgeDoc, type KnowledgeDocInsert } from "@/services/knowledgeService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Plus, Trash2, ExternalLink, Tag, Filter } from "lucide-react";
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

  const docs = useQuery({
    queryKey: ["knowledge_docs", projectId, filter],
    queryFn: () => knowledgeService.list(projectId, filter),
  });

  const addMutation = useMutation({
    mutationFn: (doc: KnowledgeDocInsert) => knowledgeService.create(doc),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge_docs"] });
      toast.success("Knowledge doc added");
      setAddOpen(false);
      setTitle("");
      setRawText("");
      setSourceUrl("");
      setTags("");
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

  const handleAdd = () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    addMutation.mutate({
      title: title.trim(),
      raw_text: rawText.trim(),
      source_url: sourceUrl.trim() || undefined,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      project_id: projectId,
      source_type: "manual",
    });
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
            No knowledge docs yet. Add documents, notes, or captures to build this project's knowledge base.
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
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                  onClick={() => removeMutation.mutate(doc.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Knowledge to {projectName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <Textarea placeholder="Content / notes / raw text" value={rawText} onChange={e => setRawText(e.target.value)} rows={5} />
            <Input placeholder="Source URL (optional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
            <Input placeholder="Tags (comma-separated)" value={tags} onChange={e => setTags(e.target.value)} />
            <Button onClick={handleAdd} disabled={addMutation.isPending} className="w-full">
              {addMutation.isPending ? "Adding…" : "Add Knowledge Doc"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
