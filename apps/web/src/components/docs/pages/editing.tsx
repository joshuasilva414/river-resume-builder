import { type Guide, GuideLink } from "../shared";

export const editing = {
  slug: "editing",
  title: "Edit a résumé",
  description: "Add sections, adjust the order, and tailor wording in a saved draft.",
  group: "How-to guides",
  sections: [
    {
      id: "open",
      title: "Open the draft",
      body: (
        <>
          <p>
            To continue a saved résumé, open its job target. In <strong>Résumé drafts</strong>,
            select <strong>Open draft</strong>.
          </p>
          <p>
            If you need a new draft, follow{" "}
            <GuideLink slug="jobs">Tailor to a job posting</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "sections",
      title: "Add and arrange sections",
      body: (
        <>
          <p>
            Start with a contact section that contains your name. The PDF preview requires that
            name.
          </p>
          <ol>
            <li>
              Select <strong>Choose library section</strong>.
            </li>
            <li>Select the contact section you want to use.</li>
            <li>Repeat the selection for each section you want in the résumé.</li>
            <li>
              If you need new content, select <strong>Create section</strong> and follow{" "}
              <GuideLink slug="library">Build reusable sections</GuideLink>.
            </li>
            <li>Use the move controls to reorder sections and blocks.</li>
            <li>
              Adjust each <strong>Printed section heading</strong> as needed.
            </li>
            <li>
              To remove an entire section from this draft, select <strong>Remove section</strong>.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: "tailor",
      title: "Tailor an item's wording",
      body: (
        <>
          <p>To change wording for this résumé, create a local wording change.</p>
          <ol>
            <li>
              On the content item, select <strong>Edit wording</strong>.
            </li>
            <li>
              Edit <strong>Complete local wording</strong>.
            </li>
            <li>Inspect the supporting evidence.</li>
            <li>If the new wording needs different support, update its evidence links.</li>
            <li>
              Enter a <strong>Reason for this local wording</strong>.
            </li>
            <li>
              Select <strong>Apply local wording</strong>.
            </li>
            <li>Wait for the draft to save.</li>
          </ol>
          <p>
            For the effect on reusable content, see{" "}
            <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "reuse",
      title: "Apply a library update",
      body: (
        <>
          <p>Before applying an update, inspect any local changes on the placement.</p>
          <ol>
            <li>Open the placement's reuse controls.</li>
            <li>Compare the placed content with the proposed library revision.</li>
            <li>
              If you want that revision, select <strong>Apply this exact revision</strong>.
            </li>
            <li>Review the resulting wording and evidence in the draft.</li>
          </ol>
          <p>
            To make a local change reusable, use the promotion or fork controls instead. Review the
            saved library result before applying it to a placement.
          </p>
        </>
      ),
    },
    {
      id: "save-preview",
      title: "Inspect the current PDF",
      body: (
        <>
          <p>Before you rely on the preview, wait for the save and compilation to finish.</p>
          <ol>
            <li>
              Confirm that the editor reports <strong>All changes saved</strong>.
            </li>
            <li>Wait until the preview no longer reports a pending or stale state.</li>
            <li>Inspect the name, contact details, dates, line breaks, and page breaks.</li>
            <li>If the layout needs adjustment, change the available template layout controls.</li>
            <li>Inspect the new PDF after compilation finishes.</li>
          </ol>
          <p>
            To preserve the version, follow{" "}
            <GuideLink slug="history">Compare and restore versions</GuideLink>. To download the
            résumé, follow <GuideLink slug="export">Export a résumé</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
