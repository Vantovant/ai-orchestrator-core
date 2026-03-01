import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ListTodo, Bell } from "lucide-react";

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onMakeTask: (text: string) => void;
  onMakeReminder: (text: string) => void;
}

export default function NoteSelectionMenu({ textareaRef, onMakeTask, onMakeReminder }: Props) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const text = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
    if (text.length < 3) {
      setShow(false);
      return;
    }
    setSelectedText(text);

    // Position menu above textarea selection area
    const rect = ta.getBoundingClientRect();
    setPos({
      top: rect.top - 40,
      left: rect.left + (rect.width / 2) - 80,
    });
    setShow(true);
  }, [textareaRef]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.addEventListener("mouseup", handleMouseUp);
    ta.addEventListener("touchend", handleMouseUp);
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && e.target !== ta) {
        setShow(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      ta.removeEventListener("mouseup", handleMouseUp);
      ta.removeEventListener("touchend", handleMouseUp);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [textareaRef, handleMouseUp]);

  if (!show) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex gap-1 p-1 rounded-md border bg-popover shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
    >
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-xs h-7"
        onClick={() => {
          onMakeTask(selectedText);
          setShow(false);
        }}
      >
        <ListTodo className="h-3 w-3" /> Task
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-xs h-7"
        onClick={() => {
          onMakeReminder(selectedText);
          setShow(false);
        }}
      >
        <Bell className="h-3 w-3" /> Reminder
      </Button>
    </div>
  );
}
