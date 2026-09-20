import type { ExtractedSource } from "@river/domain/workspace";
import { extractPdfText } from "~/components/visual-editor/pdf/extract";
export type ParsedFile = {
  text: string;
  mime: ExtractedSource["mime"];
  parser: string;
  parserVersion: string;
  original: File;
  warnings: string[];
};
/** Parsing stays in the active browser. Mammoth output is text, never unsanitized HTML. */
export async function parseCandidateFile(file: File): Promise<ParsedFile> {
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw Error("Choose a file between 1 byte and 10 MiB.");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  let parsed: Omit<ParsedFile, "original">;
  if (extension === "pdf") {
    const extracted = await extractPdfText(await file.arrayBuffer());
    parsed = {
      text: extracted.text,
      mime: "application/pdf",
      parser: "pdfjs-browser",
      parserVersion: "6.3.289",
      warnings: extracted.text.trim()
        ? []
        : [
            "This PDF has no extractable text. Paste the text below to continue. Scanned documents need OCR outside River.",
          ],
    };
  } else if (extension === "docx") {
    const mammoth = await import("mammoth");
    const extracted = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    parsed = {
      text: extracted.value,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      parser: "mammoth-browser",
      parserVersion: "1.12.2",
      warnings: extracted.messages.map((message) => message.message),
    };
  } else if (["txt", "md", "markdown"].includes(extension ?? "")) {
    parsed = {
      text: new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()),
      mime: extension === "txt" ? "text/plain" : "text/markdown",
      parser: "text-browser",
      parserVersion: "1",
      warnings: [],
    };
  } else throw Error("Choose a PDF, DOCX, TXT, or Markdown file.");
  if (parsed.text.length > 500000)
    throw Error(
      "This document exceeds the 500,000-character source limit. Split it into smaller documents.",
    );
  return { ...parsed, original: file };
}
export async function fileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
