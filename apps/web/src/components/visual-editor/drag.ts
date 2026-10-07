/** Scoped pointer reordering. Reparenting remains an explicit template command. */
import type { PointerEvent as DocumentReactPointerEvent } from "react";

export type DocumentDropPosition = "before" | "after";
export type DocumentDragRef = { current: (() => void) | null };
export type DocumentDragRect = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type DocumentDragTarget = { id: string; label: string; element: HTMLElement };

/** Only the supplied sibling scope can receive a drop; descendants never become implicit targets. */
export function documentDropAtPoint(
  sourceId: string,
  targets: DocumentDragRect[],
  point: { x: number; y: number },
  horizontal = false,
) {
  if (!targets.length) return null;
  const left = Math.min(...targets.map((target) => target.left));
  const right = Math.max(...targets.map((target) => target.right));
  const top = Math.min(...targets.map((target) => target.top));
  const bottom = Math.max(...targets.map((target) => target.bottom));
  if (point.x < left - 24 || point.x > right + 24 || point.y < top - 16 || point.y > bottom + 16)
    return null;
  const coordinate = horizontal ? point.x : point.y;
  const start = (target: DocumentDragRect) => (horizontal ? target.left : target.top);
  const end = (target: DocumentDragRect) => (horizontal ? target.right : target.bottom);
  const target = targets.reduce((best, item) => {
    const distance = (rect: DocumentDragRect) =>
      Math.max(start(rect) - coordinate, coordinate - end(rect), 0);
    return distance(item) < distance(best) ? item : best;
  });
  if (target.id === sourceId) return null;
  const position: DocumentDropPosition =
    coordinate < (start(target) + end(target)) / 2 ? "before" : "after";
  const index = targets.indexOf(target);
  const neighbor = targets[index + (position === "before" ? -1 : 1)];
  const edge =
    position === "before"
      ? neighbor
        ? (end(neighbor) + start(target)) / 2
        : start(target) - 6
      : neighbor
        ? (end(target) + start(neighbor)) / 2
        : end(target) + 6;
  return {
    id: target.id,
    position,
    left: horizontal ? edge : target.left,
    top: horizontal ? target.top : edge,
    width: horizontal ? 3 : target.right - target.left,
    height: horizontal ? target.bottom - target.top : 3,
  };
}

