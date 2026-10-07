import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { EditorSelection } from "./projection";
export function AreaSelection({
  active,
  enabled,
  selection,
  onSelection,
  children,
}: {
  active: boolean;
  enabled: boolean;
  selection: EditorSelection[];
  onSelection: (items: EditorSelection[]) => void;
  children: ReactNode;
}) {
  const [box, setBox] = useState<{
      left: number;
      top: number;
      width: number;
      height: number;
    } | null>(null),
    cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !enabled ||
      event.button !== 0 ||
      !(event.target instanceof Element) ||
      event.target.closest("button,input,select,textarea,fieldset") ||
      (!active && event.target.closest(".visual-node"))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const surface = event.currentTarget,
      id = event.pointerId,
      origin = { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY },
      previous = selection;
    let moved = false,
      next: EditorSelection[] = [];
    surface.setPointerCapture(id);
    const move = (event: PointerEvent) => {
      if (event.pointerId !== id) return;
      const x = origin.x - window.scrollX,
        y = origin.y - window.scrollY;
      if (!moved && Math.hypot(event.clientX - x, event.clientY - y) < 5) return;
      moved = true;
      const bounds = {
        left: Math.min(x, event.clientX),
        right: Math.max(x, event.clientX),
        top: Math.min(y, event.clientY),
        bottom: Math.max(y, event.clientY),
      };
      setBox({ ...bounds, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top });
      next = event.shiftKey ? [...previous] : [];
      for (const element of surface.querySelectorAll<HTMLElement>(
        '[data-visual-leaf="true"][data-selectable="true"]',
      )) {
        const rect = element.getBoundingClientRect();
        if (
          rect.right <= bounds.left ||
          rect.left >= bounds.right ||
          rect.bottom <= bounds.top ||
          rect.top >= bounds.bottom
        )
          continue;
        const { visualId, layoutId, definitionId, contentId } = element.dataset;
        if (!visualId || !layoutId || !definitionId) continue;
        if (!next.some((item) => item.layoutId === layoutId && item.definitionId === definitionId))
          next.push({ id: visualId, layoutId, definitionId, contentId: contentId ?? "" });
      }
      onSelection(next);
    };
    const cleanup = () => {
      setBox(null);
      if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", abort);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", abort);
      cancel.current = null;
    };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== id) return;
      cleanup();
      if (!moved) onSelection([]);
      else {
        const suppress = (event: MouseEvent) => {
          event.preventDefault();
          event.stopImmediatePropagation();
        };
        window.addEventListener("click", suppress, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", suppress, true), 0);
      }
      surface.focus({ preventScroll: true });
    };
    const abort = () => {
      cleanup();
      onSelection(previous);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        abort();
      }
    };
    cancel.current = abort;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", abort);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", abort);
  };
  return (
    <div
      className={`visual-stage ${enabled && active ? "visual-area-active" : ""}`}
      onPointerDownCapture={start}
      tabIndex={-1}
    >
      {children}
      {box && <div className="visual-selection-box" aria-hidden="true" style={box} />}
    </div>
  );
}
