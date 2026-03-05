import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, RefreshCw, Unplug, ExternalLink, ShieldCheck, Loader2, Inbox, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import GmailFirstRunChecklist from "@/components/settings/GmailFirstRunChecklist";

interface GmailAccount {
  id: string;
  email_address: string;
  status: string;
  last_sync_at: string | null;
  label: string | null;
}

const ERROR_GUIDANCE_403 = `This Google account is blocked from connecting in testing mode.

Fix options:
1. Use a Gmail.com account that has been added as a Test User in the Google Cloud Console → OAuth consent screen → Test users.
2. If using a Workspace account: ask your admin to set the app as Trusted in Admin Console → Security → API controls → App access control.`;

export default function GmailIntegrationCard() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [show403, setShow403] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [hasSyncedEmails, setHasSyncedEmails] = useState(false);

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

    const accs = (data as GmailAccount[]) ?? [];
    setAccounts(accs);
    setLoading(false);

    // Check if any emails exist
    const connected = accs.filter(a => a.status === "connected");
    if (connected.length > 0) {
      const { count } = await supabase
        .from("email_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      setHasSyncedEmails((count ?? 0) > 0);

      // Show first-run if just connected or no emails
      if (localStorage.getItem("vantoos_gmail_firstrun_dismissed") !== "1") {
        if ((count ?? 0) === 0) setShowFirstRun(true);
      }
    }
  };

  useEffect(() => { loadAccounts(); }, []);

  // Show first-run on fresh connect (query param triggers)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected" && localStorage.getItem("vantoos_gmail_firstrun_dismissed") !== "1") {
      setShowFirstRun(true);
    }
    if (params.get("code") === "access_denied") {
      setShow403(true);
    }
  }, []);

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
      if (e.message?.includes("403") || e.message?.includes("access_denied")) {
        setShow403(true);
      }
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
        const count = result?.synced ?? 0;
        toast.success(`Synced ${count} emails ✅`, {
          action: count > 0 ? {
            label: "View Emails",
            onClick: () => navigate("/email"),
          } : undefined,
        });
        setHasSyncedEmails(count > 0 || hasSyncedEmails);
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
    <>
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
                        <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Connected</Badge>
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
                    <Button variant="outline" size="sm" onClick={() => navigate("/email")} className="gap-1">
                      <Inbox className="h-3 w-3" /> View Emails
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

              {/* 403 Error Guidance */}
              {show403 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-medium">Google account blocked in testing mode</p>
                  </div>
                  <p className="text-xs text-muted-foreground">This Google account is blocked from connecting while the app is in testing mode.</p>
                  <div className="text-xs space-y-1">
                    <p className="font-medium">Fix options:</p>
                    <p>1. Use a <strong>Gmail.com</strong> account added as a <strong>Test User</strong> in Google Cloud Console → OAuth consent screen → Test users.</p>
                    <p>2. If Workspace account: ask admin to set the app as <strong>Trusted</strong> in Admin Console → Security → API controls → App access control.</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1 mt-2" onClick={() => { navigator.clipboard.writeText(ERROR_GUIDANCE_403); toast.success("Instructions copied"); }}>
                    <Copy className="h-3 w-3" /> Copy instructions
                  </Button>
                </div>
              )}

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

      {/* First Run Checklist */}
      <GmailFirstRunChecklist
        open={showFirstRun}
        onClose={() => setShowFirstRun(false)}
        hasConnectedAccount={connectedAccounts.length > 0}
        hasSyncedEmails={hasSyncedEmails}
        onSync={() => connectedAccounts[0] && syncAccount(connectedAccounts[0].id)}
        syncing={!!syncing}
      />
    </>
  );
}
