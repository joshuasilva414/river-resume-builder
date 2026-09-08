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
            <li>Inspect the insertion preview in the actual résumé at the intended position.</li>
            <li>Add the section, then arrange sections and entries in reading order.</li>
          </ol>
          <p>
            Use a compatible layout to change appearance without re-entering values. Review content
            that becomes hidden or visible after the switch.
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
      title: "Inspect the current PDF",
      body: (
        <>
          <p>
            The PDF refreshes after edits settle. During rendering, the previous successful preview
            stays visible. Check its status before assuming it includes the latest changes.
          </p>
          <p>
            If rendering fails, correct the reported content or template error. An older response
            cannot replace the preview for newer edits. Before export, wait for saving and the
            current preview to finish.
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
