import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquareOff, RefreshCw, ShieldOff, Timer } from "lucide-react";
import { toast } from "sonner";

type EventRow = {
  id: string;
  spoke_app_key: string;
  phone_last4: string;
  direction: string;
  campaign_type: string | null;
  status: string;
  sent_at: string;
};

type DncRow = {
  phone_hash: string;
  phone_last4: string;
  reason: string;
  source_spoke: string;
  recorded_at: string;
  cleared_at: string | null;
};

type CooldownRow = {
  event_class: string;
  cooldown_seconds: number;
  notes: string | null;
};

export default function MaytapiHubPage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [dnc, setDnc] = useState<DncRow[]>([]);
  const [cooldowns, setCooldowns] = useState<CooldownRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [user]);

  const load = async () => {
    setLoading(true);
    const [ev, dn, cd] = await Promise.all([
      supabase
        .from("suite_maytapi_events")
        .select("id,spoke_app_key,phone_last4,direction,campaign_type,status,sent_at")
        .order("sent_at", { ascending: false })
        .limit(100),
      supabase
        .from("suite_maytapi_dnc")
        .select("phone_hash,phone_last4,reason,source_spoke,recorded_at,cleared_at")
        .is("cleared_at", null)
        .order("recorded_at", { ascending: false })
        .limit(100),
      supabase
        .from("suite_maytapi_cooldowns")
        .select("event_class,cooldown_seconds,notes")
        .order("event_class"),
    ]);
    setEvents((ev.data as EventRow[]) ?? []);
    setDnc((dn.data as DncRow[]) ?? []);
    setCooldowns((cd.data as CooldownRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const saveCooldown = async (cls: string) => {
    const raw = edits[cls];
    const secs = Number(raw);
    if (!Number.isFinite(secs) || secs < 0) {
      toast.error("Cooldown must be a non-negative number of seconds");
      return;
    }
    const { error } = await supabase
      .from("suite_maytapi_cooldowns")
      .update({ cooldown_seconds: secs })
      .eq("event_class", cls);
    if (error) return toast.error(error.message);
    toast.success(`Updated ${cls} → ${secs}s`);
    setEdits((e) => ({ ...e, [cls]: "" }));
    load();
  };

  if (isAdmin === null) return <div className="p-6"><Skeleton className="h-40" /></div>;
  if (!isAdmin) return <div className="p-6 text-muted-foreground">Admins only.</div>;

  const counts = {
    events: events.length,
    outbound: events.filter((e) => e.direction === "outbound").length,
    dnc: dnc.length,
    spokes: new Set(events.map((e) => e.spoke_app_key)).size,
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Maytapi Hub</h1>
          <p className="text-sm text-muted-foreground">
            Cross-spoke WhatsApp arbitration — DNC, cooldowns, and the shared send ledger.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Recent events" value={counts.events} />
        <StatCard label="Outbound (last 100)" value={counts.outbound} />
        <StatCard label="Active DNC" value={counts.dnc} icon={<ShieldOff className="h-4 w-4" />} />
        <StatCard label="Spokes reporting" value={counts.spokes} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="h-4 w-4" /> Cooldown windows
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {cooldowns.map((c) => (
              <div key={c.event_class} className="flex items-center gap-2 border rounded p-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{c.event_class}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.notes ?? ""}</div>
                </div>
                <div className="text-xs text-muted-foreground w-20 text-right">
                  {c.cooldown_seconds}s
                </div>
                <Input
                  className="h-8 w-24"
                  placeholder="new sec"
                  value={edits[c.event_class] ?? ""}
                  onChange={(e) => setEdits((s) => ({ ...s, [c.event_class]: e.target.value }))}
                />
                <Button size="sm" variant="outline" onClick={() => saveCooldown(c.event_class)}>
                  Save
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareOff className="h-4 w-4" /> Active Do-Not-Contact ({dnc.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dnc.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active DNC entries.</p>
          ) : (
            <div className="space-y-1 text-sm">
              {dnc.slice(0, 50).map((d) => (
                <div key={d.phone_hash} className="flex items-center gap-2 border rounded p-2">
                  <Badge variant="destructive">{d.reason}</Badge>
                  <div className="font-mono text-xs">••••{d.phone_last4}</div>
                  <div className="text-xs text-muted-foreground">via {d.source_spoke}</div>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {new Date(d.recorded_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent send events (last 100)</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events yet. Spokes will populate this after their first <code>send_recorded</code>.
            </p>
          ) : (
            <div className="space-y-1 text-sm max-h-96 overflow-y-auto">
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-2 border rounded p-2">
                  <Badge variant={e.direction === "outbound" ? "default" : "secondary"}>
                    {e.direction}
                  </Badge>
                  <div className="text-xs">{e.spoke_app_key}</div>
                  <div className="font-mono text-xs">••••{e.phone_last4}</div>
                  {e.campaign_type && (
                    <Badge variant="outline" className="text-xs">
                      {e.campaign_type}
                    </Badge>
                  )}
                  <div className="text-xs text-muted-foreground">{e.status}</div>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {new Date(e.sent_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {icon} {label}
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
