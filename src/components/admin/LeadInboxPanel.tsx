import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, RefreshCw, CheckCircle2, Phone, Mail, Tag } from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: string;
  created_at: string;
  source: string;
  source_campaign: string | null;
  lead_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  tags: string[];
  reviewed_at: string | null;
}

export default function LeadInboxPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("lead_inbox")
      .select("id, created_at, source, source_campaign, lead_name, phone, email, status, tags, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    else setLeads((data ?? []) as Lead[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markReviewed = async (id: string) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("lead_inbox")
      .update({ status: "reviewed", reviewed_at: new Date().toISOString(), reviewed_by: u.user?.id })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked reviewed");
    load();
  };

  const newCount = leads.filter(l => l.status === "new").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" /> Inbound Lead Inbox
          </h2>
          <p className="text-xs text-muted-foreground">
            Inbound only · No outbound automation · Review &amp; handle manually
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={newCount > 0 ? "default" : "secondary"}>{newCount} new</Badge>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>
      ) : leads.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No inbound leads yet. Webhook endpoint: <code className="text-xs">/functions/v1/facebook-lead-webhook</code>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {leads.map(l => (
            <Card key={l.id} className={l.status === "new" ? "border-primary/40" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">
                      {l.lead_name || "(no name)"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleString()} · {l.source}
                      {l.source_campaign ? ` · ${l.source_campaign}` : ""}
                    </p>
                  </div>
                  <Badge variant={l.status === "new" ? "default" : "secondary"}>{l.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="flex flex-wrap gap-3 text-sm">
                  {l.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {l.phone}</span>}
                  {l.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {l.email}</span>}
                </div>
                {l.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {l.tags.map(t => (
                      <Badge key={t} variant="outline" className="text-[10px] gap-1">
                        <Tag className="h-2.5 w-2.5" /> {t}
                      </Badge>
                    ))}
                  </div>
                )}
                {l.status === "new" && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => markReviewed(l.id)}>
                    <CheckCircle2 className="h-3 w-3" /> Mark reviewed
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
