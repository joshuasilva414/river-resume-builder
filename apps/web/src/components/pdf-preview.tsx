import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

/** Each page is rendered from the authoritative PDF. Zoom never recomposes résumé content. */
export function PdfPreview({
  url,
  onDisplayChange,
}: {
  url: string;
  onDisplayChange?: (url: string, displayed: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{ document: PDFDocumentProxy; url: string } | null>(null);
  const document = loaded?.document ?? null;
  const displayChange = useRef(onDisplayChange);
  displayChange.current = onDisplayChange;
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState("fit");
  const [width, setWidth] = useState(600);
  const [attempt, setAttempt] = useState(0);
  const [hasPreview, setHasPreview] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry reloads the same protected artifact URL.
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<void>) | undefined;
    setState("loading");
    displayChange.current?.(url, false);
    setLoaded(null);
    setPageNumber(1);
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const task = pdfjs.getDocument({ url, withCredentials: true });
      cleanup = () => task.destroy();
      const result = await task.promise;
      if (!disposed) setLoaded({ document: result, url });
    })().catch(() => {
      if (!disposed) setState("error");
    });
    return () => {
      disposed = true;
      void cleanup?.();
    };
  }, [url, attempt]);
  useEffect(() => {
    if (!loaded) return;
    const { document, url: renderedUrl } = loaded;
    let disposed = false;
    setState("loading");
    displayChange.current?.(renderedUrl, false);
    void (async () => {
      const page = await document.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1 });
      const scale = zoom === "fit" ? width / natural.width : Number(zoom) / 100;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * density });
      // A separate canvas avoids overlapping PDF.js render tasks when pages change quickly.
      const buffer = window.document.createElement("canvas");
      buffer.width = Math.ceil(viewport.width);
      buffer.height = Math.ceil(viewport.height);
      await page.render({ canvas: buffer, viewport }).promise;
      const target = canvas.current;
      if (disposed || !target) return;
      target.width = buffer.width;
      target.height = buffer.height;
      target.style.width = `${viewport.width / density}px`;
      target.style.height = `${viewport.height / density}px`;
      const context = target.getContext("2d");
      if (!context) throw new Error("PDF canvas is unavailable.");
      context.drawImage(buffer, 0, 0);
      setHasPreview(true);
      setState("ready");
      displayChange.current?.(renderedUrl, true);
    })().catch(() => {
      if (!disposed) setState("error");
    });
    return () => {
      disposed = true;
    };
  }, [loaded, pageNumber, width, zoom]);
  return (
    <div className="space-y-3" ref={container}>
      <fieldset className="flex min-w-0 flex-wrap items-center gap-2" aria-label="PDF controls">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous PDF page"
          disabled={!document || pageNumber <= 1}
          onClick={() => setPageNumber((page) => page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="font-mono text-xs" aria-live="polite">
          Page {pageNumber} of {document?.numPages ?? "…"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next PDF page"
          disabled={!document || pageNumber >= document.numPages}
          onClick={() => setPageNumber((page) => page + 1)}
        >
          <ChevronRight />
        </Button>
        <select
          aria-label="PDF zoom"
          className="ml-auto rounded-sm border bg-background p-2 text-xs"
          value={zoom}
          onChange={(event) => setZoom(event.target.value)}
        >
          <option value="fit">Fit width</option>
          {[50, 75, 100, 125, 150, 200].map((value) => (
            <option key={value} value={value}>
              {value}%
            </option>
          ))}
        </select>
      </fieldset>
      <div className="relative min-h-72 overflow-auto" aria-busy={state === "loading"}>
        {state === "loading" && (
          <p
            role="status"
            className={`flex items-center justify-center gap-2 text-muted-foreground ${hasPreview ? "absolute inset-x-0 top-0 z-10 bg-background/95 p-3 shadow-sm" : "p-8"}`}
          >
            <LoaderCircle className="size-4 animate-spin" />
            {hasPreview ? "Updating PDF preview…" : "Loading PDF…"}
          </p>
        )}
        {state === "error" && (
          <Alert
            variant="destructive"
            className={hasPreview ? "absolute inset-x-0 top-0 z-10 bg-background" : undefined}
          >
            <AlertDescription>
              {hasPreview
                ? "Could not update the PDF. Showing the last successful preview."
                : "Unable to display this PDF."}{" "}
              <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
                Retry PDF
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <canvas
          ref={canvas}
          aria-label={`Resume PDF, page ${pageNumber}`}
          className="mx-auto bg-white shadow-sm"
          hidden={!hasPreview}
        />
      </div>
    </div>
  );
}
