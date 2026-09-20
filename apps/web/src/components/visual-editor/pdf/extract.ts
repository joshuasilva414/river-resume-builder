import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;
/** Preserve PDF stream order rather than sorting by page coordinates. */
export async function extractPdfText(bytes: ArrayBuffer) {
  const task = getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const document = await task.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .flatMap((item) => ("str" in item ? [item.str, item.hasEOL ? "\n" : " "] : []))
          .join(""),
      );
      page.cleanup();
    }
    return { text: pages.join("\n"), pages: document.numPages };
  } finally {
    await task.destroy();
  }
}
