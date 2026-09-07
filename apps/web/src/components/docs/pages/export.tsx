import { type Guide, GuideLink } from "../shared";

export const exportGuide = {
  slug: "export",
  title: "Export a résumé",
  description: "Capture the saved draft, review its document and evidence, and download the PDF.",
  group: "How-to guides",
  sections: [
    {
      id: "capture",
      title: "Capture the saved draft",
      body: (
        <>
          <p>Before capture, resolve any failed save or edit conflict.</p>
          <ol>
            <li>Open the résumé draft.</li>
            <li>
              Wait for <strong>Saved</strong>, then select <strong>Review draft</strong>.
            </li>
            <li>
              Select <strong>Capture &amp; review export</strong>.
            </li>
            <li>Wait for the checkpoint document to finish.</li>
          </ol>
          <p>
            If you change the draft after capture, capture another checkpoint to export the revised
            version.
          </p>
        </>
      ),
    },
    {
      id: "inspect",
      title: "Inspect the document",
      body: (
        <>
          <p>Review the exact checkpoint before authorizing export.</p>
          <ol>
            <li>
              Inspect the PDF for incorrect contact details, dates, wording, spacing, and page
              breaks.
            </li>
            <li>Read the extracted text.</li>
            <li>Confirm that the text is complete and in the intended reading order.</li>
            <li>
              Open <strong>Text checks</strong> to confirm that all wording, repeated text, and
              reading order were preserved.
            </li>
            <li>If a document check fails, correct the draft or template before trying again.</li>
          </ol>
          <p>
            For blocking failures and advisory findings, see{" "}
            <GuideLink slug="review-states">Review states and export checks</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "evidence-issues",
      title: "Resolve the evidence review",
      body: (
        <>
          <p>If evidence issues appear, review each issue before deciding whether to proceed.</p>
          <ol>
            <li>Open the evidence-issue review.</li>
            <li>Inspect the affected wording and its supporting evidence.</li>
            <li>If the wording needs correction, return to the draft.</li>
            <li>After a correction, capture and review a new checkpoint.</li>
            <li>
              If you decide to proceed with an unresolved issue, select that issue's acknowledgment
              instead.
            </li>
            <li>
              Select <strong>Save acknowledgments</strong>.
            </li>
          </ol>
          <p>
            If River reports that evidence changed during review, inspect the refreshed report.
            Acknowledge any new issues you decide to retain.
          </p>
        </>
      ),
    },
    {
      id: "download",
      title: "Download the files",
      body: (
        <>
          <p>After document validation and evidence review are complete, export the checkpoint.</p>
          <ol>
            <li>
              Select <strong>Export checkpoint files</strong>.
            </li>
            <li>
              Wait for <strong>Export complete</strong>.
            </li>
            <li>
              Select <strong>Download PDF</strong>.
            </li>
            <li>For a plain-text copy, open More formats and download the extracted text.</li>
          </ol>
          <p>
            Template code and JSON reports are optional downloads in Advanced tools. Enable that
            area in Settings, then inspect the checkpoint by its ID.
          </p>
          <p>
            For available formats, see{" "}
            <GuideLink slug="file-formats">File formats and limits</GuideLink>.
          </p>
          <p>
            To download a previous export, open its checkpoint from <strong>History</strong>. Use
            the retained download links.
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
            To get advisory ATS feedback, follow{" "}
            <GuideLink slug="scoring">Score a résumé</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
