import type { ResumeDocument, Theme } from "@river/domain";
import type { TemplateGraph } from "@river/templates";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import pagedScript from "../../../node_modules/pagedjs/dist/paged.js?url";
import { ApproximateDocument, approximateStyles } from "./approximate-document";

interface PagedPreviewer {
  preview(
    content: string,
    styles: Record<string, string>[],
    target: HTMLElement,
  ): Promise<{ total: number }>;
  chunker: { destroy(): void };
  polisher: { destroy(): void };
}
type PreviewWindow = Window & { Paged?: { Previewer: new () => PagedPreviewer } };
const frameShell = `<!doctype html><html><head><meta charset="utf-8"><script src="${pagedScript}"></script></head><body><div id="continuous"></div><div id="pages"></div></body></html>`;

/** Pagination stays in its own frame; the current HTML appears before the debounced page layout. */
export function HtmlPreview({
  document,
  theme,
  templateGraph,
}: {
  document: ResumeDocument;
  theme: Theme;
  templateGraph?: TemplateGraph | null;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false),
    [scale, setScale] = useState(1),
    [height, setHeight] = useState(1056);
  const [status, setStatus] = useState("Updating pages…");
  const queue = useRef(Promise.resolve());
  const last = useRef<PagedPreviewer | null>(null);
  const html = useMemo(
    () => renderToStaticMarkup(<ApproximateDocument document={document} />),
    [document],
  );
  const css = useMemo(() => approximateStyles(theme, templateGraph), [theme, templateGraph]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, entry.contentRect.width / 816));
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const window = frame.current?.contentWindow as PreviewWindow | null;
    const doc = window?.document,
      continuous = doc?.getElementById("continuous"),
      pages = doc?.getElementById("pages");
    if (!ready || !doc || !continuous || !pages) return;
    // This markup is produced by React escaping; no custom template source enters this frame.
    continuous.innerHTML = html;
    continuous.style.cssText =
      "display:block;background:white;padding:var(--preview-margin,.65in);width:8.5in;min-height:11in";
    pages.hidden = true;
    let style = doc.getElementById("continuous-style");
    if (!style) {
      style = doc.createElement("style");
      style.id = "continuous-style";
      doc.head.appendChild(style);
    }
    style.textContent = css;
    setHeight(Math.max(1056, continuous.scrollHeight));
    setStatus("Updating pages…");
    let current = true;
    const timer = setTimeout(() => {
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (!current) return;
          const Constructor = window?.Paged?.Previewer;
          if (!Constructor) {
            setStatus("Page layout unavailable. Showing continuous preview.");
            return;
          }
          const staging = doc.createElement("div");
          staging.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;width:816px";
          doc.body.appendChild(staging);
          const previewer = new Constructor();
          try {
            const started = performance.now();
            const result = await previewer.preview(html, [{ [location.href]: css }], staging);
            if (!current) {
              previewer.chunker.destroy();
              previewer.polisher.destroy();
              return;
            }
            last.current?.chunker.destroy();
            last.current?.polisher.destroy();
            last.current = previewer;
            pages.replaceChildren(...Array.from(staging.childNodes));
            pages.hidden = false;
            continuous.style.display = "none";
            setHeight(Math.max(1056, pages.scrollHeight));
            setStatus(`${result.total} ${result.total === 1 ? "page" : "pages"}`);
            frame.current?.setAttribute(
              "data-pagination-ms",
              String(Math.round(performance.now() - started)),
            );
          } catch {
            previewer.chunker.destroy();
            previewer.polisher.destroy();
            if (current) setStatus("Page layout unavailable. Showing continuous preview.");
          } finally {
            staging.remove();
          }
        });
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [ready, html, css]);
  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
      <div ref={viewport} className="relative overflow-hidden" style={{ height: height * scale }}>
        <iframe
          ref={frame}
          title="Approximate résumé preview"
          srcDoc={frameShell}
          onLoad={() => setReady(true)}
          className="absolute top-0 left-0 border-0 bg-white"
          style={{
            width: 816,
            maxWidth: "none",
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </div>
  );
}
