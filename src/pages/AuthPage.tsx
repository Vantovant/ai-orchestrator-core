import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import vantoosLogo from "@/assets/vantoos-logo.png";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [inviteLabel, setInviteLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);

  const validateInvite = async (code: string) => {
    if (!code || code.length < 4) { setInviteValid(null); return; }
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-check", {
        body: { action: "validate", token: code },
      });
      if (error) throw error;
      setInviteValid(data.valid);
      setInviteLabel(data.label || "");
      if (!data.valid) toast.error(data.error || "Invalid invite code");
    } catch {
      setInviteValid(false);
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        toast.success("Signed in");
      } else {
        // Require invite code for signup
        if (!inviteCode) {
          toast.error("Invite code required to sign up");
          setLoading(false);
          return;
        }
        if (!inviteValid) {
          toast.error("Please enter a valid invite code");
          setLoading(false);
          return;
        }

        await signUp(email, password);

        // After signup, redeem invite (will be done after email confirmation via listener)
        // Store invite code for post-confirmation redemption
        localStorage.setItem("vanto_invite_code", inviteCode);

        toast.success("Check your email to confirm your account");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <img src={vantoosLogo} alt="VantoOS" className="h-12 w-auto mx-auto" />
          <CardDescription>Executive AI Command Center</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

            {!isLogin && (
              <div className="space-y-1">
                <div className="flex gap-2">
                  <Input
                    placeholder="Invite code"
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value);
                      setInviteValid(null);
                    }}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!inviteCode || validating}
                    onClick={() => validateInvite(inviteCode)}
                  >
                    {validating ? "..." : "Verify"}
                  </Button>
                </div>
                {inviteValid === true && (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-[10px]">✓ Valid</Badge>
                    {inviteLabel && <span className="text-xs text-muted-foreground">{inviteLabel}</span>}
                  </div>
                )}
                {inviteValid === false && <Badge variant="destructive" className="text-[10px]">✗ Invalid</Badge>}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading || (!isLogin && !inviteValid)}>
              {loading ? "..." : isLogin ? "Sign In" : "Sign Up"}
            </Button>
          </form>
          <button
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
