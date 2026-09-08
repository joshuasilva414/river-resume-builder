import { type Guide, GuideLink } from "../shared";

export const exportGuide = {
  slug: "export",
  title: "Export a résumé",
  description: "Capture the saved résumé, inspect its PDF and text, and download the files.",
  group: "How-to guides",
  sections: [
    {
      id: "capture",
      title: "Capture the saved résumé",
      body: (
        <>
          <ol>
            <li>
              Resolve any failed save or edit conflict. Wait for <strong>Saved</strong>.
            </li>
            <li>Open the résumé review and capture the current version for export.</li>
            <li>Wait for the saved document to finish rendering.</li>
          </ol>
          <p>
            River calls a captured version a checkpoint in history. If you change the working résumé
            afterward, capture another version to export those changes.
          </p>
        </>
      ),
    },
    {
      id: "inspect",
      title: "Inspect the document",
      body: (
        <>
          <ol>
            <li>
              Read every PDF page. Check contact details, dates, wording, spacing, and page breaks.
            </li>
            <li>Read the extracted text and confirm that expected content is present.</li>
            <li>Inspect the document checks, including any reading-order findings.</li>
            <li>
              Correct blocking errors in the résumé or template, then capture and review the
              corrected version.
            </li>
          </ol>
          <p>
            Compilation errors, unsafe document source, missing text, and unexpected text
            duplication can block export. Reading-order findings help you assess the layout,
            including multiple-column designs.
          </p>
          <p>
            See <GuideLink slug="review-states">Document checks and result status</GuideLink> for
            the difference between errors and information.
          </p>
        </>
      ),
    },
    {
      id: "evidence-issues",
      title: "Review changed information",
      body: (
        <>
          <p>
            If linked evidence or content has changed or moved to Trash, inspect whether the résumé
            wording still reflects the facts you intend to present. These references are
            informational and do not require an acknowledgment to export.
          </p>
          <p>
            Sources are optional. Historical evidence verification states do not block a new export.
            Previously exported documents retain their original reports.
          </p>
        </>
      ),
    },
    {
      id: "download",
      title: "Download the files",
      body: (
        <>
          <ol>
            <li>
              After document checks pass, select <strong>Export checkpoint files</strong>.
            </li>
            <li>
              Wait for <strong>Export complete</strong>.
            </li>
            <li>
              Select <strong>Download PDF</strong>.
            </li>
            <li>
              For a plain-text copy, use <strong>More formats</strong> and download the extracted
              text.
            </li>
          </ol>
          <p>
            LaTeX source and JSON reports are available through Advanced tools. See{" "}
            <GuideLink slug="file-formats">File formats and limits</GuideLink>.
          </p>
          <p>
            To download an earlier export, open its saved version in <strong>History</strong> and
            use the retained download links.
          </p>
        </>
      ),
    },
    {
      id: "scoring",
      title: "Request optional scoring",
      body: (
        <>
          <p>
            Scoring is optional and is not required for export. Follow{" "}
            <GuideLink slug="scoring">Score a résumé</GuideLink> to review the complete inputs and
            request advisory feedback.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
