import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Sparkles, CheckCircle2, FileJson, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { taskImportService, type ImportedTask } from "@/services/taskImportService";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (tasks: ImportedTask[]) => void;
  isPending?: boolean;
}

export default function ImportWizard({ open, onClose, onImport, isPending }: Props) {
  const [tab, setTab] = useState("file");
  const [parsedTasks, setParsedTasks] = useState<ImportedTask[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"csv" | "json" | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setParseError(null);
    const reader = new FileReader();
    
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const isJSON = file.name.endsWith(".json") || text.trim().startsWith("{") || text.trim().startsWith("[");
      
      try {
        let tasks: ImportedTask[];
        if (isJSON) {
          tasks = taskImportService.parseJSON(text);
          setFileType("json");
        } else {
          tasks = taskImportService.parseCSV(text);
          setFileType("csv");
        }
        setParsedTasks(tasks);
        if (tasks.length === 0) {
          setParseError("No valid tasks found in file");
        }
      } catch (err: any) {
        setParseError(err.message || "Failed to parse file");
        setParsedTasks([]);
      }
    };
    
    reader.readAsText(file);
  };

  const handleSmartPaste = () => {
    setParseError(null);
    const text = pasteText.trim();
    
    // Try to detect if it's JSON
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        const tasks = taskImportService.parseJSON(text);
        setParsedTasks(tasks);
        setFileType("json");
        return;
      } catch {
        // Not valid JSON, continue with line parsing
      }
    }
    
    // Parse as plain text lines
    const lines = text.split("\n").filter(l => l.trim());
    const tasks: ImportedTask[] = lines.map((line, i) => {
      const cleaned = line.replace(/^[-•*\d.)\]]\s*/, "").trim();
      const isDone = /\[x\]|✅|done|completed/i.test(line);
      return {
        title: cleaned.replace(/\[x\]|✅|\[done\]|\[completed\]/gi, "").trim(),
        status: isDone ? "done" : "todo",
        priority: "medium",
        due_date: null,
        start_date: null,
        completed_at: isDone ? new Date().toISOString() : null,
        sort_index: i,
      };
    }).filter(t => t.title);
    
    setParsedTasks(tasks);
    setFileType(null);
  };

  const resetState = () => {
    setParsedTasks([]);
    setPasteText("");
    setParseError(null);
    setFileType(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const doneTasks = parsedTasks.filter(t => t.status === "done").length;
  const totalTasks = parsedTasks.length;
  const hasDedupeInfo = parsedTasks.some(t => t.dedupe_key || t.external_id || t.id);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Import Tasks
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v); resetState(); }}>
          <TabsList className="w-full">
            <TabsTrigger value="file" className="gap-1 flex-1"><FileText className="h-3.5 w-3.5" /> File Upload</TabsTrigger>
            <TabsTrigger value="paste" className="gap-1 flex-1"><Sparkles className="h-3.5 w-3.5" /> Smart Paste</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Upload a CSV or JSON file. Supports VantoOS export format with automatic upsert (updates existing tasks, creates new ones).
              </p>
              <Input type="file" accept=".csv,.json,.txt" onChange={handleFileUpload} />
              {fileType && (
                <Badge variant="outline" className="text-xs gap-1">
                  <FileJson className="h-3 w-3" />
                  Detected: {fileType.toUpperCase()}
                </Badge>
              )}
            </div>
          </TabsContent>

          <TabsContent value="paste" className="space-y-3">
            <Textarea
              placeholder={"Paste task lines or JSON here...\n- Design landing page\n- [x] Set up database\n- Write API docs\n- [x] Deploy v1"}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
            <Button size="sm" onClick={handleSmartPaste} disabled={!pasteText.trim()}>Parse Tasks</Button>
          </TabsContent>
        </Tabs>

        {/* Error */}
        {parseError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {parseError}
          </div>
        )}

        {/* Preview */}
        {parsedTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">Preview: {totalTasks} tasks</span>
              <Badge variant="secondary" className="text-xs">{doneTasks} done</Badge>
              <Badge variant="outline" className="text-xs">{totalTasks - doneTasks} open</Badge>
              {totalTasks > 0 && (
                <Badge variant="default" className="text-xs">{Math.round((doneTasks / totalTasks) * 100)}% complete</Badge>
              )}
              {hasDedupeInfo && (
                <Badge variant="outline" className="text-xs gap-1 text-primary border-primary/30">
                  <CheckCircle2 className="h-3 w-3" /> Upsert enabled
                </Badge>
              )}
            </div>
            
            {hasDedupeInfo && (
              <p className="text-xs text-muted-foreground">
                This import contains task IDs — existing tasks will be updated, new tasks will be created.
              </p>
            )}
            
            <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-8">#</TableHead>
                    <TableHead className="text-xs">Title</TableHead>
                    <TableHead className="text-xs w-20">Status</TableHead>
                    <TableHead className="text-xs w-20">Priority</TableHead>
                    <TableHead className="text-xs w-24">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedTasks.slice(0, 20).map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[10px] text-muted-foreground">{t.sort_index ?? i}</TableCell>
                      <TableCell className="text-xs">
                        {t.status === "done" && <CheckCircle2 className="h-3 w-3 text-success inline mr-1" />}
                        <span className={t.status === "done" ? "line-through text-muted-foreground" : ""}>{t.title}</span>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{t.status}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{t.priority}</Badge></TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{t.due_date || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedTasks.length > 20 && (
                <div className="text-center py-2 text-xs text-muted-foreground bg-muted/30">
                  ... and {parsedTasks.length - 20} more tasks
                </div>
              )}
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
