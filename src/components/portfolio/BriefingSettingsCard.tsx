import { useState, useEffect } from "react";
import { portfolioChatService, type BriefingPreferences } from "@/services/portfolioChatService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { toast } from "sonner";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const TIMEZONES = [
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Europe/London",
  "America/New_York",
  "Asia/Dubai",
];

export default function BriefingSettingsCard() {
  const [prefs, setPrefs] = useState<BriefingPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portfolioChatService.getBriefingPrefs().then(p => { setPrefs(p); setLoading(false); });
  }, []);

  const save = async (updates: Partial<BriefingPreferences>) => {
    const merged = { ...prefs, ...updates } as Partial<BriefingPreferences>;
    setPrefs(merged as BriefingPreferences);
    try {
      await portfolioChatService.upsertBriefingPrefs(merged);
      toast.success("Briefing settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) return null;

  const enabled = prefs?.weekly_enabled ?? false;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" /> Weekly Briefing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Enable weekly AI briefing</Label>
          <Switch checked={enabled} onCheckedChange={(v) => save({ weekly_enabled: v })} />
        </div>

        {enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Day</Label>
                <Select value={String(prefs?.weekday ?? 1)} onValueChange={v => save({ weekday: parseInt(v) })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)} className="text-xs">{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Select value={String(prefs?.send_hour ?? 8)} onValueChange={v => save({ send_hour: parseInt(v) })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOURS.map(h => <SelectItem key={h} value={String(h)} className="text-xs">{`${h.toString().padStart(2, "0")}:00`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Timezone</Label>
              <Select value={prefs?.timezone ?? "Africa/Johannesburg"} onValueChange={v => save({ timezone: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => <SelectItem key={tz} value={tz} className="text-xs">{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Channel</Label>
              <Select value={prefs?.delivery_channel ?? "in_app"} onValueChange={v => save({ delivery_channel: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_app" className="text-xs">In-App</SelectItem>
                  <SelectItem value="email" className="text-xs">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
