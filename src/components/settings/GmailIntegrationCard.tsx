import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, RefreshCw, Unplug, ExternalLink, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface GmailAccount {
  id: string;
  email_address: string;
  status: string;
  last_sync_at: string | null;
  label: string | null;
}

export default function GmailIntegrationCard() {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const loadAccounts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("email_accounts")
      .select("id, email_address, status, last_sync_at, label")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    setAccounts((data as GmailAccount[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadAccounts(); }, []);

  const connectGmail = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-auth-start");
      if (error) throw error;
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        throw new Error("No auth URL returned");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to start Gmail connection");
      setConnecting(false);
    }
  };

  const syncAccount = async (accountId: string) => {
    setSyncing(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-sync", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      const result = data?.results?.[0];
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Synced ${result?.synced ?? 0} emails (${result?.skipped ?? 0} skipped)`);
      }
      loadAccounts();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  const disconnectAccount = async (accountId: string) => {
    setDisconnecting(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-disconnect", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      toast.success("Gmail disconnected");
      loadAccounts();
    } catch (e: any) {
      toast.error(e.message || "Failed to disconnect");
    } finally {
      setDisconnecting(null);
    }
  };

  const connectedAccounts = accounts.filter(a => a.status === "connected");
  const needsReconnect = accounts.filter(a => a.status === "reconnect_needed");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" /> Gmail Integration
        </CardTitle>
        <CardDescription className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" /> Read-only access — VantoOS can never send, delete, or modify your emails.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            {/* Connected accounts */}
            {connectedAccounts.map(account => (
              <div key={account.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{account.email_address}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] text-success border-success/30">Connected</Badge>
                      {account.label && <span className="text-[10px] text-muted-foreground">{account.label}</span>}
                      {account.last_sync_at && (
                        <span className="text-[10px] text-muted-foreground">
                          Last sync: {new Date(account.last_sync_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => syncAccount(account.id)} disabled={syncing === account.id} className="gap-1">
                    {syncing === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Sync
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => disconnectAccount(account.id)} disabled={disconnecting === account.id} className="gap-1 text-muted-foreground hover:text-destructive">
                    {disconnecting === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
                    Disconnect
                  </Button>
                </div>
              </div>
            ))}

            {/* Needs reconnect */}
            {needsReconnect.map(account => (
              <div key={account.id} className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-sm font-medium">{account.email_address}</p>
                    <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">Reconnect needed</Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={connectGmail} disabled={connecting}>
                  Reconnect
                </Button>
              </div>
            ))}

            {/* Connect button */}
            <Button variant="outline" size="sm" onClick={connectGmail} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              {connectedAccounts.length > 0 ? "Connect another Gmail" : "Connect Gmail"}
            </Button>

            {connectedAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Native OAuth Gmail module (Read-only) — secure inbox sync for your executive command center.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
