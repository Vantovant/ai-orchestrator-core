import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import vantoosLogo from "@/assets/vantoos-logo.png";
import {
  Home, Eye, EyeOff, ShieldCheck, Lock, Brain, ClipboardList,
  Mail, DollarSign, BookHeart, CheckCircle2, Globe, KeyRound, FileLock2,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI Daily Briefing",
    desc: "Personal morning agenda from your tasks, mail, and calendar.",
  },
  {
    icon: ClipboardList,
    title: "Plan Hub",
    desc: "Tasks, meetings, reminders, and dictation in one console.",
  },
  {
    icon: Mail,
    title: "Email Triage",
    desc: "Gmail-aware inbox with Smart Extract and Handled receipts.",
  },
  {
    icon: DollarSign,
    title: "Finance & Reports",
    desc: "Bank imports, ZAR-native budgets, executive weekly packs.",
  },
  {
    icon: BookHeart,
    title: "Voice Diary",
    desc: "Voice-first capture for reflections and long-term priorities.",
  },
];

const safety = [
  { icon: ShieldCheck, text: "BYOK — your AI keys, your data sovereignty." },
  { icon: Lock, text: "Strict RLS isolation per user; audited receipts." },
  { icon: FileLock2, text: "Context partitioning for Gov, NDA, and Private work." },
  { icon: KeyRound, text: "Invite-only sign-up with role-based access." },
];

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        if (!inviteCode) { toast.error("Invite code required to sign up"); setLoading(false); return; }
        if (!inviteValid) { toast.error("Please enter a valid invite code"); setLoading(false); return; }
        await signUp(email, password);
        localStorage.setItem("vanto_invite_code", inviteCode);
        try {
          const firstName = email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          await fetch("https://wwuenmmocxtwwgylngui.supabase.co/functions/v1/save-prospect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email, first_name: firstName, source: "vantoos_signup",
              sequence_id: "0f23eef6-6c16-4f9f-9357-8a67e358abe2",
            }),
          });
        } catch (seqErr) { console.warn("Onboarding sequence enrollment failed:", seqErr); }
        toast.success("Check your email to confirm your account");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      {/* Top bar */}
      <header className="border-b border-sidebar-accent/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={vantoosLogo} alt="VantoOS" className="h-9 w-auto" />
            <span className="font-bold tracking-tight text-base hidden sm:inline">VantoOS</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors">
            <Home className="h-4 w-4" />
            Back to homepage
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-10 lg:py-16">
        <div className="grid gap-8 lg:gap-10 lg:grid-cols-[1.05fr_1.2fr_1fr]">
          {/* LEFT: pitch + features */}
          <section className="space-y-6">
            <div>
              <Badge variant="outline" className="border-accent/40 text-accent mb-3">
                Executive AI Command Center
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Run your day, your team, and your portfolio — from one console.
              </h1>
              <p className="mt-3 text-sm md:text-base text-sidebar-foreground/70 leading-relaxed">
                VantoOS unifies your tasks, mail, finance, projects, and voice notes
                behind an AI partner that knows your context. Built for executives,
                founders, and operators who refuse to lose minutes to tool-switching.
              </p>
            </div>

            <ul className="space-y-3">
              {features.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="flex items-start gap-3 rounded-xl border border-sidebar-accent/40 bg-sidebar-accent/20 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="text-xs text-sidebar-foreground/70 leading-snug">{desc}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
              <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
              Already serving Prominent SA executives in beta cohort
            </div>
          </section>

          {/* CENTER: sign-in card */}
          <section>
            <div className="rounded-2xl border border-sidebar-accent/50 bg-sidebar-accent/15 p-6 md:p-8 shadow-xl">
              <div className="mb-6">
                <h2 className="text-2xl font-bold">{isLogin ? "Welcome back" : "Create your workspace"}</h2>
                <p className="text-sm text-sidebar-foreground/70 mt-1">
                  {isLogin ? "Sign in to your command center" : "Invite-only — request access from your admin"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-sidebar-foreground/80">Email</label>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-background/5 border-sidebar-accent/50 text-sidebar-foreground placeholder:text-sidebar-foreground/40"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-sidebar-foreground/80">Password</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="bg-background/5 border-sidebar-accent/50 text-sidebar-foreground placeholder:text-sidebar-foreground/40 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-sidebar-foreground/60 hover:text-sidebar-foreground"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {!isLogin && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-sidebar-foreground/80">Invite code</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter your invite code"
                        value={inviteCode}
                        onChange={(e) => { setInviteCode(e.target.value); setInviteValid(null); }}
                        required
                        className="bg-background/5 border-sidebar-accent/50 text-sidebar-foreground"
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
                      <div className="flex items-center gap-2 pt-1">
                        <Badge variant="default" className="text-[10px]">✓ Valid</Badge>
                        {inviteLabel && <span className="text-xs text-sidebar-foreground/70">{inviteLabel}</span>}
                      </div>
                    )}
                    {inviteValid === false && <Badge variant="destructive" className="text-[10px] mt-1">✗ Invalid</Badge>}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
                  disabled={loading || (!isLogin && !inviteValid)}
                >
                  {loading ? "..." : isLogin ? "Sign In" : "Create Account"}
                </Button>

                <div className="flex items-center justify-center gap-1.5 text-xs text-sidebar-foreground/60 pt-1">
                  <Lock className="h-3 w-3" />
                  Access is invite-only. Contact your admin for access.
                </div>
              </form>

              <button
                className="mt-5 w-full text-center text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
                onClick={() => setIsLogin(!isLogin)}
                type="button"
              >
                {isLogin ? "Need an account? Sign up with invite" : "Already have an account? Sign in"}
              </button>
            </div>
          </section>

          {/* RIGHT: safety + global */}
          <aside className="space-y-5">
            <div className="rounded-2xl border border-sidebar-accent/40 bg-sidebar-accent/10 p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-4">Workspace Safety</h3>
              <ul className="space-y-3">
                {safety.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                    <span className="text-sm text-sidebar-foreground/85 leading-snug">{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-sidebar-accent/40 bg-sidebar-accent/10 p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-3">Need Access?</h3>
              <p className="text-sm text-sidebar-foreground/80 leading-relaxed">
                VantoOS is currently invite-only. If you believe you should have access,
                reach out to your VantoOS admin or our team.
              </p>
              <Link to="/contact" className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                <Mail className="h-3.5 w-3.5" />
                Request an invitation
              </Link>
            </div>

            <div className="rounded-2xl border border-sidebar-accent/40 bg-sidebar-accent/10 p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-3">Global Reach</h3>
              <div className="flex items-start gap-2.5">
                <Globe className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                <span className="text-sm text-sidebar-foreground/85 leading-snug">
                  Built in Africa · Designed for executives worldwide · ZAR-native finance
                </span>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
