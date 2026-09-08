import { type Guide, GuideLink } from "../shared";

export const sourceRefinement = {
  slug: "source-refinement",
  title: "Refine the final document",
  description: "Review changes to a generated document and save the result as a separate version.",
  group: "How-to guides",
  sections: [
    {
      id: "request",
      title: "Request a document change",
      body: (
        <>
          <p>
            Start with a saved version whose PDF is ready. Final-document refinement can change both
            wording and layout.
          </p>
          <ol>
            <li>
              Open the saved version and select <strong>Refine final document</strong>.
            </li>
            <li>
              Enter the intended change in <strong>What would you like to change?</strong>.
            </li>
            <li>Choose the provider and model before submitting.</li>
            <li>
              Select <strong>Suggest changes</strong> to open the proposed document.
            </li>
          </ol>
          <p>Earlier requests remain in the saved version’s Refinements tab.</p>
        </>
      ),
    },
    {
      id: "review",
      title: "Review and save the candidate",
      body: (
        <>
          <ol>
            <li>
              Compare the original and proposed PDFs in <strong>Preview &amp; checks</strong>.
            </li>
            <li>
              Inspect the wording changes and available evidence links in{" "}
              <strong>Wording &amp; evidence</strong>.
            </li>
            <li>Check factual meaning, completeness, and document warnings.</li>
            <li>
              If you want the valid candidate, confirm that you reviewed the changes and select{" "}
              <strong>Accept &amp; save checkpoint</strong>.
            </li>
            <li>Wait for publication and open the new saved version.</li>
          </ol>
          <p>
            Use <strong>Reject candidate</strong> if you do not want the changes. The original
            version remains saved.
          </p>
          <p>
            To download the result, follow <GuideLink slug="export">Export a résumé</GuideLink>.
            Optional sources and historical verification states do not add an export acknowledgment
            step.
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
            Returning to the structured editor regenerates the document from its section fields.
            Layout or wording changes made only during final-document refinement can be left out.
            The refined version remains saved.
          </p>
          <ol>
            <li>
              Select <strong>Return to structured editing</strong> on the refined version.
            </li>
            <li>Inspect the comparison and excluded changes.</li>
            <li>Name the new résumé and confirm the stated regeneration consequences.</li>
            <li>Create it and inspect its regenerated PDF.</li>
          </ol>
          <p>
            See <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink> for
            how the versions relate.
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
            To use a layout idea in future résumés, open <strong>Templates</strong> and describe or
            reproduce the change in a template working copy. Inspect the sample preview, then save
            it.
          </p>
          <p>
            A final-document edit does not automatically change reusable layouts or content schemas.
            Follow <GuideLink slug="templates">Create and customize templates</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
