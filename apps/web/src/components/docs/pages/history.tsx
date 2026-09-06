import { type Guide, GuideLink } from "../shared";

export const history = {
  slug: "history",
  title: "Compare and restore versions",
  description:
    "Save a checkpoint, compare versions, or continue an earlier version as a new draft.",
  group: "How-to guides",
  sections: [
    {
      id: "save",
      title: "Save a checkpoint",
      body: (
        <>
          <p>To preserve the current draft, capture a checkpoint after the draft saves.</p>
          <ol>
            <li>
              Wait for <strong>All changes saved</strong>.
            </li>
            <li>
              If useful, enter a <strong>Checkpoint label</strong>.
            </li>
            <li>
              Select <strong>Save checkpoint</strong>.
            </li>
            <li>
              Select <strong>Open checkpoint</strong> to inspect the saved version.
            </li>
          </ol>
          <p>
            For the distinction between saving and exporting, see{" "}
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
          <p>To inspect changes, use the history comparison.</p>
          <ol>
            <li>
              Open <strong>History</strong> from the draft or checkpoint.
            </li>
            <li>Choose the versions to compare.</li>
            <li>Confirm the identity and label on each side.</li>
            <li>Compare the complete wording and composition.</li>
            <li>If both documents are available, inspect the PDFs.</li>
            <li>If you want score differences, select compatible completed scoring runs.</li>
          </ol>
        </>
      ),
    },
    {
      id: "branch",
      title: "Restore a checkpoint as a new draft",
      body: (
        <>
          <p>To continue from a saved version, create a branch from its checkpoint.</p>
          <ol>
            <li>
              Open the checkpoint's restore action from history, or select{" "}
              <strong>Create a branch from this checkpoint</strong> after capture.
            </li>
            <li>
              Enter a <strong>New draft name</strong>.
            </li>
            <li>
              Inspect <strong>Template for the new branch</strong>.
            </li>
            <li>If you change the template, review and confirm the template change.</li>
            <li>Create the branch.</li>
            <li>Open the new draft to continue editing.</li>
          </ol>
          <p>
            If the checkpoint contains source refinements, follow{" "}
            <GuideLink slug="source-refinement">Refine document source</GuideLink> before returning
            to structured editing.
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
            To retrieve files from an earlier export, open its exported checkpoint in{" "}
            <strong>History</strong>. Select the required download.
          </p>
          <p>
            To produce a corrected version, edit a draft and follow{" "}
            <GuideLink slug="export">Export a résumé</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
