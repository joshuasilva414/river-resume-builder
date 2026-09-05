import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { promisify, TextDecoder } from "node:util";
import {
  DocumentJob,
  DocumentResources,
  type DocumentResult,
  type ExtractionResult,
} from "@river/contracts";
import { canonicalJson, fingerprint } from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  compose,
  composeGraph,
  expectedText,
  graphInventory,
  RENDERER_VERSION,
  templateInventory,
  validateText,
} from "@river/templates";
import { Schema } from "effect";
import mammoth from "mammoth";

const exec = promisify(execFile);
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 500_000;

async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const { getDocument, version } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
  });
  const document = await task.promise;
  try {
    if (document.numPages > 100) throw new Error("The PDF exceeds the 100-page source limit.");
    let text = "";
    const segments: Array<(typeof ExtractionResult.Type.segments)[number]> = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const pageText = content.items
        .flatMap((item) => ("str" in item ? [item.str + (item.hasEOL ? "\n" : " ")] : []))
        .join("")
        .trim();
      const start = text.length;
      text += `${pageText}\n`;
      segments.push({ text: pageText, start, end: start + pageText.length, page: number });
      if (text.length > MAX_TEXT_CHARS)
        throw new Error("The extracted text exceeds the source limit.");
    }
    return {
      type: "extracted",
      text,
      segments,
      parser: "pdfjs-dist",
      parserVersion: version,
    };
  } finally {
    await task.destroy();
  }
}

export async function processJob(job: DocumentJob): Promise<DocumentResult> {
  if (job.type === "extract-source") {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(job.contentBase64))
      throw new Error("Invalid base64 source.");
    const bytes = Buffer.from(job.contentBase64, "base64");
    if (bytes.length > MAX_SOURCE_BYTES) throw new Error("Source exceeds 10 MiB.");
    if (job.mime === "application/pdf") return extractPdf(bytes);
    const text = job.mime.includes("wordprocessingml")
      ? (await mammoth.extractRawText({ buffer: bytes })).value
      : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.length > MAX_TEXT_CHARS) throw new Error("Extracted text exceeds the source limit.");
    let offset = 0;
    const segments = text.split("\n").map((line, index) => {
      const segment = { text: line, start: offset, end: offset + line.length, line: index + 1 };
      offset += line.length + 1;
      return segment;
    });
    return {
      type: "extracted",
      text,
      segments,
      parser: job.mime.includes("wordprocessingml") ? "mammoth" : "utf8",
      parserVersion: job.mime.includes("wordprocessingml") ? "1.12.2" : "1",
    };
  }
  if (expectedText(job.document).length > 100_000)
    throw new Error("Resume exceeds the 100,000-character limit.");
  if (job.templateGraph && job.templateGraph.theme !== job.theme)
    throw new Error("The graph and selected theme disagree.");
  const templateIdentity = canonicalJson(
    job.templateGraph ? graphInventory(job.templateGraph) : templateInventory(job.theme),
  );
  if (job.templateIdentity && job.templateIdentity !== templateIdentity)
    throw new Error("The pinned template resources are unavailable in this runtime.");
  const started = performance.now();
  const { tex, identity } = job.templateGraph
    ? composeGraph(job.document, job.templateGraph)
    : compose(job.document, job.theme);
  await writeFile("resume.tex", tex, { flag: "wx" });
  const flags = [
    "-X",
    "compile",
    "--untrusted",
    "-Z",
    "deterministic-mode",
    "--keep-logs",
    "--outdir",
    ".",
    "resume.tex",
  ];
  if (process.env.RIVER_BUILD_WARMUP !== "1") flags.splice(3, 0, "--only-cached");
  await exec(process.env.TECTONIC_PATH ?? "tectonic", flags, {
    timeout: process.env.RIVER_BUILD_WARMUP === "1" ? 600_000 : 60_000,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? "/opt/tectonic-cache",
      SOURCE_DATE_EPOCH: "0",
      TECTONIC_UNTRUSTED_MODE: "1",
    },
  });
  const pdf = await readFile("resume.pdf");
  if (pdf.length > 20 * 1024 * 1024) throw new Error("Rendered PDF exceeds 20 MiB.");
  const extracted = await extractPdf(pdf);
  const logSize = await stat("resume.log");
  const log = logSize.size <= 4 * 1024 * 1024 ? await readFile("resume.log", "utf8") : "";
  const overfull = [...log.matchAll(/Overfull \\[hv]box/g)].length;
  const validation = {
    ...validateText(job.document, extracted.text),
    pageCount: extracted.segments.length,
    warnings: [
      ...(extracted.segments.length > 2
        ? [
            `The résumé spans ${extracted.segments.length} pages. Review its length and page breaks.`,
          ]
        : []),
      ...(overfull
        ? [
            `The compiler reported ${overfull} overfull line or page boxes. Review the PDF for clipping.`,
          ]
        : []),
      ...(logSize.size > 4 * 1024 * 1024
        ? ["The layout log exceeds its inspection limit. Review the PDF for clipping."]
        : []),
    ],
  };
  const resources =
    process.env.RIVER_BUILD_WARMUP === "1"
      ? {
          compiler: "tectonic@0.17.0",
          bundle: "build-warmup",
          fonts: "fonts-lmodern@2.005-1",
          cacheDigest: "build-warmup",
        }
      : Schema.decodeUnknownSync(DocumentResources)(
          JSON.parse(await readFile("/app/resources.json", "utf8")),
        );
  return {
    type: "compiled",
    templateIdentity,
    pdfBase64: Buffer.from(pdf).toString("base64"),
    tex,
    extractedText: extracted.text,
    validation,
    fingerprint: await fingerprint(
      canonicalJson({
        identity,
        resources,
        parser: extracted.parser,
        parserVersion: extracted.parserVersion,
        pdf: await fingerprint(pdf),
      }),
    ),
    durationMs: performance.now() - started,
    rendererVersion: job.templateGraph ? CUSTOM_RENDERER_VERSION : RENDERER_VERSION,
    resources,
  };
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (inputPath && outputPath) {
  const job = Schema.decodeUnknownSync(DocumentJob)(JSON.parse(await readFile(inputPath, "utf8")));
  const result = await processJob(job);
  await writeFile(outputPath, JSON.stringify(result), { flag: "wx" });
}
