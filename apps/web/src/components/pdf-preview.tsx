import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

/** Each page is rendered from the authoritative PDF. Zoom never recomposes résumé content. */
export function PdfPreview({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState("fit");
  const [width, setWidth] = useState(600);
  const [attempt, setAttempt] = useState(0);
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
    setDocument(null);
    setPageNumber(1);
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const task = pdfjs.getDocument({ url, withCredentials: true });
      cleanup = () => task.destroy();
      const result = await task.promise;
      if (!disposed) setDocument(result);
    })().catch(() => {
      if (!disposed) setState("error");
    });
    return () => {
      disposed = true;
      void cleanup?.();
    };
  }, [url, attempt]);
  useEffect(() => {
    if (!document) return;
    let disposed = false;
    setState("loading");
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
      target.getContext("2d")?.drawImage(buffer, 0, 0);
      setState("ready");
    })().catch(() => {
      if (!disposed) setState("error");
    });
    return () => {
      disposed = true;
    };
  }, [document, pageNumber, width, zoom]);
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
            className="flex items-center justify-center gap-2 p-8 text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Loading PDF…
          </p>
        )}
        {state === "error" && (
          <Alert variant="destructive">
            <AlertDescription>
              Unable to display this PDF.{" "}
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
          hidden={state !== "ready"}
        />
      </div>
    </div>
  );
}
