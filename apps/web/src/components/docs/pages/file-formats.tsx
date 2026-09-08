import { type Guide, GuideLink } from "../shared";

export const fileFormats = {
  slug: "file-formats",
  title: "File formats and limits",
  description: "Supported inputs, job retrieval limits, exported files, and retained history.",
  group: "Reference",
  sections: [
    {
      id: "sources",
      title: "Source inputs",
      body: (
        <>
          <dl>
            <dt>Document file</dt>
            <dd>
              PDF, DOCX, TXT, or Markdown. Files must contain at least one byte and be no larger
              than 10 MiB. PDFs can contain up to 100 pages.
            </dd>
            <dt>Pasted text</dt>
            <dd>
              The source form accepts up to 500,000 characters. The saved source also has the 10 MiB
              limit.
            </dd>
            <dt>Source URL</dt>
            <dd>
              Optional origin information attached to a document or pasted text. This field does not
              retrieve a web page.
            </dd>
            <dt>Earlier attestations</dt>
            <dd>
              Previously saved Owner attestation sources retain their original content and label.
              New firsthand evidence can be saved directly.
            </dd>
          </dl>
          <p>
            Image ingestion and optical character recognition (OCR) are not supported. An image-only
            scan does not provide selectable text for extraction.
          </p>
          <p>
            An imported résumé becomes a source with reviewable evidence. It does not automatically
            become a completed structured résumé.
          </p>
        </>
      ),
    },
    {
      id: "job-imports",
      title: "Job posting inputs",
      body: (
        <>
          <p>
            Import job accepts public HTTP or HTTPS URLs and pasted descriptions of up to 120,000
            characters. Retrieved pages have a 2 MiB response limit and a 120,000-character
            extracted-text limit.
          </p>
          <p>
            Retrieval has bounded redirects and time limits. Local or private destinations, URLs
            with credentials, and unsupported ports are rejected. If the page cannot be read, use
            pasted text. See <GuideLink slug="jobs">Tailor to a job posting</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "downloads",
      title: "Export files",
      body: (
        <>
          <dl>
            <dt>PDF</dt>
            <dd>The formatted résumé.</dd>
            <dt>Extracted text</dt>
            <dd>A plain-text file recovered from the rendered PDF.</dd>
            <dt>LaTeX source</dt>
            <dd>The generated .tex document, available in Advanced tools.</dd>
            <dt>Validation report</dt>
            <dd>
              A JSON file containing the recorded document checks, available in Advanced tools.
            </dd>
          </dl>
          <p>DOCX import is supported. DOCX export is not available.</p>
          <p>
            Downloads require access to the account that owns the files. Public documentation does
            not grant access to private downloads.
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
            Original source content and completed extraction results remain available. A retry does
            not rewrite text referenced by earlier evidence.
          </p>
          <p>
            Working preview files can expire. Captured and exported files remain historical outputs.
            Trash removes items from active use while preserving saved references.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
