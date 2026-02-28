import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientService, type Client } from "@/services/clientService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface ClientTagPickerProps {
  entityType: string;
  entityId: string;
  compact?: boolean;
}

export default function ClientTagPicker({ entityType, entityId, compact = false }: ClientTagPickerProps) {
  const qc = useQueryClient();
  const clients = useQuery({ queryKey: ["clients"], queryFn: clientService.list });
  const links = useQuery({
    queryKey: ["entity_client_links", entityType, entityId],
    queryFn: () => clientService.getLinksForEntity(entityType, entityId),
  });

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const linkMut = useMutation({
    mutationFn: (clientId: string) => clientService.linkEntity(clientId, entityType, entityId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entity_client_links", entityType, entityId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const unlinkMut = useMutation({
    mutationFn: (clientId: string) => clientService.unlinkEntity(clientId, entityType, entityId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entity_client_links", entityType, entityId] }),
  });

  const createMut = useMutation({
    mutationFn: (name: string) => clientService.create({ name, type: "client" }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      linkMut.mutate(created.id);
      setNewName("");
      toast.success("Client created & linked");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const linkedIds = new Set((links.data ?? []).map((l) => l.client_id));
  const unlinked = (clients.data ?? []).filter((c) => !linkedIds.has(c.id));

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {(links.data ?? []).map((l) => (
          <Badge key={l.id} variant="secondary" className="text-xs gap-1">
            <Tag className="h-2.5 w-2.5" />
            {l.clients?.name}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
          <Tag className="h-3 w-3" />
          {(links.data ?? []).length > 0 ? `${(links.data ?? []).length} client(s)` : "Tag client"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <p className="text-xs font-medium mb-2">Link to Client/Matter</p>
        
        {/* Current links */}
        {(links.data ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {(links.data ?? []).map((l) => (
              <Badge key={l.id} variant="secondary" className="gap-1 text-xs">
                {l.clients?.name}
                <button onClick={() => unlinkMut.mutate(l.client_id)} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Available clients */}
        {unlinked.length > 0 && (
          <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
            {unlinked.map((c) => (
              <button
                key={c.id}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors"
                onClick={() => linkMut.mutate(c.id)}
              >
                {c.name}
                <span className="text-muted-foreground ml-1">({c.type})</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick create */}
        <div className="flex gap-1">
          <Input
            placeholder="New client name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createMut.mutate(newName.trim()); }}
          />
          <Button
            size="sm"
            className="h-7 px-2"
            disabled={!newName.trim() || createMut.isPending}
            onClick={() => createMut.mutate(newName.trim())}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
