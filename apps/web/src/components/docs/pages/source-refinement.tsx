import { type Guide, GuideLink } from "../shared";

export const sourceRefinement = {
  slug: "source-refinement",
  title: "Refine the final document",
  description:
    "Review proposed wording and layout changes, then save an accepted result as a separate checkpoint.",
  group: "How-to guides",
  sections: [
    {
      id: "request",
      title: "Request a document change",
      body: (
        <>
          <p>
            Source changes can alter both wording and layout. Start with a checkpoint whose PDF is
            ready.
          </p>
          <ol>
            <li>Open the checkpoint.</li>
            <li>
              Select <strong>Refine final document</strong>.
            </li>
            <li>
              Enter the intended change in <strong>Refinement goal</strong>.
            </li>
            <li>Check the provider and model under AI for this action.</li>
            <li>
              Select <strong>Suggest document changes</strong>.
            </li>
            <li>Open the candidate after generation and preview finish.</li>
          </ol>
        </>
      ),
    },
    {
      id: "review",
      title: "Review and save a candidate",
      body: (
        <>
          <p>Inspect every change before confirming review coverage.</p>
          <ol>
            <li>Open Preview &amp; checks and compare the original and proposed PDFs.</li>
            <li>
              Open Wording &amp; evidence and inspect the actual wording changes and citations.
            </li>
            <li>Check changes in meaning and factual support.</li>
            <li>Check the preview warnings.</li>
            <li>
              If the candidate passes validation and you want the changes, confirm the
              review-coverage checkbox.
            </li>
            <li>
              Select <strong>Accept &amp; save checkpoint</strong>.
            </li>
            <li>Wait for publication to finish.</li>
            <li>Open the new checkpoint.</li>
          </ol>
          <p>
            If you do not want the changes, select <strong>Reject candidate</strong> instead.
          </p>
          <p>
            To download the accepted result, follow{" "}
            <GuideLink slug="export">Export a résumé</GuideLink>. Review the new checkpoint's
            evidence issues.
          </p>
        </>
      ),
    },
    {
      id: "return",
      title: "Return to structured editing",
      body: (
        <>
          <p>
            Returning to the earlier editor version leaves out layout and wording changes made only
            during final-document refinement. Review those differences first. The refined checkpoint
            remains saved.
          </p>
          <ol>
            <li>
              On the source checkpoint, select <strong>Return to structured editing</strong>.
            </li>
            <li>Inspect the comparison and excluded changes.</li>
            <li>Enter a name for the new draft.</li>
            <li>Confirm the stated regeneration consequences.</li>
            <li>Create the new draft.</li>
            <li>Inspect its regenerated PDF.</li>
          </ol>
          <p>
            For how the versions relate, see{" "}
            <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "promote",
      title: "Reuse a layout idea",
      body: (
        <>
          <p>
            To turn a supported layout change into a reusable template proposal, select{" "}
            <strong>Promote a layout idea</strong> on the source checkpoint.
          </p>
          <p>
            Review the proposal before saving the template. Follow{" "}
            <GuideLink slug="templates">Create and approve a template</GuideLink> to validate and
            approve the saved revision.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
