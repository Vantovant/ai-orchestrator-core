import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contactService, type HubContactWithLinks } from "@/services/contactService";
import ContactDrawer from "@/components/contacts/ContactDrawer";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Contact, Search, Mail, Phone, MessageCircle, Link2, Smartphone, ShieldAlert, Pencil, RefreshCw, Users, CheckCircle2, AlertCircle, Sparkles, Activity, Layers, Tag as TagIcon, TrendingUp } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";


export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [appFilter, setAppFilter] = useState<string>("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState<HubContactWithLinks | null>(null);
  const queryClient = useQueryClient();

  const contacts = useQuery({
    queryKey: ["hub-contacts", { includeDeleted: showDeleted }],
    queryFn: () => contactService.list({ includeDeleted: showDeleted }),
  });

  const apps = useQuery({ queryKey: ["suite-apps"], queryFn: () => contactService.listApps() });

  const syncMutation = useMutation({
    mutationFn: () => contactService.syncNow(),
    onSuccess: (results) => {
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      if (failed === 0) {
        toast.success(`Sync sent to ${ok} connected app${ok === 1 ? "" : "s"}. Spokes will pull latest contacts on their next cycle.`, { duration: 5000 });
      } else {
        toast.error(`${failed} app${failed === 1 ? "" : "s"} failed to receive sync. ${ok} succeeded.`, { duration: 6000 });
      }
      results.forEach((r) => {
        if (!r.ok) toast.error(`${r.app_key}: ${r.error}`);
      });
      queryClient.invalidateQueries({ queryKey: ["hub-contacts"] });
    },
    onError: (err) => {
      toast.error(`Sync failed: ${(err as Error).message}`);
    },
  });

  const seedMutation = useMutation({
    mutationFn: (app_key: string) => contactService.seedSpoke(app_key),
    onSuccess: (r, app_key) => {
      if (r.ok) {
        toast.success(`Seeded ${r.delivered.toLocaleString()} contacts to ${app_key} (scanned ${r.scanned}).`, { duration: 6000 });
      } else {
        toast.error(`Seed to ${app_key} partial/failed: delivered ${r.delivered}/${r.sent}. ${r.error ?? ""}`.trim(), { duration: 8000 });
      }
      queryClient.invalidateQueries({ queryKey: ["hub-contacts"] });
    },
    onError: (err) => toast.error(`Seed failed: ${(err as Error).message}`),
  });


  const filtered = useMemo(() => {
    let list = contacts.data ?? [];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.full_name.toLowerCase().includes(s) ||
          (c.email?.toLowerCase().includes(s) ?? false) ||
          (c.phone_e164?.toLowerCase().includes(s) ?? false) ||
          c.tags.some((t) => t.toLowerCase().includes(s))
      );
    }
    if (appFilter !== "all") {
      const match = (k: string) => k === appFilter || (appFilter === "getwell_hub" && k === "vanto_crm");
      list = list.filter(
        (c) => match(c.source_app ?? "") || c.hub_contact_links.some((l) => match(l.app_key))
      );
    }
    return list;
  }, [contacts.data, search, appFilter]);

  // vanto_crm and getwell_hub share the same runtime — surface only getwell_hub in the UI.
  const activeApps = useMemo(() => {
    return (apps.data ?? []).filter((a) => a.role === "spoke" && a.app_key !== "vanto_crm");
  }, [apps.data]);

  const stats = useMemo(() => {
    const all = contacts.data ?? [];
    const live = all.filter((c) => !c.is_deleted);
    const total = live.length;
    const withEmail = live.filter((c) => !!c.email).length;
    const withPhone = live.filter((c) => !!c.phone_e164).length;
    const emailConsent = live.filter((c) => c.consent_email).length;
    const waConsent = live.filter((c) => c.consent_whatsapp).length;
    const smsConsent = live.filter((c) => c.consent_sms).length;
    const multiApp = live.filter((c) => (c.hub_contact_links?.length ?? 0) > 1).length;
    const needsAttention = live.filter((c) => c.name_needs_confirmation || !c.full_name || c.full_name.toLowerCase().startsWith("unnamed")).length;
    const deleted = all.length - live.length;

    // per-app breakdown (source_app + linked apps combined); fold vanto_crm into getwell_hub.
    const alias = (k: string) => (k === "vanto_crm" ? "getwell_hub" : k);
    const perApp = new Map<string, number>();
    for (const c of live) {
      const keys = new Set<string>();
      if (c.source_app) keys.add(alias(c.source_app));
      for (const l of c.hub_contact_links ?? []) keys.add(alias(l.app_key));
      for (const k of keys) perApp.set(k, (perApp.get(k) ?? 0) + 1);
    }


    // tag frequency
    const tagCounts = new Map<string, number>();
    for (const c of live) for (const t of c.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const topTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // last sync
    const syncTimes = live.map((c) => c.last_synced_at).filter(Boolean) as string[];
    const lastSyncAt = syncTimes.sort().slice(-1)[0] ?? null;

    // recent activity (updated in last 7d)
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const recent = live.filter((c) => new Date(c.updated_at).getTime() > weekAgo).length;

    return { total, withEmail, withPhone, emailConsent, waConsent, smsConsent, multiApp, needsAttention, deleted, perApp, topTags, lastSyncAt, recent };
  }, [contacts.data]);

  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Contact className="h-6 w-6 text-primary" /> Unified Contacts
          </h1>
          <p className="text-sm text-muted-foreground">
            The single source of truth. {stats.total.toLocaleString()} contacts unified across {activeApps.length} connected app{activeApps.length === 1 ? "" : "s"}
            {stats.lastSyncAt ? ` · last sync ${formatDistanceToNow(new Date(stats.lastSyncAt), { addSuffix: true })}` : ""}.
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          size="sm"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync now"}
        </Button>
      </div>

      {/* Hero stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
          <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-primary/20 blur-2xl" aria-hidden />
          <CardContent className="p-4 relative">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary/80">
              <Users className="h-3.5 w-3.5" /> Total contacts
            </div>
            <div className="mt-2 text-3xl font-bold text-foreground">{stats.total.toLocaleString()}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {stats.multiApp.toLocaleString()} linked across multiple apps
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Mail className="h-3.5 w-3.5" /> Reachable by email
            </div>
            <div className="mt-2 text-3xl font-bold">{stats.withEmail.toLocaleString()}</div>
            <div className="mt-2 space-y-1">
              <Progress value={pct(stats.withEmail)} className="h-1.5" />
              <div className="text-xs text-muted-foreground">{pct(stats.withEmail)}% of contacts · {stats.emailConsent.toLocaleString()} opted-in</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> Reachable by phone
            </div>
            <div className="mt-2 text-3xl font-bold">{stats.withPhone.toLocaleString()}</div>
            <div className="mt-2 space-y-1">
              <Progress value={pct(stats.withPhone)} className="h-1.5" />
              <div className="text-xs text-muted-foreground">
                {pct(stats.withPhone)}% · {stats.waConsent.toLocaleString()} WhatsApp · {stats.smsConsent.toLocaleString()} SMS
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-border/60 ${stats.needsAttention > 0 ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              {stats.needsAttention > 0 ? <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
              Needs attention
            </div>
            <div className="mt-2 text-3xl font-bold">{stats.needsAttention.toLocaleString()}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {stats.needsAttention === 0 ? "All contacts clean" : "Unnamed or unconfirmed names"}
              {stats.deleted > 0 ? ` · ${stats.deleted} in trash` : ""}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-app coverage + top tags */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Layers className="h-4 w-4 text-primary" /> Coverage by connected app
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3" /> {stats.recent.toLocaleString()} updated this week
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeApps.length === 0 && (
              <p className="text-sm text-muted-foreground">No connected apps yet.</p>
            )}
            {activeApps.map((app) => {
              const count = stats.perApp.get(app.app_key) ?? 0;
              const seeding = seedMutation.isPending && seedMutation.variables === app.app_key;
              return (
                <div key={app.app_key} className="w-full">
                  <div className="flex items-center justify-between text-sm gap-2">
                    <button
                      type="button"
                      onClick={() => setAppFilter(app.app_key)}
                      className="flex-1 text-left font-medium capitalize hover:text-primary transition-colors"
                    >
                      {app.name}
                    </button>
                    <span className="text-muted-foreground tabular-nums text-xs">
                      {count.toLocaleString()} ({pct(count)}%)
                    </span>
                    {count === 0 && stats.total > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        disabled={seedMutation.isPending}
                        onClick={(e) => { e.stopPropagation(); seedMutation.mutate(app.app_key); }}
                      >
                        {seeding ? "Seeding…" : "Seed"}
                      </Button>
                    )}
                  </div>
                  <Progress value={pct(count)} className="h-2 mt-1" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TagIcon className="h-4 w-4 text-primary" /> Top tags
            </div>
          </CardHeader>
          <CardContent>
            {stats.topTags.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tags yet — tag contacts to segment them.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {stats.topTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSearch(tag)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs hover:border-primary/50 hover:bg-primary/10 transition-colors"
                  >
                    <span className="font-medium">{tag}</span>
                    <span className="text-muted-foreground tabular-nums">{count}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-border/40 flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              <span>Hub is source of truth — edits propagate to all spokes.</span>
            </div>
          </CardContent>
        </Card>
      </div>




      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone or tag..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={appFilter} onValueChange={setAppFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All apps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All apps</SelectItem>
                  {activeApps.map((app) => (
                    <SelectItem key={app.app_key} value={app.app_key}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={showDeleted ? "default" : "outline"}
                size="sm"
                onClick={() => setShowDeleted((v) => !v)}
              >
                Deleted
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contacts.isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {contacts.isError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Could not load contacts</p>
                <p className="text-muted-foreground">{(contacts.error as Error)?.message}</p>
              </div>
            </div>
          )}

          {!contacts.isLoading && !contacts.isError && filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Contact className="mx-auto h-8 w-8 mb-3 opacity-40" />
              <p>No contacts found.</p>
              <p className="text-xs">Contacts pushed from connected suite apps will appear here.</p>
            </div>
          )}

          {!contacts.isLoading && filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setEditing(c)}
                  className={`w-full text-left flex flex-col gap-3 rounded-lg border border-border/60 p-4 transition-colors hover:bg-muted/40 hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between ${
                    c.is_deleted ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{c.full_name}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {c.contact_type}
                      </Badge>
                      {c.is_deleted && <Badge variant="destructive" className="text-xs">Deleted</Badge>}
                      <Pencil className="h-3 w-3 text-muted-foreground ml-auto sm:hidden" />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {c.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" /> {c.email}
                        </span>
                      )}
                      {c.phone_e164 && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" /> {c.phone_e164}
                        </span>
                      )}
                      {c.last_synced_at && (
                        <span className="text-xs">Synced {format(new Date(c.last_synced_at), "dd MMM yyyy HH:mm")}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="flex items-center gap-1.5">
                      {c.consent_email && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Mail className="h-3 w-3" /> Email
                        </Badge>
                      )}
                      {c.consent_whatsapp && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <MessageCircle className="h-3 w-3" /> WhatsApp
                        </Badge>
                      )}
                      {c.consent_sms && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Smartphone className="h-3 w-3" /> SMS
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {c.hub_contact_links.map((link, i) => (
                        <Badge key={link.id ?? `${link.app_key}-${i}`} variant="outline" className="text-[10px] gap-1 capitalize">
                          <Link2 className="h-3 w-3" /> {link.app_key === "vanto_crm" ? "getwell_hub" : link.app_key}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground">Source: {c.source_app === "vanto_crm" ? "getwell_hub" : c.source_app}</span>

                    </div>
                    {c.unsubscribed_channels.length > 0 && (
                      <div className="text-xs text-destructive">
                        Unsubscribed: {c.unsubscribed_channels.join(", ")}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ContactDrawer contact={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
