/** DEMO ONLY: one history and selection shortcut handler for the canvas, editor, and demo controls. */
import { useEffect } from "react";

type DemoHistoryKey = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "isComposing" | "defaultPrevented"
>;

export function demoHistoryShortcut(event: DemoHistoryKey) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    !(event.metaKey || event.ctrlKey)
  )
    return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

export function demoDeleteShortcut(
  event: DemoHistoryKey & { repeat: boolean },
  editingText: boolean,
) {
  return (
    !editingText &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.repeat &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key === "Backspace" || event.key === "Delete")
  );
}

export function DemoHistoryShortcuts({
  undo,
  redo,
  deleteSelection,
}: {
  undo: () => void;
  redo: () => void;
  deleteSelection: () => void;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const action = demoHistoryShortcut(event);
      const target = event.target;
      // A completed drag can leave focus on the body. Keep shortcuts available there,
      // while leaving River's surrounding navigation and controls alone.
      if (
        !(target instanceof Element) ||
        !(
          target.closest(".demo-visual-editor") ||
          target === document.body ||
          target === document.documentElement
        )
      )
        return;
      const editingText =
        !!target.closest("input, textarea, select") ||
        (target instanceof HTMLElement && target.isContentEditable);
      const remove = demoDeleteShortcut(event, editingText);
      if (!action && !remove) return;
      event.preventDefault();
      event.stopPropagation();
      if (remove) deleteSelection();
      else if (action === "undo") undo();
      else redo();
    };
    // Capture before native text controls or ProseMirror can apply their own history.
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [undo, redo, deleteSelection]);
  return null;
}
