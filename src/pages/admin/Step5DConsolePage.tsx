import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Approval = {
  id: string;
  approval_status: string;
  approval_title: string;
  reviewed_by: string | null;
  second_reviewed_by: string | null;
  reviewed_at: string | null;
  second_reviewed_at: string | null;
  approver_jwt_subject: string | null;
  second_approver_jwt_subject: string | null;
  expires_at: string;
  created_at: string;
};

const ADMIN_1_UID = "13080719-45d8-482b-bd61-e299215edf49";
const SYLVIA_UID = "31cc5125-5b26-4c20-8e16-b5f69fefe81a";

export default function Step5DConsolePage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isReviewer, setIsReviewer] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role, revoked_at")
        .eq("user_id", user.id);
      const active = (data ?? []).filter((r) => !r.revoked_at);
      setIsAdmin(active.some((r) => r.role === "admin"));
      setIsReviewer(active.some((r) => r.role === "governance_reviewer"));
      setRoleLoading(false);
    })();
  }, [user]);

  const loadApprovals = async () => {
    const { data, error } = await supabase
      .from("vos_approval_requests")
      .select(
        "id, approval_status, approval_title, reviewed_by, second_reviewed_by, reviewed_at, second_reviewed_at, approver_jwt_subject, second_approver_jwt_subject, expires_at, created_at"
      )
      .eq("app_id", "vanto_os_console")
      .eq("approval_type", "internal_note_approval")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      toast.error(error.message);
      return;
    }
    setApprovals((data ?? []) as Approval[]);
  };

  useEffect(() => {
    if (!roleLoading && (isAdmin || isReviewer)) loadApprovals();
  }, [roleLoading, isAdmin, isReviewer]);

  const createRehearsal = async () => {
    setBusy("create");
    const { data, error } = await supabase.rpc("vos_step5d_create_rehearsal");
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rehearsal approval created");
    console.log("Step 5D rehearsal created:", data);
    await loadApprovals();
  };

  const firstReview = async (id: string) => {
    setBusy(id + ":1");
    const { error } = await supabase.rpc("vos_step5d_first_review", { p_approval_id: id });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("First review recorded (Admin 1 key)");
    await loadApprovals();
  };

  const secondReview = async (id: string) => {
    setBusy(id + ":2");
    const { error } = await supabase.rpc("vos_step5d_second_review", { p_approval_id: id });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Second review recorded (governance_reviewer key)");
    await loadApprovals();
  };

  if (roleLoading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  if (!isAdmin && !isReviewer) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Step 5D Two-Key Console</CardTitle>
            <CardDescription>Restricted. Admin or governance_reviewer role required.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const fmtSubject = (s: string | null) => {
    if (!s) return "—";
    if (s === ADMIN_1_UID) return "Admin 1";
    if (s === SYLVIA_UID) return "Sylvia (governance_reviewer)";
    return s.slice(0, 8) + "…";
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Step 5D Two-Key Console</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Internal-only governance rehearsal. Two distinct authenticated humans must perform first and
          second review. No external surface, no CRM note, no flag changes.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Step 5D: COMPLETE</Badge>
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Two-Key Governance: PROVEN</Badge>
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Limited Governance Authority: ACTIVE</Badge>
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Quorum: Admin 1 + Sylvia</Badge>
          <Badge variant="destructive">Axis A Traffic: RED</Badge>
          <Badge variant="destructive">Axis B Inbox: OFF</Badge>
          <Badge variant="destructive">External Automation: LOCKED</Badge>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant={isAdmin ? "default" : "outline"}>Admin: {isAdmin ? "yes" : "no"}</Badge>
          <Badge variant={isReviewer ? "default" : "outline"}>
            Governance Reviewer: {isReviewer ? "yes" : "no"}
          </Badge>
          <Badge variant="outline">You: {user?.email}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Governance proof closed on approval <span className="font-mono">554975d8</span>. Traffic, sends, dispatcher,
          WhatsApp, Email, Zazi, APLGO, Master Prospector, and Phase 4A remain RED/OFF/LOCKED. Step 5E not started.
        </p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Create rehearsal</CardTitle>
            <CardDescription>Admin-only. Creates proposal + dry-run + approval (internal only).</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={createRehearsal} disabled={busy === "create"}>
              {busy === "create" ? "Creating…" : "Create Step 5D rehearsal"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Step 5D rehearsal approvals</CardTitle>
          <CardDescription>Most recent 20.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {approvals.length === 0 && (
            <p className="text-sm text-muted-foreground">No rehearsal approvals yet.</p>
          )}
          {approvals.map((a) => {
            const canFirst = isAdmin && a.approval_status === "requested";
            const canSecond =
              isReviewer &&
              a.approval_status === "reviewed" &&
              a.reviewed_by !== null &&
              a.reviewed_by !== user?.id;
            return (
              <div key={a.id} className="border rounded-md p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{a.approval_title}</div>
                  <Badge variant="outline">{a.approval_status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground font-mono">id: {a.id}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">First reviewer</div>
                    <div>{fmtSubject(a.reviewed_by)}</div>
                    <div className="text-muted-foreground">{a.reviewed_at ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Second reviewer</div>
                    <div>{fmtSubject(a.second_reviewed_by)}</div>
                    <div className="text-muted-foreground">{a.second_reviewed_at ?? "—"}</div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  {canFirst && (
                    <Button
                      size="sm"
                      onClick={() => firstReview(a.id)}
                      disabled={busy === a.id + ":1"}
                    >
                      First review (Admin 1)
                    </Button>
                  )}
                  {canSecond && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => secondReview(a.id)}
                      disabled={busy === a.id + ":2"}
                    >
                      Second review (governance_reviewer)
                    </Button>
                  )}
                  {a.approval_status === "second_reviewed" && (
                    <Badge variant="default">✓ Two-key complete</Badge>
                  )}
                </div>
                {a.approval_status === "requested" && isReviewer && !isAdmin && (
                  <p className="text-xs text-amber-600 pt-1">
                    Waiting on Admin 1 to complete first review. Your "Second review" button will appear here once that's done.
                  </p>
                )}
                {a.approval_status === "reviewed" && isReviewer && a.reviewed_by === user?.id && (
                  <p className="text-xs text-amber-600 pt-1">
                    You performed the first review. A different reviewer must complete second review (two-key rule).
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
