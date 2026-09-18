/** DEMO ONLY: rectangular selection of visible schema fields, with local batch formatting. */
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DemoDragRef } from "./demo-drag";
import type { DemoSelection } from "./demo-editor";
import { type DemoLayouts, type DemoStyle, demoPatchNode } from "./demo-model";

export type DemoSelectionBox = { left: number; top: number; right: number; bottom: number };
export function demoBoxesIntersect(a: DemoSelectionBox, b: DemoSelectionBox) {
  return (
    b.right > b.left &&
    b.bottom > b.top &&
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}
export function demoSameSelection(a: DemoSelection, b: DemoSelection) {
  return (
    a.schemaId === b.schemaId &&
    a.recordId === b.recordId &&
    a.nodeId === b.nodeId &&
    a.itemId === b.itemId
  );
}
/** Apply each shared layout field once, even when multiple preview instances are selected. */
export function demoFormatSelection(
  layouts: DemoLayouts,
  selection: DemoSelection[],
  patch: Partial<DemoStyle>,
): DemoLayouts {
  const next = { ...layouts };
  const seen = new Set<string>();
  for (const item of selection) {
    const key = `${item.schemaId}:${item.nodeId}`;
    const root = next[item.schemaId];
    if (!root || seen.has(key)) continue;
    seen.add(key);
    next[item.schemaId] = demoPatchNode(root, item.nodeId, (node) => ({
      ...node,
      style: { ...node.style, ...patch },
    }));
  }
  return next;
}

export function DemoAreaSelection({
  enabled,
  active,
  selection,
  onSelection,
  drag,
  children,
}: {
  enabled: boolean;
  active: boolean;
  selection: DemoSelection[];
  onSelection: (items: DemoSelection[]) => void;
  drag: DemoDragRef;
  children: ReactNode;
}) {
  const [box, setBox] = useState<DemoSelectionBox | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);
  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      !enabled ||
      event.button !== 0 ||
      !(target instanceof Element) ||
      target.closest("button, input, select, textarea")
    )
      return;
    if (
      (!active && target.closest(".demo-node")) ||
      (event.shiftKey && target.closest('[data-demo-selectable="true"]'))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    drag.current?.();
    const surface = event.currentTarget;
    const pointerId = event.pointerId;
    surface.setPointerCapture(pointerId);
    const origin = { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY };
    let point = { x: event.clientX, y: event.clientY };
    let moved = false;
    let frame = 0;
    let next = selection;
    const before = selection;
    const additive = event.shiftKey;
    const update = () => {
      const start = { x: origin.x - window.scrollX, y: origin.y - window.scrollY };
      const bounds = {
        left: Math.min(start.x, point.x),
        right: Math.max(start.x, point.x),
        top: Math.min(start.y, point.y),
        bottom: Math.max(start.y, point.y),
      };
      setBox(bounds);
      next = additive ? [...before] : [];
      for (const element of surface.querySelectorAll<HTMLElement>(
        '[data-demo-selectable="true"]',
      )) {
        if (!demoBoxesIntersect(bounds, element.getBoundingClientRect())) continue;
        const { demoSchema, demoNode, demoRecord, demoField } = element.dataset;
        if (!demoSchema || !demoNode || !demoRecord) continue;
        const item: DemoSelection = {
          schemaId: demoSchema,
          nodeId: demoNode,
          recordId: demoRecord,
          field: demoField || undefined,
        };
        if (!next.some((existing) => demoSameSelection(existing, item))) next.push(item);
      }
      onSelection(next);
    };
    const scroll = () => {
      const dy = point.y < 42 ? -10 : point.y > window.innerHeight - 42 ? 10 : 0;
      if (dy) {
        window.scrollBy(0, dy);
        update();
      }
      frame = requestAnimationFrame(scroll);
    };
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      point = { x: pointer.clientX, y: pointer.clientY };
      if (
        !moved &&
        Math.hypot(point.x + window.scrollX - origin.x, point.y + window.scrollY - origin.y) < 5
      )
        return;
      if (!moved) {
        moved = true;
        document.documentElement.classList.add("demo-area-dragging");
        frame = requestAnimationFrame(scroll);
      }
      pointer.preventDefault();
      update();
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      setBox(null);
      document.documentElement.classList.remove("demo-area-dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("scroll", update, true);
      if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
      drag.current = null;
      cancelRef.current = null;
    };
    const finish = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      cleanup();
      onSelection(moved ? next : []);
      if (moved) {
        const suppress = (click: MouseEvent) => {
          click.preventDefault();
          click.stopImmediatePropagation();
        };
        window.addEventListener("click", suppress, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", suppress, true), 0);
      }
      surface.focus({ preventScroll: true });
    };
    const cancel = () => {
      cleanup();
      onSelection(before);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    cancelRef.current = cancel;
    drag.current = cancel;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("scroll", update, true);
  };
  return (
    <div
      className={`demo-area-surface ${enabled && active ? "demo-area-active" : ""}`}
      onPointerDownCapture={start}
      tabIndex={-1}
    >
      {children}
      {box && (
        <div
          className="demo-selection-box"
          aria-hidden="true"
          style={{
            left: box.left,
            top: box.top,
            width: box.right - box.left,
            height: box.bottom - box.top,
          }}
        />
      )}
    </div>
  );
}
