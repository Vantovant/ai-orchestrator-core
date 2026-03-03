import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accomplishmentService, type AccomplishmentInsert } from "@/services/accomplishmentService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy, Plus, ExternalLink, Trash2, Milestone, Package, Brain, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const CATEGORY_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  milestone: { icon: Milestone, color: "text-primary", label: "Milestone" },
  deliverable: { icon: Package, color: "text-success", label: "Deliverable" },
  decision: { icon: Brain, color: "text-warning", label: "Decision" },
  meeting_outcome: { icon: Users, color: "text-accent-foreground", label: "Meeting Outcome" },
};

interface Props {
  projectId: string;
  limit?: number;
  showAll?: boolean;
}

export default function AccomplishmentsSection({ projectId, limit, showAll = false }: Props) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("milestone");
  const [details, setDetails] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [happenedAt, setHappenedAt] = useState(format(new Date(), "yyyy-MM-dd"));

  const accomplishments = useQuery({
    queryKey: ["accomplishments", projectId],
    queryFn: () => accomplishmentService.list(projectId),
  });

  const createMut = useMutation({
    mutationFn: (input: AccomplishmentInsert) => accomplishmentService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accomplishments", projectId] });
      setAddOpen(false);
      resetForm();
      toast.success("Accomplishment recorded!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => accomplishmentService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accomplishments", projectId] });
      toast.success("Removed");
    },
  });

  const resetForm = () => {
    setTitle("");
    setCategory("milestone");
    setDetails("");
    setLinkUrl("");
    setHappenedAt(format(new Date(), "yyyy-MM-dd"));
  };

  const items = accomplishments.data ?? [];
  const displayed = limit ? items.slice(0, limit) : items;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          Accomplishments {items.length > 0 && `(${items.length})`}
        </h3>
        <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {displayed.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No accomplishments recorded yet. Document your wins!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayed.map(a => {
            const catConfig = CATEGORY_CONFIG[a.category] || CATEGORY_CONFIG.milestone;
            const CatIcon = catConfig.icon;
            return (
              <Card key={a.id}>
                <CardContent className="p-3 flex items-start gap-3">
                  <CatIcon className={`h-4 w-4 mt-0.5 shrink-0 ${catConfig.color}`} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{a.title}</span>
                      <Badge variant="outline" className="text-[10px]">{catConfig.label}</Badge>
                    </div>
                    {a.details && <p className="text-xs text-muted-foreground">{a.details}</p>}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{format(new Date(a.happened_at), "MMM d, yyyy")}</span>
                      {a.link_url && (
                        <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                          <ExternalLink className="h-3 w-3" /> Evidence
                        </a>
                      )}
                    </div>
                  </div>
                  {showAll && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => removeMut.mutate(a.id)}>
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {limit && items.length > limit && (
            <p className="text-xs text-muted-foreground text-center">+ {items.length - limit} more</p>
          )}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Accomplishment</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={e => {
            e.preventDefault();
            createMut.mutate({
              project_id: projectId,
              title,
              category,
              details: details || undefined,
              link_url: linkUrl || undefined,
              happened_at: new Date(happenedAt).toISOString(),
            });
          }}>
            <Input placeholder="What was accomplished?" value={title} onChange={e => setTitle(e.target.value)} required />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="milestone">Milestone</SelectItem>
                <SelectItem value="deliverable">Deliverable</SelectItem>
                <SelectItem value="decision">Decision</SelectItem>
                <SelectItem value="meeting_outcome">Meeting Outcome</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={happenedAt} onChange={e => setHappenedAt(e.target.value)} />
            <Textarea placeholder="Details (optional)" value={details} onChange={e => setDetails(e.target.value)} rows={2} />
            <Input placeholder="Evidence link (optional)" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} type="url" />
            <Button type="submit" className="w-full" disabled={createMut.isPending}>
              {createMut.isPending ? "Saving..." : "Record Accomplishment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
