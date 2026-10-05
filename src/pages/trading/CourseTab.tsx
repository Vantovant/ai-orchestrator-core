import { useEffect, useState } from "react";
import { courseService, settingsService, videoAt, type CourseProgress, type TradingSettings } from "@/services/tradingService";
import { LESSONS } from "./courseLessons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Lock, PlayCircle } from "lucide-react";
import { toast } from "sonner";

const fmtTs = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(sec).padStart(2, "0")}`; };

export default function CourseTab({ settings, progress, refresh }: { settings: TradingSettings; progress: CourseProgress[]; refresh: () => void }) {
  const [url, setUrl] = useState(settings.course_video_url ?? "");
  useEffect(() => setUrl(settings.course_video_url ?? ""), [settings.course_video_url]);
  const statusOf = (no: number) => progress.find((p) => p.lesson_no === no)?.status ?? "not_started";

  const saveUrl = async () => {
    try { await settingsService.update({ course_video_url: url.trim() || null }); refresh(); toast.success("Video link saved"); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-2">
        <p className="text-sm font-medium">Paste the course video link</p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input className="h-11" placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button className="h-11" onClick={saveUrl}>Save</Button>
        </div>
        <p className="text-xs text-muted-foreground">Mind Math Money — "AI Trading with Claude & TradingView".</p>
      </CardContent></Card>

      {LESSONS.map((l) => {
        const locked = l.no > 1 && statusOf(l.no - 1) !== "completed";
        const p = progress.find((x) => x.lesson_no === l.no);
        return <LessonCard key={l.no} lesson={l} locked={locked} status={statusOf(l.no)} notes={p?.notes ?? ""} videoUrl={settings.course_video_url ?? ""} refresh={refresh} />;
      })}
    </div>
  );
}

function LessonCard({ lesson, locked, status, notes, videoUrl, refresh }: {
  lesson: typeof LESSONS[number]; locked: boolean; status: CourseProgress["status"]; notes: string; videoUrl: string; refresh: () => void;
}) {
  const [n, setN] = useState(notes);
  useEffect(() => setN(notes), [notes]);
  const upd = async (patch: Partial<CourseProgress>) => {
    try { await courseService.upsert(lesson.no, { status, notes: n, ...patch }); refresh(); } catch (e: any) { toast.error(e.message); }
  };
  const watch = (s: number | null) => {
    if (!videoUrl) return toast.error("Paste the course video link at the top first.");
    window.open(videoAt(videoUrl, s), "_blank", "noopener,noreferrer");
  };

  return (
    <Card className={locked ? "opacity-60" : ""}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Lesson {lesson.no}{lesson.seconds ? ` • ${fmtTs(lesson.seconds)}` : ""}</p>
            <p className="font-medium text-sm">{lesson.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{lesson.goal}</p>
          </div>
          {locked ? <Badge variant="outline" className="gap-1 shrink-0"><Lock className="h-3 w-3" /> Locked</Badge>
            : <Badge variant={status === "completed" ? "default" : "secondary"} className="shrink-0 text-xs">{status.replace("_", " ")}</Badge>}
        </div>
        {!locked && <>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="h-10" onClick={() => watch(lesson.seconds)}><PlayCircle className="h-4 w-4" /> Watch</Button>
            {lesson.altSeconds && <Button size="sm" variant="outline" className="h-10" onClick={() => watch(lesson.altSeconds!)}>Also at {fmtTs(lesson.altSeconds)}</Button>}
            <Select value={status} onValueChange={(v: any) => upd({ status: v })}>
              <SelectTrigger className="h-10 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="not_started">Not started</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><p className="text-xs font-medium">Exercise</p><p className="text-xs text-muted-foreground">{lesson.exercise}</p></div>
          <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between"><p className="text-xs font-medium">Prompt to use</p>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(lesson.prompt); toast.success("Prompt copied"); }}><Copy className="h-3.5 w-3.5" /> Copy</Button>
            </div>
            <p className="text-xs whitespace-pre-wrap">{lesson.prompt}</p>
          </div>
          <Textarea rows={2} placeholder="My notes" value={n} onChange={(e) => setN(e.target.value)} onBlur={() => n !== notes && upd({ notes: n })} />
        </>}
      </CardContent>
    </Card>
  );
}
