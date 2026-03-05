import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Key, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

function KeySetupGuide() {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-primary">How to add your AI key</p>
      <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1.5">
        <li>
          <strong>Get your key:</strong>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            <li>OpenAI: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">platform.openai.com <ExternalLink className="h-2.5 w-2.5" /></a> → Create new secret key</li>
            <li>Gemini: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">aistudio.google.com <ExternalLink className="h-2.5 w-2.5" /></a> → Create API key</li>
          </ul>
        </li>
        <li><strong>Paste</strong> into the field below (starts with <code className="bg-muted px-1 rounded text-[10px]">sk-...</code> or <code className="bg-muted px-1 rounded text-[10px]">AI...</code>)</li>
        <li>Click <strong>Test</strong> — you'll see a ✓ Connected badge if valid</li>
        <li>Click <strong>Save AI Settings</strong> — Smart Capture and Assistant will activate immediately</li>
      </ol>
    </div>
  );
}

export default function AIKeysSettings() {
  const { user } = useAuth();
  const [useOwnKeys, setUseOwnKeys] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [openaiStatus, setOpenaiStatus] = useState<"connected" | "missing" | "invalid" | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<"connected" | "missing" | "invalid" | null>(null);

  useEffect(() => {
    if (!user) return;
    loadKeys();
  }, [user]);

  const loadKeys = async () => {
    const { data } = await supabase
      .from("user_ai_keys")
      .select("*")
      .eq("user_id", user!.id)
      .maybeSingle();

    if (data) {
      setUseOwnKeys(data.use_own_keys);
      if (data.openai_key_encrypted) {
        setOpenaiKey("sk-••••••••");
        setOpenaiStatus("connected");
      } else {
        setOpenaiStatus("missing");
      }
      if (data.gemini_key_encrypted) {
        setGeminiKey("AI••••••••");
        setGeminiStatus("connected");
      } else {
        setGeminiStatus("missing");
      }
    } else {
      setOpenaiStatus("missing");
      setGeminiStatus("missing");
    }
    setLoading(false);
  };

  const testKey = async (provider: "openai" | "gemini") => {
    const key = provider === "openai" ? openaiKey : geminiKey;
    if (!key || key.includes("••")) {
      toast.error("Enter a new key before testing");
      return;
    }
    setTesting(provider);
    try {
      const url = provider === "openai"
        ? "https://api.openai.com/v1/models"
        : "https://generativelanguage.googleapis.com/v1beta/models?key=" + key;

      const headers: any = { "Content-Type": "application/json" };
      if (provider === "openai") headers.Authorization = `Bearer ${key}`;

      const res = await fetch(url, { headers });
      if (res.ok) {
        toast.success(`${provider === "openai" ? "OpenAI" : "Gemini"} key is valid ✓`);
        if (provider === "openai") setOpenaiStatus("connected");
        else setGeminiStatus("connected");
      } else {
        toast.error(`${provider === "openai" ? "OpenAI" : "Gemini"} key is invalid — ${res.status}`);
        if (provider === "openai") setOpenaiStatus("invalid");
        else setGeminiStatus("invalid");
      }
    } catch {
      toast.error("Could not validate key — network error");
    } finally {
      setTesting(null);
    }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: any = {
        user_id: user.id,
        use_own_keys: useOwnKeys,
        updated_at: new Date().toISOString(),
      };

      if (openaiKey && !openaiKey.startsWith("sk-••")) {
        payload.openai_key_encrypted = openaiKey;
      }
      if (geminiKey && !geminiKey.startsWith("AI••")) {
        payload.gemini_key_encrypted = geminiKey;
      }

      const { data: existing } = await supabase
        .from("user_ai_keys")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from("user_ai_keys").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("user_ai_keys").insert(payload);
      }

      toast.success("AI key settings saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status: "connected" | "missing" | "invalid" | null) => {
    if (status === "connected") return <Badge variant="outline" className="text-[10px] gap-1 text-success border-success/30"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>;
    if (status === "invalid") return <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-3 w-3" /> Invalid</Badge>;
    return <Badge variant="outline" className="text-[10px] gap-1 text-warning border-warning/30"><AlertTriangle className="h-3 w-3" /> Missing</Badge>;
  };

  if (loading) return null;

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" /> AI Keys (Required)</CardTitle>
        <CardDescription>
          To guarantee data sovereignty, you can connect your personal OpenAI or Gemini key. Your keys are stored securely and never logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Use my own API keys</p>
            <p className="text-xs text-muted-foreground">Required — AI features are blocked without a connected key</p>
          </div>
          <Switch checked={useOwnKeys} onCheckedChange={setUseOwnKeys} />
        </div>

        {useOwnKeys && (
          <div className="space-y-3 pt-2 border-t">
            <KeySetupGuide />
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">OpenAI API Key</label>
                {statusBadge(openaiStatus)}
              </div>
              <div className="flex gap-2">
                <Input
                  type={showOpenai ? "text" : "password"}
                  placeholder="sk-..."
                  value={openaiKey}
                  onChange={e => setOpenaiKey(e.target.value)}
                />
                <Button variant="ghost" size="icon" onClick={() => setShowOpenai(!showOpenai)}>
                  {showOpenai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => testKey("openai")} disabled={testing !== null}>
                  {testing === "openai" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                </Button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">Gemini API Key</label>
                {statusBadge(geminiStatus)}
              </div>
              <div className="flex gap-2">
                <Input
                  type={showGemini ? "text" : "password"}
                  placeholder="AI..."
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                />
                <Button variant="ghost" size="icon" onClick={() => setShowGemini(!showGemini)}>
                  {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => testKey("gemini")} disabled={testing !== null}>
                  {testing === "gemini" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Keys are stored securely server-side and never logged or sent to analytics.</p>
          </div>
        )}

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Saving..." : "Save AI Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
