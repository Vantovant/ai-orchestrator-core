import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { section: "Navigation", keys: [
    { key: "J", desc: "Next email" },
    { key: "K", desc: "Previous email" },
    { key: "Enter", desc: "Open email" },
    { key: "Esc", desc: "Back to list" },
  ]},
  { section: "Actions", keys: [
    { key: "E", desc: "Archive" },
    { key: "S", desc: "Snooze (tomorrow 8am)" },
    { key: "R", desc: "Reply (coming soon)" },
  ]},
  { section: "Create", keys: [
    { key: "T", desc: "Create task from email" },
    { key: "M", desc: "Create meeting from email" },
  ]},
  { section: "Global", keys: [
    { key: "Ctrl+K", desc: "Command bar" },
    { key: "/", desc: "Search (coming soon)" },
    { key: "?", desc: "This cheat sheet" },
  ]},
];

export default function CheatSheet({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">⌨️ Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {SHORTCUTS.map(section => (
            <div key={section.section}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{section.section}</h4>
              <div className="space-y-1">
                {section.keys.map(({ key, desc }) => (
                  <div key={key} className="flex items-center justify-between text-sm py-1">
                    <span className="text-muted-foreground">{desc}</span>
                    <kbd className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
