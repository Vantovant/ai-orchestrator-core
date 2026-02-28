import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contextService } from "@/services/contextService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Settings, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const CONTEXT_CHAR_LIMIT = 500;

const SUGGESTED_KEYS = [
  { key: "role", label: "Your Role", placeholder: "e.g. CEO, VP Engineering" },
  { key: "goal", label: "Current Goal", placeholder: "e.g. Launch product by Q2" },
  { key: "focus", label: "Weekly Focus", placeholder: "e.g. Hiring, fundraising" },
  { key: "priorities", label: "Business Priorities", placeholder: "e.g. Revenue growth, team expansion" },
  { key: "preferences", label: "AI Preferences", placeholder: "e.g. Be concise, focus on actionable items" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const contexts = useQuery({ queryKey: ["executive_context"], queryFn: contextService.list });

  const [open, setOpen] = useState(false);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const upsertMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => contextService.upsert(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executive_context"] });
      setOpen(false);
      setEditKey("");
      setEditValue("");
      setIsEditing(false);
      toast.success("Context saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("executive_context")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executive_context"] });
      toast.success("Context removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (key: string, value: string) => {
    setEditKey(key);
    setEditValue(value);
    setIsEditing(true);
    setOpen(true);
  };

  const openNew = (suggestedKey?: string) => {
    setEditKey(suggestedKey ?? "");
    setEditValue("");
    setIsEditing(false);
    setOpen(true);
  };

  const existingKeys = new Set((contexts.data ?? []).map((c) => c.context_key));
  const missingSuggestions = SUGGESTED_KEYS.filter((s) => !existingKeys.has(s.key));

  const charsRemaining = CONTEXT_CHAR_LIMIT - editValue.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your Executive Context — the AI uses these to personalize your briefings.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Account</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm"><span className="text-muted-foreground">Email:</span> {user?.email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" /> Executive Context
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" onClick={() => openNew()}>
                <Plus className="h-4 w-4" /> Add Context
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Context" : "Add Context"}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editValue.length > CONTEXT_CHAR_LIMIT) {
                    toast.error(`Value must be ${CONTEXT_CHAR_LIMIT} characters or less`);
                    return;
                  }
                  upsertMut.mutate({ key: editKey, value: editValue });
                }}
              >
                <Input
                  placeholder="Key (e.g. role, goal, focus)"
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  required
                  disabled={isEditing}
                />
                <div>
                  <Textarea
                    placeholder="Value"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value.slice(0, CONTEXT_CHAR_LIMIT))}
                    required
                    rows={4}
                    maxLength={CONTEXT_CHAR_LIMIT}
                  />
                  <p className={`text-xs mt-1 text-right ${charsRemaining < 50 ? "text-destructive" : "text-muted-foreground"}`}>
                    {charsRemaining} characters remaining
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={upsertMut.isPending}>
                  {upsertMut.isPending ? "Saving..." : "Save"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {contexts.isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (contexts.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No context set yet. Add your role, goals, and focus so the AI can personalize your briefings.</p>
          ) : (
            <div className="space-y-2">
              {(contexts.data ?? []).map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.context_key}</p>
                    <p className="mt-0.5 text-sm">{c.context_value}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c.context_key, c.context_value)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {missingSuggestions.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Suggested context to add:</p>
              <div className="flex flex-wrap gap-2">
                {missingSuggestions.map((s) => (
                  <Button key={s.key} variant="outline" size="sm" className="text-xs" onClick={() => openNew(s.key)}>
                    + {s.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
