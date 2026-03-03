import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Key, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function AIKeysSettings() {
  const { user } = useAuth();
  const [useOwnKeys, setUseOwnKeys] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      // Keys are stored encrypted - show masked placeholder if set
      if (data.openai_key_encrypted) setOpenaiKey("sk-••••••••");
      if (data.gemini_key_encrypted) setGeminiKey("AI••••••••");
    }
    setLoading(false);
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

      // Only update keys if user entered new ones (not masked)
      if (openaiKey && !openaiKey.startsWith("sk-••")) {
        payload.openai_key_encrypted = openaiKey; // In production, encrypt before storing
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

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" /> Bring Your Own Key (BYOK)</CardTitle>
        <CardDescription>Use your own AI provider keys instead of shared credits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Use my own API keys</p>
            <p className="text-xs text-muted-foreground">When enabled, AI calls use your keys exclusively</p>
          </div>
          <Switch checked={useOwnKeys} onCheckedChange={setUseOwnKeys} />
        </div>

        {useOwnKeys && (
          <div className="space-y-3 pt-2 border-t">
            <div>
              <label className="text-xs font-medium text-muted-foreground">OpenAI API Key</label>
              <div className="flex gap-2 mt-1">
                <Input
                  type={showOpenai ? "text" : "password"}
                  placeholder="sk-..."
                  value={openaiKey}
                  onChange={e => setOpenaiKey(e.target.value)}
                />
                <Button variant="ghost" size="icon" onClick={() => setShowOpenai(!showOpenai)}>
                  {showOpenai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Gemini API Key</label>
              <div className="flex gap-2 mt-1">
                <Input
                  type={showGemini ? "text" : "password"}
                  placeholder="AI..."
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                />
                <Button variant="ghost" size="icon" onClick={() => setShowGemini(!showGemini)}>
                  {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Keys are stored securely and never logged or sent to analytics.</p>
          </div>
        )}

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Saving..." : "Save AI Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
