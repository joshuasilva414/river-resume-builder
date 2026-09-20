/// <reference lib="webworker" />
import { pdf } from "@react-pdf/renderer";
import { parseResume, type Resume, resolveDocument } from "@river/domain/workspace";
import { ResumePdf, rendererIdentity } from "./document";
import { fontManifest } from "./fonts";
export type RenderRequest = { id: string; resume: Resume };
export type RenderResponse =
  | {
      id: string;
      ok: true;
      bytes: ArrayBuffer;
      expectedText: string[];
      warnings: string[];
      renderer: string;
      fonts: string;
    }
  | { id: string; ok: false; error: string };
// Serial execution prevents concurrent font/layout state from interleaving inside the renderer.
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<RenderRequest>) => {
  queue = queue.then(async () => {
    try {
      const resume = parseResume(data.resume);
      const document = resolveDocument(resume);
      const blob = await pdf(<ResumePdf document={document} title={resume.name} />).toBlob();
      const bytes = await blob.arrayBuffer();
      const response: RenderResponse = {
        id: data.id,
        ok: true,
        bytes,
        expectedText: document.expectedText,
        warnings: document.warnings,
        renderer: rendererIdentity,
        fonts: fontManifest,
      };
      self.postMessage(response, { transfer: [bytes] });
    } catch (error) {
      const response: RenderResponse = {
        id: data.id,
        ok: false,
        error: error instanceof Error ? error.message : "PDF rendering failed.",
      };
      self.postMessage(response);
    }
  });
};
