import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ParsedTask {
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (tasks: ParsedTask[]) => void;
  isPending?: boolean;
}

export default function ImportWizard({ open, onClose, onImport, isPending }: Props) {
  const [tab, setTab] = useState("csv");
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
  const [csvText, setCsvText] = useState("");
  const [pasteText, setPasteText] = useState("");

  // Column mapping
  const [titleCol, setTitleCol] = useState("0");
  const [statusCol, setStatusCol] = useState("1");
  const [priorityCol, setPriorityCol] = useState("");
  const [dueDateCol, setDueDateCol] = useState("");
  const [completedCol, setCompletedCol] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      parseCSVHeaders(text);
    };
    reader.readAsText(file);
  };

  const parseCSVHeaders = (text: string) => {
    const lines = text.trim().split("\n").map(l => l.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
    if (lines.length < 2) { toast.error("CSV needs at least a header row + 1 data row"); return; }
    setCsvHeaders(lines[0]);
    setCsvRows(lines.slice(1));
    // Auto-detect columns
    const h = lines[0].map(h => h.toLowerCase());
    const findCol = (keywords: string[]) => {
      const idx = h.findIndex(col => keywords.some(k => col.includes(k)));
      return idx >= 0 ? String(idx) : "";
    };
    setTitleCol(findCol(["title", "name", "task"]));
    setStatusCol(findCol(["status", "state"]));
    setPriorityCol(findCol(["priority", "prio"]));
    setDueDateCol(findCol(["due", "deadline"]));
    setCompletedCol(findCol(["completed", "done_at", "completed_at"]));
  };

  const previewCSV = () => {
    if (!titleCol) { toast.error("Title column is required"); return; }
    const tasks: ParsedTask[] = csvRows.map(row => {
      const status = statusCol ? normalizeStatus(row[parseInt(statusCol)] || "") : "todo";
      const completedStr = completedCol ? row[parseInt(completedCol)] || null : null;
      return {
        title: row[parseInt(titleCol)] || "Untitled",
        status,
        priority: priorityCol ? normalizePriority(row[parseInt(priorityCol)] || "") : "medium",
        due_date: dueDateCol ? parseDate(row[parseInt(dueDateCol)]) : null,
        start_date: null,
        completed_at: status === "done" ? (completedStr ? parseDate(completedStr) || new Date().toISOString() : new Date().toISOString()) : null,
      };
    }).filter(t => t.title && t.title !== "Untitled");
    setParsedTasks(tasks);
  };

  const handleSmartPaste = () => {
    const lines = pasteText.trim().split("\n").filter(l => l.trim());
    const tasks: ParsedTask[] = lines.map((line, i) => {
      const cleaned = line.replace(/^[-•*\d.)\]]\s*/, "").trim();
      const isDone = /\[x\]|✅|done|completed/i.test(line);
      return {
        title: cleaned.replace(/\[x\]|✅|\[done\]|\[completed\]/gi, "").trim(),
        status: isDone ? "done" : "todo",
        priority: "medium",
        due_date: null,
        start_date: null,
        completed_at: isDone ? new Date().toISOString() : null,
      };
    }).filter(t => t.title);
    setParsedTasks(tasks);
  };

  const normalizeStatus = (s: string): string => {
    const lower = s.toLowerCase().trim();
    if (["done", "complete", "completed", "closed"].includes(lower)) return "done";
    if (["doing", "in progress", "in_progress", "wip"].includes(lower)) return "doing";
    if (["blocked", "stuck"].includes(lower)) return "blocked";
    return "todo";
  };

  const normalizePriority = (s: string): string => {
    const lower = s.toLowerCase().trim();
    if (["high", "p1", "urgent", "critical"].includes(lower)) return "high";
    if (["low", "p3", "nice to have"].includes(lower)) return "low";
    return "medium";
  };

  const parseDate = (s: string | undefined): string | null => {
    if (!s) return null;
    try {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
    } catch { return null; }
  };

  const doneTasks = parsedTasks.filter(t => t.status === "done").length;
  const totalTasks = parsedTasks.length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Import Tasks
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="csv" className="gap-1 flex-1"><FileText className="h-3.5 w-3.5" /> CSV Upload</TabsTrigger>
            <TabsTrigger value="paste" className="gap-1 flex-1"><Sparkles className="h-3.5 w-3.5" /> Smart Paste</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-3">
            <Input type="file" accept=".csv,.txt" onChange={handleFileUpload} />
            {csvHeaders.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Column Mapping ({csvRows.length} rows detected)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Title *</label>
                    <Select value={titleCol} onValueChange={setTitleCol}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Status</label>
                    <Select value={statusCol} onValueChange={setStatusCol}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Priority</label>
                    <Select value={priorityCol} onValueChange={setPriorityCol}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Due Date</label>
                    <Select value={dueDateCol} onValueChange={setDueDateCol}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Completed At</label>
                    <Select value={completedCol} onValueChange={setCompletedCol}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button size="sm" onClick={previewCSV}>Preview Import</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="paste" className="space-y-3">
            <Textarea
              placeholder={"Paste task lines here...\n- Design landing page\n- [x] Set up database\n- Write API docs\n- [x] Deploy v1"}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
            <Button size="sm" onClick={handleSmartPaste} disabled={!pasteText.trim()}>Parse Tasks</Button>
          </TabsContent>
        </Tabs>

        {/* Preview */}
        {parsedTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Preview: {totalTasks} tasks</span>
              <Badge variant="secondary" className="text-xs">{doneTasks} done</Badge>
              <Badge variant="outline" className="text-xs">{totalTasks - doneTasks} open</Badge>
              {totalTasks > 0 && (
                <Badge variant="default" className="text-xs">{Math.round((doneTasks / totalTasks) * 100)}% complete</Badge>
              )}
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Title</TableHead>
                    <TableHead className="text-xs w-20">Status</TableHead>
                    <TableHead className="text-xs w-20">Priority</TableHead>
                    <TableHead className="text-xs w-24">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedTasks.slice(0, 20).map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">
                        {t.status === "done" && <CheckCircle2 className="h-3 w-3 text-success inline mr-1" />}
                        {t.title}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{t.status}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{t.priority}</Badge></TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{t.due_date || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button className="w-full" onClick={() => onImport(parsedTasks)} disabled={isPending}>
              {isPending ? "Importing..." : `Import ${totalTasks} Tasks`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
