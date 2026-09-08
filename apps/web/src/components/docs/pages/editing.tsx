import { type Guide, GuideLink } from "../shared";

export const editing = {
  slug: "editing",
  title: "Edit a résumé",
  description: "Arrange sections, tailor wording, and inspect the current document as you work.",
  group: "How-to guides",
  sections: [
    {
      id: "open",
      title: "Open the résumé",
      body: (
        <>
          <p>
            Open the résumé from its job or the résumé list. Check that saving has completed before
            capturing a version or applying an external update.
          </p>
          <p>
            Your working résumé can change. Captured versions and exported files retain the document
            you reviewed at that time.
          </p>
        </>
      ),
    },
    {
      id: "sections",
      title: "Add and arrange sections",
      body: (
        <>
          <ol>
            <li>Choose a saved section or create one with the fields you need.</li>
            <li>Fill direct fields and add nested entries within the same editor.</li>
            <li>Inspect the approximate insertion preview at the intended position.</li>
            <li>Add the section, then arrange sections and entries in reading order.</li>
          </ol>
          <p>
            Expand sections, groups and individual entries independently. Existing items start
            collapsed; new items open automatically. Collapsing keeps your unsaved values. Find
            optional fields and layout choices in Additional settings.
          </p>
        </>
      ),
    },
    {
      id: "tailor",
      title: "Tailor wording",
      body: (
        <>
          <p>
            Edit wording for the current résumé where you need a different emphasis. Keep factual
            meaning supported by your evidence.
          </p>
          <p>
            For AI help, choose the provider and model before starting. Review the choices and edit
            a choice’s wording before applying it. Use <strong>Apply selected</strong> for chosen
            changes or <strong>Apply all</strong> for all available changes across pages. Choose one
            alternative per target entry.
          </p>
          <p>
            A bulk action validates all its targets before saving. If one target changed, refresh
            the results and review again. Applying a successful batch again does not duplicate its
            changes. Use Undo to undo the applied edit.
          </p>
        </>
      ),
    },
    {
      id: "reuse",
      title: "Use a saved library update",
      body: (
        <>
          <p>
            A library edit does not automatically replace wording already placed in a résumé.
            Inspect the available update and compare its values with any local edits before applying
            it.
          </p>
          <p>
            To reuse a local improvement, save it through the available library controls. Keep
            changes specific to one employer local to that résumé. See{" "}
            <GuideLink slug="library">Build reusable sections</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "save-preview",
      title: "Preview edits and review the final PDF",
      body: (
        <>
          <p>
            The approximate preview reflects your current edits. Pagination updates after you pause
            typing. Custom templates can differ from this preview.
          </p>
          <p>
            Saving valid content and adding sections do not wait for a PDF. Choose Save version
            after your edits finish saving, then review its exact PDF for final spacing and page
            breaks.
          </p>
          <p>
            Read the extracted text as well as the PDF. See{" "}
            <GuideLink slug="export">Export a résumé</GuideLink> for the final checks and downloads.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
