import { type Guide, GuideLink } from "../shared";

export const library = {
  slug: "library",
  title: "Build reusable sections",
  description: "Fill a starter with your own details and reuse it across résumés.",
  group: "How-to guides",
  sections: [
    {
      id: "starters",
      title: "Start with your details",
      body: (
        <>
          <p>
            Open Content library and choose Contact, Summary, Experience, Projects, Education,
            Skills, or Credentials under Start with the essentials.
          </p>
          <ol>
            <li>Enter a name in Save as.</li>
            <li>Fill in your own wording. For a field with several items, enter one per line.</li>
            <li>Select Save to library.</li>
          </ol>
          <p>
            River saves the complete reusable section together. Nothing is added when you cancel.
            Starters contain headings and empty fields, not example qualifications. New wording
            remains unverified until you link and review its evidence.
          </p>
          <p>
            When editing an entry, child forms and evidence pickers replace the current view. Back
            returns to your unsaved parent form. Discard confirmation appears in the same editor.
          </p>
        </>
      ),
    },
    {
      id: "create",
      title: "Save a content item",
      body: (
        <>
          <p>
            For the available types and fields, see{" "}
            <GuideLink slug="content-types">Content types and fields</GuideLink>.
          </p>
          <p>To save a piece of wording, follow these steps.</p>
          <ol>
            <li>
              Open <strong>Content library → Individual wording</strong>.
            </li>
            <li>
              Select <strong>New wording</strong>.
            </li>
            <li>
              Enter a <strong>Library label</strong>.
            </li>
            <li>
              Choose the <strong>Content item type</strong>.
            </li>
            <li>
              Enter the exact text to print in <strong>Wording</strong>.
            </li>
            <li>
              Select <strong>Choose evidence</strong>.
            </li>
            <li>Inspect a supporting claim.</li>
            <li>
              Select <strong>Link this revision</strong>.
            </li>
            <li>
              Select <strong>Create wording</strong>.
            </li>
          </ol>
          <p>
            If you do not yet have supporting evidence, save the wording without a link. Review that
            unsupported wording before export.
          </p>
        </>
      ),
    },
    {
      id: "blocks",
      title: "Build a block",
      body: (
        <>
          <p>To combine content into an entry, create a block of the matching type.</p>
          <ol>
            <li>
              In <strong>Content library</strong>, select <strong>Entries</strong>.
            </li>
            <li>
              Select <strong>New entry</strong>.
            </li>
            <li>
              Enter a <strong>Library label</strong>.
            </li>
            <li>
              Choose the <strong>Block type</strong> before adding content.
            </li>
            <li>
              For each required field, select <strong>Choose from library</strong>.
            </li>
            <li>Select the content item for that field.</li>
            <li>
              If a field needs new wording, use <strong>Write new wording</strong> instead.
            </li>
            <li>Add any optional fields you want to print.</li>
            <li>
              Select <strong>Create entry</strong>.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: "sections",
      title: "Group blocks in a section",
      body: (
        <>
          <p>To create a section, follow these steps.</p>
          <ol>
            <li>
              In <strong>Content library</strong>, select <strong>Sections</strong>.
            </li>
            <li>
              Select <strong>New section</strong>.
            </li>
            <li>
              Enter a <strong>Library label</strong>.
            </li>
            <li>
              Choose the <strong>Section type</strong>.
            </li>
            <li>
              For a section other than contact information, enter the printed{" "}
              <strong>Section heading</strong>.
            </li>
            <li>
              Under <strong>Entries in reading order</strong>, select{" "}
              <strong>Choose from library</strong>.
            </li>
            <li>Select a block.</li>
            <li>Repeat the selection for each additional block.</li>
            <li>Use the move controls to set the reading order.</li>
            <li>
              Select <strong>Create section</strong>.
            </li>
          </ol>
          <p>
            To place the section in a résumé, follow{" "}
            <GuideLink slug="editing">Edit a résumé</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "versions",
      title: "Update reusable wording",
      body: (
        <>
          <p>
            A library edit does not replace the version already used by a draft. To change the
            library item, follow these steps.
          </p>
          <ol>
            <li>Open the library item.</li>
            <li>Edit the wording or composition.</li>
            <li>If useful, enter a reason for the revision.</li>
            <li>
              Select <strong>Save new revision</strong>.
            </li>
          </ol>
          <p>
            To apply the new revision to a draft, use the draft's reuse controls. See{" "}
            <GuideLink slug="editing">Edit a résumé</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "archive",
      title: "Archive or restore an item",
      body: (
        <>
          <p>
            To remove an item from active lists, open the item and select its archive action. Enter
            a reason before you confirm.
          </p>
          <p>
            To restore an item, include archived items in the library's <strong>Status</strong>{" "}
            filter. Open the item and select its restore action.
          </p>
          <p>
            For the effect on existing résumés, see{" "}
            <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