export function documentStartDrag(
  event: DocumentReactPointerEvent<HTMLElement>,
  drag: DocumentDragRef,
  options: {
    sourceId: string;
    source: HTMLElement;
    label: string;
    hint: string;
    horizontal?: boolean;
    targets: () => DocumentDragTarget[];
    select: () => void;
    drop: (targetId: string, position: DocumentDropPosition) => void;
  },
) {
  if (event.button !== 0) return;
  // Claim this gesture before a nested node view or ProseMirror can change its meaning.
  event.preventDefault();
  event.stopPropagation();
  drag.current?.();
  const handle = event.currentTarget;
  const pointerId = event.pointerId;
  const start = { x: event.clientX, y: event.clientY };
  let point = start;
  let moved = false;
  let frame = 0;
  let layer: HTMLDivElement | null = null;
  let ghost: HTMLDivElement | null = null;
  let line: HTMLDivElement | null = null;
  let status: HTMLDivElement | null = null;
  let landing: ReturnType<typeof documentDropAtPoint> = null;
  let ghostWidth = 0;
  handle.setPointerCapture(pointerId);

  const render = () => {
    if (!ghost || !line || !status) return;
    const targets = options
      .targets()
      .filter((target) => target.element.getBoundingClientRect().height > 0);
    landing = documentDropAtPoint(
      options.sourceId,
      targets.map((target) => {
        const { left, right, top, bottom } = target.element.getBoundingClientRect();
        return { id: target.id, left, right, top, bottom };
      }),
      point,
      options.horizontal,
    );
    const target = targets.find((item) => item.id === landing?.id);
    status.textContent =
      landing && target
        ? `${landing.position === "before" ? "Before" : "After"} ${target.label} · Release to move`
        : options.hint;
    ghost.style.left = `${Math.max(8, Math.min(point.x + 20, window.innerWidth - ghostWidth - 8))}px`;
    ghost.style.top = `${Math.max(8, Math.min(point.y + 20, window.innerHeight - Math.min(ghost.offsetHeight, 350) - 8))}px`;
    line.hidden = !landing;
    if (landing)
      Object.assign(line.style, {
        left: `${landing.left}px`,
        top: `${landing.top}px`,
        width: `${landing.width}px`,
        height: `${landing.height}px`,
      });
  };
  const lift = () => {
    moved = true;
    const rect = options.source.getBoundingClientRect();
    ghostWidth = Math.min(rect.width, 460);
    layer = document.createElement("div");
    layer.className = "document-drag-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;
    ghost = document.createElement("div");
    ghost.className = "document-visual-editor document-drag-ghost";
    ghost.style.width = `${ghostWidth}px`;
    const title = document.createElement("div");
    title.className = "document-drag-title";
    title.textContent = options.label;
    const preview = document.createElement("div");
    preview.className = "document-drag-preview";
    const clone = options.source.cloneNode(true);
    if (clone instanceof HTMLElement) {
      clone.querySelectorAll(".visual-node-tools").forEach((element) => {
        element.remove();
      });
      for (const element of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
        element.removeAttribute("id");
        element.removeAttribute("contenteditable");
        element.removeAttribute("tabindex");
        element.classList.remove("visual-selected", "visual-active");
      }
      preview.appendChild(clone);
    }
    status = document.createElement("div");
    status.className = "document-drag-status";
    ghost.appendChild(title);
    ghost.appendChild(preview);
    ghost.appendChild(status);
    line = document.createElement("div");
    line.className = `document-drop-line ${options.horizontal ? "document-drop-line-vertical" : ""}`;
    line.hidden = true;
    layer.appendChild(ghost);
    layer.appendChild(line);
    document.body.appendChild(layer);
    options.source.dataset.documentDragging = "true";
    document.documentElement.classList.add("document-is-dragging");
    options.select();
    render();
    const autoScroll = () => {
      const hovered = document.elementFromPoint(point.x, point.y);
      const panel = hovered?.closest<HTMLElement>(".visual-tree, .visual-inspector");
      const scrollable = panel && panel.scrollHeight > panel.clientHeight ? panel : null;
      const bounds = scrollable?.getBoundingClientRect();
      const top = bounds?.top ?? 0;
      const bottom = bounds?.bottom ?? window.innerHeight;
      const dy = point.y < top + 42 ? -10 : point.y > bottom - 42 ? 10 : 0;
      if (dy) {
        if (scrollable) scrollable.scrollBy(0, dy);
        else window.scrollBy(0, dy);
        render();
      }
      frame = requestAnimationFrame(autoScroll);
    };
    frame = requestAnimationFrame(autoScroll);
  };
  const cleanup = () => {
    cancelAnimationFrame(frame);
    layer?.remove();
    options.source.removeAttribute("data-document-dragging");
    document.documentElement.classList.remove("document-is-dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("scroll", render, true);
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    drag.current = null;
  };
  const onMove = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    point = { x: pointer.clientX, y: pointer.clientY };
    if (!moved && Math.hypot(point.x - start.x, point.y - start.y) > 6) lift();
    if (moved) {
      pointer.preventDefault();
      render();
    }
  };
  const finish = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    point = { x: pointer.clientX, y: pointer.clientY };
    if (moved) render();
    const drop = landing;
    cleanup();
    if (!moved) handle.focus({ preventScroll: true });
    if (moved) {
      // Suppress the click synthesized after pointerup, which could select a child under the drop.
      const suppress = (click: MouseEvent) => {
        click.preventDefault();
        click.stopImmediatePropagation();
      };
      window.addEventListener("click", suppress, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", suppress, true), 0);
      if (drop) options.drop(drop.id, drop.position);
    }
  };
  const cancel = () => cleanup();
  const onKey = (key: KeyboardEvent) => {
    if (key.key === "Escape") {
      key.preventDefault();
      key.stopPropagation();
      cleanup();
    }
  };
  drag.current = cleanup;
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", cancel);
  window.addEventListener("scroll", render, true);
}
