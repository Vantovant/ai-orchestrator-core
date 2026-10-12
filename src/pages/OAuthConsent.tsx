import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  email: "Share your email address",
  profile: "Share your basic profile",
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("This connection link is missing its request id. Start the connection again from your assistant.");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/signin?next=" + encodeURIComponent(next);
        return;
      }
      setEmail(sess.session.user.email ?? "");
      try {
        const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) return setError("This connection request has expired or is invalid. Start again from your assistant.");
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) { window.location.href = immediate; return; }
        setDetails(data);
      } catch {
        if (active) setError("Could not reach the sign-in service. Please try again.");
      }
    })();
    return () => { active = false; };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve
        ? await oauth().approveAuthorization(authorizationId)
        : await oauth().denyAuthorization(authorizationId);
      if (error) throw new Error(error.message);
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) throw new Error("No return address was provided.");
      window.location.href = target;
    } catch (e) {
      setBusy(false);
      setError(approve ? `Approval failed: ${(e as Error).message}` : `Cancelling failed: ${(e as Error).message}`);
    }
  }

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "An assistant";
  const redirectUri = details?.redirect_uri ?? details?.client?.redirect_uri ?? "";
  const scopes: string[] = String(details?.scope ?? details?.scopes ?? "").split(/[\s,]+/).filter(Boolean);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg space-y-5">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-foreground">Connection not completed</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        ) : !details ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-foreground">Connect {clientName} to VantoOS</h1>
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{email}</span>
            </p>
            {redirectUri && <p className="text-xs text-muted-foreground break-all">Returns to: {redirectUri}</p>}
            <p className="text-sm text-foreground">
              {clientName} will be able to use VantoOS as you — your projects, tasks, calendar, finance, wellness and paper trading.
            </p>
            {scopes.length > 0 && (
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                {scopes.map((s) => <li key={s}>{SCOPE_LABELS[s] ?? `Additional permission requested: ${s}`}</li>)}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              This does not bypass your VantoOS permissions. Risk settings, learning mode and real money stay in your hands.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1 h-11" disabled={busy} onClick={() => decide(true)}>Approve</Button>
              <Button className="flex-1 h-11" variant="outline" disabled={busy} onClick={() => decide(false)}>Cancel connection</Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
