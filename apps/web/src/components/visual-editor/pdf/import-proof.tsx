import { useState } from "react";
import { parseCandidateFile } from "~/components/workspace/browser-import";
import fixtureUrl from "./fixtures/representative.docx?url";

/** DEVELOPMENT ONLY: browser acceptance fixtures, never submitted to Sources or candidate records. */
export function ImportProof({ pdf }: { pdf: Blob | null }) {
  const [results, setResults] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const run = async () => {
    if (!pdf) return;
    setBusy(true);
    setResults([]);
    const checked: string[] = [];
    const check = async (label: string, action: () => Promise<boolean>) => {
      try {
        checked.push(`${(await action()) ? "PASS" : "FAIL"} · ${label}`);
      } catch (error) {
        checked.push(
          `FAIL · ${label}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
      setResults([...checked]);
    };
    const rejected = async (file: File) => {
      try {
        await parseCandidateFile(file);
        return false;
      } catch {
        return true;
      }
    };
    await check("PDF text extraction", async () =>
      (await parseCandidateFile(new File([pdf], "resume.pdf"))).text.includes("Maya Chen"),
    );
    await check("DOCX text, tables and Unicode", async () => {
      const file = new File([await (await fetch(fixtureUrl)).arrayBuffer()], "candidate.docx");
      const parsed = await parseCandidateFile(file);
      return ["Élodie García", "TypeScript", "Fieldnotes", "中文", "Versioned drafts"].every(
        (text) => parsed.text.includes(text),
      );
    });
    for (const extension of ["txt", "md"])
      await check(
        `${extension.toUpperCase()} exact UTF-8 text`,
        async () =>
          (await parseCandidateFile(new File(["Café — 中文\n2024"], `candidate.${extension}`)))
            .text === "Café — 中文\n2024",
      );
    await check("Empty PDF offers text fallback", async () => {
      const parsed = await parseCandidateFile(new File([emptyPdf()], "empty.pdf"));
      return (
        !parsed.text.trim() &&
        parsed.warnings.some((warning) => warning.includes("no extractable text"))
      );
    });
    await check("Malformed PDF rejected", () => rejected(new File(["not a PDF"], "broken.pdf")));
    await check("Malformed DOCX rejected", () => rejected(new File(["not a ZIP"], "broken.docx")));
    await check("Empty file rejected", () => rejected(new File([], "empty.txt")));
    await check("Invalid UTF-8 rejected", () =>
      rejected(new File([new Uint8Array([0xff, 0xfe])], "broken.txt")),
    );
    setBusy(false);
  };
  return (
    <section className="space-y-2 rounded border p-4">
      <h2 className="font-serif text-xl">Browser import acceptance</h2>
      <p className="text-sm">Development fixtures only. No files or facts are saved.</p>
      <button
        type="button"
        className="rounded border px-3 py-2"
        disabled={busy || !pdf}
        onClick={() => void run()}
      >
        {busy ? "Checking parsers…" : "Check PDF, DOCX and text imports"}
      </button>
      <ul role="status">
        {results.map((result) => (
          <li key={result}>{result}</li>
        ))}
      </ul>
    </section>
  );
}
// A valid page without a text stream exercises the same fallback as image-only/scanned pages.
function emptyPdf() {
  let text = "%PDF-1.4\n";
  const offsets = [0];
  [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
  ].forEach((body, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 4\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return text;
}
