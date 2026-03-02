import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fundingCacheService, type FundingEntry } from "@/services/fundingCacheService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Banknote, Search, Loader2, ExternalLink, Calendar,
  CheckCircle2, AlertTriangle, ArrowRight, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const fundingTypes = ["grant", "accelerator", "angel", "vc", "debt", "corporate", "government", "competition"];

interface Props {
  projectId: string;
  projectName: string;
}

export default function FundingPathwaysTab({ projectId, projectName }: Props) {
  const qc = useQueryClient();
  const [searching, setSearching] = useState(false);
  const [region, setRegion] = useState("South Africa");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["grant", "accelerator", "angel"]);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const cached = useQuery({
    queryKey: ["funding_cache", projectId],
    queryFn: () => fundingCacheService.listForProject(projectId),
  });

  const handleSearch = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("project-ai-funding-search", {
        body: { project_id: projectId, region, funding_types: selectedTypes },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      qc.invalidateQueries({ queryKey: ["funding_cache", projectId] });
      toast.success(`Found ${data?.count ?? 0} funding opportunities`);
    } catch (e: any) {
      toast.error(e.message || "Search failed");
    }
    setSearching(false);
  };

  const handleAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("project-ai-partner", {
        body: { project_id: projectId, mode: "funding_pathways" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAiResult(data?.result);
    } catch (e: any) {
      toast.error(e.message || "AI analysis failed");
    }
    setAiLoading(false);
  };

  const toggleType = (t: string) => {
    setSelectedTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  const entries = cached.data ?? [];

  return (
    <div className="space-y-4">
      {/* Search Panel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" /> Search Funding Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Region</label>
            <Input value={region} onChange={e => setRegion(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Funding Types</label>
            <div className="flex flex-wrap gap-1.5">
              {fundingTypes.map(t => (
                <Badge
                  key={t}
                  variant={selectedTypes.includes(t) ? "default" : "outline"}
                  className="text-[10px] cursor-pointer capitalize"
                  onClick={() => toggleType(t)}
                >
                  {t}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="gap-1" onClick={handleSearch} disabled={searching}>
              {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              Search Funding
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleAiAnalysis} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              AI Analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis Result */}
      {aiResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" /> Funding Pathways Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiResult.recommended_types?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">RECOMMENDED FUNDING TYPES</h4>
                <div className="space-y-1.5">
                  {aiResult.recommended_types.map((t: any, i: number) => (
                    <div key={i} className="p-2 rounded-lg bg-muted/30">
                      <p className="text-sm font-medium capitalize">{t.type}</p>
                      <p className="text-xs text-muted-foreground">{t.reason}</p>
                      <p className="text-xs text-primary mt-0.5">→ {t.next_step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiResult.readiness_checklist?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">FUNDING READINESS CHECKLIST</h4>
                <div className="space-y-1">
                  {aiResult.readiness_checklist.map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {item.ready ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                      )}
                      <span>{item.item}</span>
                      {!item.ready && <span className="text-muted-foreground ml-auto text-[10px]">{item.action}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiResult.cached_opportunities?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">VERIFIED OPPORTUNITIES</h4>
                <div className="space-y-1.5">
                  {aiResult.cached_opportunities.map((o: any, i: number) => (
                    <div key={i} className="p-2 rounded-lg bg-muted/30">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{o.org_name}: {o.program_name}</p>
                          <p className="text-xs text-muted-foreground">{o.summary}</p>
                          {o.ticket_size_range && <Badge variant="outline" className="text-[10px] mt-1">{o.ticket_size_range}</Badge>}
                        </div>
                        <a href={o.source_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" />
                        </a>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Source: {o.source_name || "Web"} • Fetched: {o.fetched_at ? format(new Date(o.fetched_at), "MMM d, yyyy") : "Unknown"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!aiResult.cached_opportunities || aiResult.cached_opportunities.length === 0) && (
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-xs text-muted-foreground">No verified funding programs cached yet.</p>
                <p className="text-xs text-primary mt-1">Click "Search Funding" above to discover opportunities.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cached Results */}
      {entries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-success" /> Cached Funding ({entries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {entries.map((entry) => (
              <div key={entry.id} className="p-2 rounded-lg bg-muted/30 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{entry.org_name}: {entry.program_name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{entry.summary}</p>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="outline" className="text-[10px] capitalize">{entry.funding_type}</Badge>
                    {entry.ticket_size_range && <Badge variant="secondary" className="text-[10px]">{entry.ticket_size_range}</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Fetched: {format(new Date(entry.fetched_at), "MMM d, yyyy")}
                  </p>
                </div>
                <a href={entry.source_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <ExternalLink className="h-3.5 w-3.5 text-primary" />
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
