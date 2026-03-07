import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, FileJson, FileText, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportService, importService } from "@/services/exportImportService";

type Format = "csv" | "json";

export default function ExportImportCard() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [format, setFormat] = useState<Format>("json");
  const fileRef = useRef<HTMLInputElement>(null);
  const [importTarget, setImportTarget] = useState<string>("tasks");

  const doExport = async (entity: string) => {
    setExporting(entity);
    try {
      let count: number | Record<string, number>;
      switch (entity) {
        case "tasks": count = await exportService.exportTasks(format); break;
        case "meetings": count = await exportService.exportMeetings(format); break;
        case "reminders": count = await exportService.exportReminders(format); break;
        case "notes": count = await exportService.exportNotes(format); break;
        case "knowledge": count = await exportService.exportKnowledge(format); break;
        case "bundle": count = await exportService.exportFullBundle(); break;
        default: return;
      }
      const label = typeof count === "number" ? `${count} rows` : Object.entries(count).map(([k, v]) => `${v} ${k}`).join(", ");
      toast.success(`Exported ${label}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const isJson = file.name.endsWith(".json");

      // Check if it's a full bundle
      if (isJson) {
        const parsed = importService.parseJSON(text);
        if (parsed.version && parsed.tasks) {
          // It's a workspace bundle
          const results = await importService.importBundle(parsed);
          const summary = Object.entries(results)
            .map(([k, v]) => `${k}: ${v.created} new, ${v.updated} updated`)
            .join("\n");
          toast.success(`Bundle imported:\n${summary}`);
          return;
        }
        // It's a single-entity JSON array
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const result = await doImportRows(rows);
        toast.success(`Imported: ${result.created} created, ${result.updated} updated`);
      } else {
        // CSV
        const rows = importService.parseCSV(text);
        const result = await doImportRows(rows);
        toast.success(`Imported: ${result.created} created, ${result.updated} updated`);
      }
    } catch (e: any) {
      toast.error(`Import failed: ${e.message}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doImportRows = async (rows: Record<string, any>[]) => {
    switch (importTarget) {
      case "tasks": return importService.importTasks(rows);
      case "meetings": return importService.importMeetings(rows);
      case "reminders": return importService.importReminders(rows);
      case "notes": return importService.importNotes(rows);
      case "knowledge": return importService.importKnowledge(rows);
      default: throw new Error("Unknown import target");
    }
  };

  const ExportBtn = ({ entity, label, icon: Icon }: { entity: string; label: string; icon: any }) => (
    <Button
      variant="outline"
      size="sm"
      className="text-xs gap-1.5"
      disabled={!!exporting}
      onClick={() => doExport(entity)}
    >
      {exporting === entity ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
      {label}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="h-4 w-4" /> Export & Import
        </CardTitle>
        <CardDescription>Export your workspace data or import from external systems. Imports are idempotent (no duplicates).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Format selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Export format:</span>
          <Select value={format} onValueChange={v => setFormat(v as Format)}>
            <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Export buttons */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Export</p>
          <div className="flex flex-wrap gap-2">
            <ExportBtn entity="tasks" label="Tasks" icon={FileJson} />
            <ExportBtn entity="meetings" label="Meetings" icon={FileJson} />
            <ExportBtn entity="reminders" label="Reminders" icon={FileJson} />
            <ExportBtn entity="notes" label="Plan Notes" icon={FileText} />
            <ExportBtn entity="knowledge" label="Knowledge Docs" icon={FileText} />
            <ExportBtn entity="bundle" label="Full Workspace Bundle" icon={Package} />
          </div>
        </div>

        {/* Import */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Import</p>
          <div className="flex items-center gap-2">
            <Select value={importTarget} onValueChange={setImportTarget}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tasks">Tasks</SelectItem>
                <SelectItem value="meetings">Meetings</SelectItem>
                <SelectItem value="reminders">Reminders</SelectItem>
                <SelectItem value="notes">Plan Notes</SelectItem>
                <SelectItem value="knowledge">Knowledge Docs</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {importing ? "Importing…" : "Import File"}
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.json" className="hidden" onChange={handleImportFile} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Accepts CSV or JSON. Full workspace bundles (JSON) are auto-detected and import all entities at once.
            <Badge variant="secondary" className="ml-1 text-[9px]">Idempotent upsert</Badge>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
