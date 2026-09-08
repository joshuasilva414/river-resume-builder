import { type Guide, GuideLink } from "../shared";

export const history = {
  slug: "history",
  title: "Compare and restore versions",
  description: "Capture a saved résumé, compare earlier versions, or continue one as a new résumé.",
  group: "How-to guides",
  sections: [
    {
      id: "save",
      title: "Capture a saved version",
      body: (
        <>
          <ol>
            <li>Wait for the résumé’s edits to finish saving.</li>
            <li>Choose Save version and add a name if it helps you identify the version.</li>
            <li>Open the captured version to inspect its document.</li>
          </ol>
          <p>
            A captured version is also called a checkpoint. Capture saves an exact version for
            review; exporting creates its downloadable files. See{" "}
            <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "compare",
      title: "Compare two versions",
      body: (
        <>
          <ol>
            <li>
              Open <strong>Saved versions</strong> from the résumé, or History from a saved version.
            </li>
            <li>Choose the two versions to compare and confirm their names and dates.</li>
            <li>Compare the wording and section arrangement.</li>
            <li>
              Inspect both PDFs when available. Select compatible completed scoring runs if you also
              want score differences.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: "branch",
      title: "Continue an earlier version",
      body: (
        <>
          <ol>
            <li>Open the earlier version in History and use its restore or branch action.</li>
            <li>Enter a name for the new résumé.</li>
            <li>Inspect its template. Review the change if you choose a different template.</li>
            <li>Create the new résumé and inspect its preview before continuing.</li>
          </ol>
          <p>
            The earlier version remains saved. If it contains final-document refinements, review the
            changes that returning to structured editing will omit. See{" "}
            <GuideLink slug="source-refinement">Refine the final document</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "retained",
      title: "Download an earlier export",
      body: (
        <>
          <p>
            Open the exported version in <strong>History</strong> and select the file to download.
            Editing your library, deleting a source, or refreshing a job does not replace those
            retained files.
          </p>
          <p>
            To produce a correction, edit a working résumé and{" "}
            <GuideLink slug="export">export a new version</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
