import { type Guide, GuideLink } from "../shared";

export const library = {
  slug: "library",
  title: "Build reusable sections",
  description:
    "Write section fields directly, add nested entries inline, and reuse content across résumés.",
  group: "How-to guides",
  sections: [
    {
      id: "starters",
      title: "Choose the section you need",
      body: (
        <>
          <p>
            Start with a standard Contact, Summary, Experience, Projects, Education, Skills, or
            Credentials section. A section’s content schema defines its fields. Its layout controls
            how those values appear in the PDF.
          </p>
          <p>
            For example, Summary contains direct text. Experience contains a list of Experience
            Entries, each with its own fields. You can also use a custom schema and compatible
            layout.
          </p>
        </>
      ),
    },
    {
      id: "create",
      title: "Enter details directly",
      body: (
        <>
          <p>
            Type into the section or entry fields. You do not need to create a separate reusable
            item for each name, date, or sentence.
          </p>
          <p>
            For Contact, add a name and optional contact details or labeled links. For Education,
            enter GPA as a number if you want to include it. Choose the date precision you know:
            year, month and year, full date, or Present.
          </p>
          <p>
            A private library label helps you find an item. A printed section heading appears in the
            résumé. See <GuideLink slug="content-types">Content schemas and fields</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "blocks",
      title: "Add entries within a section",
      body: (
        <>
          <ol>
            <li>Create or edit an Experience section.</li>
            <li>Add an Experience Entry inside the section, or select a compatible saved entry.</li>
            <li>
              Enter the title, employer, dates, location, and accomplishments you want to include.
            </li>
            <li>Add more entries and arrange them in the intended order.</li>
            <li>Save the section and new entries together.</li>
          </ol>
          <p>
            Entries support the same field model as sections. A custom entry can contain another
            compatible record or list of records.
          </p>
          <p>
            Older saved blocks remain readable as entries. Existing content and saved résumés do not
            require manual rebuilding.
          </p>
        </>
      ),
    },
    {
      id: "sections",
      title: "Fill and preview the section",
      body: (
        <>
          <p>
            Select <strong>Fill from evidence</strong> within an entry, choose relevant evidence,
            and review the suggested field values. Unknown fields stay empty. Apply the reviewed
            values, then finish editing the entry fields. Active Skill evidence supplies skill
            selectors.
          </p>
          <p>
            Before inserting a section into a résumé, preview it at the intended position with the
            surrounding content. Inspect page breaks and text, then confirm the insertion.
          </p>
        </>
      ),
    },
    {
      id: "versions",
      title: "Change a layout or reuse content",
      body: (
        <>
          <p>
            Choose another compatible layout to change presentation while retaining the same field
            values. Values that a layout does not display remain saved and can reappear with a
            layout that uses them.
          </p>
          <p>
            Editing a reused entry or a placed section does not silently change every résumé that
            uses it. Review the scope of the save or library update. See{" "}
            <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "archive",
      title: "Delete or restore library content",
      body: (
        <>
          <p>
            Select <strong>Delete</strong> to move reusable content or a section to Trash. No reason
            is required. Restore it from Trash to use it in new work again.
          </p>
          <p>
            Saved résumé placements and historical exports keep their saved content. Deleting a
            section does not erase the entries referenced by earlier saved versions.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
