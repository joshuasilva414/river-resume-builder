import { type Resume, validateRenderedText } from "@river/domain/workspace";
import { useEffect, useRef, useState } from "react";
import { extractPdfText } from "./extract";
import type { RenderRequest, RenderResponse } from "./render.worker";
export type GeneratedPdf = {
  blob: Blob;
  url: string;
  text: string;
  pages: number;
  input: Resume;
  inputKey: string;
  renderer: string;
  fonts: string;
  warnings: string[];
};
export function usePdf(resume: Resume | null) {
  const [result, setResult] = useState<GeneratedPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const latest = useRef<string | null>(null);
  const requests = useRef(new Map<string, Resume>());
  const inputKey = resume ? JSON.stringify(resume) : null;
  useEffect(() => {
    const worker = new Worker(new URL("./render.worker.tsx", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = async ({ data }: MessageEvent<RenderResponse>) => {
      const input = requests.current.get(data.id);
      requests.current.delete(data.id);
      if (!input || latest.current !== data.id) return;
      if (!data.ok) {
        setError(data.error);
        setPending(false);
        return;
      }
      try {
        const extracted = await extractPdfText(data.bytes);
        if (latest.current !== data.id) return;
        const checked = validateRenderedText(data.expectedText, extracted.text);
        if (!checked.ok)
          throw new Error(
            "PDF text does not match the visible document. The previous preview is retained; this result cannot be exported.",
          );
        const blob = new Blob([data.bytes], { type: "application/pdf" });
        setResult({
          blob,
          url: URL.createObjectURL(blob),
          text: extracted.text,
          pages: extracted.pages,
          input,
          inputKey: JSON.stringify(input),
          renderer: data.renderer,
          fonts: data.fonts,
          warnings: data.warnings,
        });
        setError(null);
      } catch (error) {
        if (latest.current === data.id)
          setError(error instanceof Error ? error.message : "Unable to read the generated PDF.");
      } finally {
        if (latest.current === data.id) setPending(false);
      }
    };
    worker.onerror = (event) => {
      console.error("PDF worker:", event.message, event.filename);
      setError("The PDF worker stopped. Reload to restart it; your draft is preserved.");
      setPending(false);
    };
    return () => {
      latest.current = null;
      worker.terminate();
      workerRef.current = null;
      requests.current.clear();
    };
  }, []);
  useEffect(() => {
    // Invalidate immediately, including the debounce window and an in-flight text check.
    latest.current = null;
    if (!inputKey) {
      setPending(false);
      return;
    }
    setPending(true);
    const frozen: Resume = JSON.parse(inputKey);
    const timeout = setTimeout(() => {
      const id = crypto.randomUUID();
      latest.current = id;
      requests.current.clear();
      requests.current.set(id, frozen);
      const request: RenderRequest = { id, resume: frozen };
      workerRef.current?.postMessage(request);
    }, 350);
    return () => clearTimeout(timeout);
  }, [inputKey]);
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  return {
    result,
    pending,
    error,
    fresh: !!result && result.inputKey === inputKey && !pending && !error,
  };
}
