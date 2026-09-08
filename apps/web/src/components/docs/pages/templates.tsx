import { type Guide, GuideLink } from "../shared";

export const templates = {
  slug: "templates",
  title: "Create and customize templates",
  description:
    "Edit content fields and layouts, inspect sample previews, and save the completed template.",
  group: "How-to guides",
  sections: [
    {
      id: "choose",
      title: "Choose a compatible layout",
      body: (
        <>
          <p>
            Choose a built-in template or one of your saved templates when creating a résumé. A
            content schema defines the available fields. A layout controls how those fields appear.
          </p>
          <p>
            A Summary can use a direct text field. An Experience section can use a list of
            Experience Entries. Templates can reuse those schemas and select compatible layouts for
            nested entries.
          </p>
        </>
      ),
    },
    {
      id: "customize",
      title: "Edit a template working copy",
      body: (
        <>
          <ol>
            <li>
              Open <strong>Templates</strong> and create or open a template.
            </li>
            <li>Inspect the starting sample preview.</li>
            <li>
              Edit the fields or layout yourself, or choose a connected model and describe the
              change in chat.
            </li>
            <li>Inspect the updated working copy and sample preview after each response.</li>
            <li>
              Use <strong>Undo</strong> to remove a change you do not want. Continue editing until
              the sample is ready.
            </li>
            <li>
              Select <strong>Save</strong> to validate and save the complete template.
            </li>
          </ol>
          <p>
            The chat can change content fields, referenced schemas, and layout together. You do not
            need to accept a separate proposal after each response.
          </p>
          <p>
            Use the field controls for ordinary editing. Template code and saved technical details
            are available in Advanced tools.
          </p>
        </>
      ),
    },
    {
      id: "approve",
      title: "Resolve validation before saving",
      body: (
        <>
          <p>
            Save checks the template and the schemas and layouts it references. Missing references,
            references to another account’s private content, incompatible layouts, and circular
            nesting must be corrected before the template can be saved.
          </p>
          <p>
            Inspect sample PDFs and their extracted text. Compilation errors, unsafe source, and
            missing or unexpectedly repeated text block the affected document. Reading-order
            findings are diagnostic: inspect how a reader will encounter the content, especially in
            multiple columns.
          </p>
          <p>
            Older template versions and validation records remain readable. The current editing flow
            uses one Save for the completed working copy. Optional{" "}
            <GuideLink slug="scoring">scoring</GuideLink> is separate from document validation.
          </p>
        </>
      ),
    },
    {
      id: "reuse",
      title: "Reuse fields and restore templates",
      body: (
        <>
          <p>
            When switching between compatible layouts, River retains the saved field values. A
            layout can leave a value unprinted without deleting it.
          </p>
          <p>
            Use <strong>Delete</strong> to move a template to Trash and <strong>Restore</strong> to
            make it available again. Existing saved résumés keep the template version they used. No
            deletion reason is required.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
