import { renderingFixture } from "@river/domain/workspace";
import { useMemo, useState } from "react";
import { PdfPreview } from "~/components/pdf-preview";
import { ImportProof } from "./import-proof";
import { usePdf } from "./use-pdf";
/** Development acceptance fixture. Never writes fictional content to the workspace. */
export default function RenderingProof() {
  const [count, setCount] = useState(3);
  const [name, setName] = useState("Maya Chen");
  const resume = useMemo(() => {
    const document = renderingFixture(count),
      contact = document.sections[0];
    if (contact?.kind === "group")
      contact.children = contact.children.map((field) =>
        field.kind === "field" && field.key === "name"
          ? { ...field, value: { kind: "text", value: [{ text: name }] } }
          : field,
      );
    return document;
  }, [count, name]);
  const pdf = usePdf(resume);
  return (
    <div className="flex flex-col gap-4 p-8">
      <h1 className="font-serif text-3xl">Browser PDF rendering proof</h1>
      <p>
        Fictional data · browser worker · static fonts · links and rich text · text completeness
        check
      </p>
      <label>
        Repeated entries{" "}
        <input
          aria-label="Repeated entries"
          type="number"
          min={1}
          max={40}
          value={count}
          onChange={(event) => setCount(Math.max(1, Math.min(40, Number(event.target.value))))}
        />
      </label>
      <label>
        Fixture name{" "}
        <input
          aria-label="Fixture name"
          maxLength={150}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <p role="status">
        {pdf.pending
          ? "Generating PDF…"
          : pdf.fresh
            ? `${pdf.result?.pages} pages · Text verified`
            : "Preview unavailable"}
      </p>
      {pdf.error && <p role="alert">{pdf.error}</p>}
      <ImportProof pdf={pdf.fresh ? (pdf.result?.blob ?? null) : null} expectedName={name} />
      {pdf.result && (
        <>
          <a href={pdf.result.url} download="river-rendering-proof.pdf">
            Download rendering proof
          </a>
          <div className="max-w-4xl">
            <PdfPreview url={pdf.result.url} blob={pdf.result.blob} />
          </div>
        </>
      )}
    </div>
  );
}
