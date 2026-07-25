import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Contact as ContactIcon, Cloud, Download, Upload, Link2, Loader2, RefreshCw, Search, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";

interface GoogleAccount {
  id: string;
  email_address: string;
  display_name: string | null;
  status: string;
  last_pull_at: string | null;
  last_push_at: string | null;
}

interface GoogleContactRow {
  resource_name: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  organization: string | null;
  title: string | null;
  hub_contact_id: string | null;
}

export default function GoogleContactsPanel({ onImported }: { onImported?: () => void }) {
  const [account, setAccount] = useState<GoogleAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [rows, setRows] = useState<GoogleContactRow[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [totalPeople, setTotalPeople] = useState<number | null>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);

  const loadAccount = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("google_contacts_accounts" as any)
      .select("id, email_address, display_name, status, last_pull_at, last_push_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .eq("status", "connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    setAccount((data as any) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    loadAccount();
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcontacts") === "connected") toast.success("Google Contacts connected ✅");
    if (params.get("gcontacts") === "error") toast.error(`Google Contacts connect failed: ${params.get("code") ?? "unknown"}`);
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-contacts-auth-start");
      if (error) throw error;
      if (data?.auth_url) window.location.href = data.auth_url;
      else throw new Error("No auth URL");
    } catch (e: any) {
      toast.error(e.message || "Failed to start Google Contacts connection");
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!account) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("google-contacts-disconnect", {
        body: { account_id: account.id },
      });
      if (error) throw error;
      toast.success("Google Contacts disconnected");
      setAccount(null);
      setRows([]);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message || "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const loadPage = async (pageToken?: string) => {
    setListingLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const session = (await supabase.auth.getSession()).data.session;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-contacts-list?${params}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      setRows(pageToken ? [...rows, ...(payload.contacts ?? [])] : (payload.contacts ?? []));
      setNextPageToken(payload.nextPageToken ?? null);
      setTotalPeople(payload.totalPeople ?? null);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Google Contacts");
    } finally {
      setListingLoading(false);
    }
  };

  const pullSelected = async () => {
    if (selected.size === 0) { toast.info("Pick contacts to import first"); return; }
    setPulling(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-contacts-pull", {
        body: { resource_names: Array.from(selected) },
      });
      if (error) throw error;
      if ((data as any).error) throw new Error((data as any).error);
      const { imported, updated, skipped } = data as any;
      toast.success(`Imported ${imported}, updated ${updated}, skipped ${skipped}.`);
      setSelected(new Set());
      // Refresh list to reflect new hub links
      await loadPage();
      onImported?.();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setPulling(false);
    }
  };

  const pushAll = async () => {
    setPushing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-contacts-push", { body: {} });
      if (error) throw error;
      if ((data as any).error) throw new Error((data as any).error);
      const { created, updated, failed } = data as any;
      toast.success(`Pushed to ${account?.email_address}: ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ""}.`);
      await loadAccount();
      await loadPage();
    } catch (e: any) {
      toast.error(e.message || "Push failed");
    } finally {
      setPushing(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter(r =>
      r.full_name.toLowerCase().includes(s) ||
      (r.email?.toLowerCase().includes(s) ?? false) ||
      (r.phone?.toLowerCase().includes(s) ?? false) ||
      (r.organization?.toLowerCase().includes(s) ?? false)
    );
  }, [rows, q]);

  const notLinkedIds = filteredRows.filter(r => !r.hub_contact_id).map(r => r.resource_name);
  const allNotLinkedSelected = notLinkedIds.length > 0 && notLinkedIds.every(id => selected.has(id));

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" /> Google Contacts sync
        </CardTitle>
        <CardDescription className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" /> Two-way sync — you choose which Google contacts to pull; everything here is pushed to your Google account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-16" />
        ) : !account ? (
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-4">
            <div className="text-sm text-muted-foreground">
              Connect <strong>vantovant@gmail.com</strong> (or any Google account) to sync contacts both ways.
            </div>
            <Button size="sm" onClick={connect} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Connect Google Contacts
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border p-3 gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Cloud className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">{account.email_address}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Connected</Badge>
                    {account.last_pull_at && <span>Last pull {new Date(account.last_pull_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                    {account.last_push_at && <span>· Last push {new Date(account.last_push_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => loadPage()} disabled={listingLoading} className="gap-1">
                  {listingLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Browse Google
                </Button>
                <Button variant="outline" size="sm" onClick={pushAll} disabled={pushing} className="gap-1">
                  {pushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Push all to Google
                </Button>
                <Button variant="ghost" size="sm" onClick={disconnect} disabled={disconnecting} className="gap-1 text-muted-foreground hover:text-destructive">
                  {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />} Disconnect
                </Button>
              </div>
            </div>

            {rows.length > 0 && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search Google contacts..." className="h-9 pl-7" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Showing {filteredRows.length}{totalPeople ? ` of ${totalPeople.toLocaleString()}` : ""}
                  </div>
                  <label className="text-xs flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={allNotLinkedSelected}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) notLinkedIds.forEach(id => next.add(id));
                        else notLinkedIds.forEach(id => next.delete(id));
                        setSelected(next);
                      }}
                    />
                    Select all unlinked
                  </label>
                  <Button size="sm" onClick={pullSelected} disabled={pulling || selected.size === 0} className="gap-1">
                    {pulling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    Pull {selected.size > 0 ? `${selected.size} ` : ""}to Vantoos
                  </Button>
                </div>

                <div className="max-h-[480px] overflow-y-auto rounded-lg border border-border">
                  {filteredRows.map((r) => {
                    const isSel = selected.has(r.resource_name);
                    const linked = !!r.hub_contact_id;
                    return (
                      <div key={r.resource_name} className={`flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 ${linked ? "bg-muted/20" : ""}`}>
                        <Checkbox
                          checked={isSel}
                          disabled={linked}
                          onCheckedChange={(v) => {
                            const next = new Set(selected);
                            if (v) next.add(r.resource_name); else next.delete(r.resource_name);
                            setSelected(next);
                          }}
                        />
                        <ContactIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{r.full_name || "(No name)"}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.email || "—"}{r.phone ? ` · ${r.phone}` : ""}{r.organization ? ` · ${r.organization}` : ""}
                          </p>
                        </div>
                        {linked && (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shrink-0">
                            In Vantoos
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>

                {nextPageToken && (
                  <div className="flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => loadPage(nextPageToken)} disabled={listingLoading}>
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}

            {rows.length === 0 && !listingLoading && (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Click <strong>Browse Google</strong> to load your Google contacts and pick which to import.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
