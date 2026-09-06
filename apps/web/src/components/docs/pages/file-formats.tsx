import type { Guide } from "../shared";

export const fileFormats = {
  slug: "file-formats",
  title: "File formats and limits",
  description: "Supported source inputs, exported files, and their limits.",
  group: "Reference",
  sections: [
    {
      id: "sources",
      title: "Source inputs",
      body: (
        <>
          <p>Sources accept the following inputs.</p>
          <dl>
            <dt>Document file</dt>
            <dd>
              PDF, DOCX, TXT, or Markdown. Files contain at least one byte and at most 10 MiB. A PDF
              contains at most 100 pages.
            </dd>
            <dt>Pasted text</dt>
            <dd>
              Text entered in the source form. The input field accepts up to 500,000 characters. The
              saved source also has the 10 MiB limit.
            </dd>
            <dt>Owner attestation</dt>
            <dd>
              A firsthand statement entered by the account owner. The source retains its attestation
              label.
            </dd>
            <dt>Source URL</dt>
            <dd>Optional origin metadata. River does not fetch the URL.</dd>
          </dl>
          <p>
            Image ingestion and optical character recognition, or OCR, are not supported. Image-only
            scans do not provide selectable text for extraction.
          </p>
          <p>
            An imported résumé becomes a source. The import does not create a structured résumé
            draft.
          </p>
        </>
      ),
    },
    {
      id: "downloads",
      title: "Export files",
      body: (
        <>
          <p>An exported checkpoint retains these files.</p>
          <dl>
            <dt>PDF</dt>
            <dd>The formatted résumé.</dd>
            <dt>LaTeX source</dt>
            <dd>
              The generated document source in a <code>.tex</code> file.
            </dd>
            <dt>Extracted text</dt>
            <dd>
              The text recovered from the rendered PDF in a <code>.txt</code> file.
            </dd>
            <dt>Validation report</dt>
            <dd>
              The recorded document checks in a <code>.json</code> file.
            </dd>
          </dl>
          <p>DOCX export is not available. DOCX import is supported.</p>
          <p>
            Downloads require access to the account that owns the files. Public documentation does
            not grant access to workspace downloads.
          </p>
        </>
      ),
    },
    {
      id: "retention",
      title: "Originals and historical files",
      body: (
        <>
          <p>
            River preserves original source content and provenance. Each completed extraction has a
            separate identity. An extraction retry does not replace text in existing citations.
          </p>
          <p>
            Draft preview files can expire. Checkpoint files and exported files remain available as
            historical outputs.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
