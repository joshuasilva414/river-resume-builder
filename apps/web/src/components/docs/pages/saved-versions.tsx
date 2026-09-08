import { type Guide, GuideLink } from "../shared";

export const savedVersions = {
  slug: "saved-versions",
  title: "Saved versions and local changes",
  description: "How local edits, library updates, job refreshes, and Trash affect earlier work.",
  group: "Explanation",
  sections: [
    {
      id: "revisions",
      title: "Saved content keeps the version you selected",
      body: (
        <>
          <p>
            A résumé retains the content and layouts you chose for it. Changing the library does not
            silently rewrite every application that used those items.
          </p>
          <p>
            Schemas, layouts, and nested entries are saved with their referenced versions. A
            compatible layout switch keeps the same values, including values the new layout does not
            display.
          </p>
          <p>
            Earlier content items, blocks, date text, evidence links, and document history remain
            readable after the v1.2 changes.
          </p>
        </>
      ),
    },
    {
      id: "local",
      title: "Local changes belong to one résumé",
      body: (
        <>
          <p>
            A local edit tailors a placed section or entry for the current résumé. Reusing an entry
            elsewhere does not make each copy change together.
          </p>
          <p>
            Saving an improvement to the library makes it available for future use. Existing résumés
            still need an explicit update. This lets you retain one employer’s wording while reusing
            the underlying experience.
          </p>
        </>
      ),
    },
    {
      id: "checkpoints",
      title: "Captured versions preserve the document",
      body: (
        <>
          <p>
            A working résumé changes as you edit. A captured version, also called a checkpoint,
            preserves the saved composition for review and export.
          </p>
          <p>
            Rendering and export are separate outcomes from capture. Once exported, the retained
            files do not change when the library or job posting changes.
          </p>
          <p>
            Continuing an earlier version creates a new working résumé. The earlier saved version
            remains available.
          </p>
        </>
      ),
    },
    {
      id: "changes-during-review",
      title: "Pending results depend on their inputs",
      body: (
        <>
          <p>
            An AI result targets the material used to create it. If relevant evidence, requirements,
            or wording changes, River requires fresh analysis before applying the result. Bulk
            actions validate the whole selected set before saving.
          </p>
          <p>
            Already-applied results do not become stale because of their own save. Pasting the same
            initial description does not constitute a later input change.
          </p>
          <p>
            Refreshing a job saves a new reviewed posting capture and retains earlier captures.
            Final-document refinement also saves a separate version; returning to the structured
            editor can omit changes made only in the generated document.
          </p>
        </>
      ),
    },
    {
      id: "archival",
      title: "Trash changes availability",
      body: (
        <>
          <p>
            Delete moves sources, evidence, templates, reusable content, sections, and jobs out of
            active lists and new-content pickers. Restore makes them available again. Neither action
            requires a reason.
          </p>
          <p>
            Saved résumés and exports keep their original references. A notice about a changed or
            trashed reference is informational and does not require an export acknowledgment.
          </p>
          <p>Older records may use the term archived for the same recoverable lifecycle.</p>
        </>
      ),
    },
    {
      id: "further-reading",
      title: "Related guides",
      body: (
        <>
          <p>
            <GuideLink slug="editing">Edit a résumé</GuideLink> covers local work and library
            updates. <GuideLink slug="history">Compare and restore versions</GuideLink> covers
            history. <GuideLink slug="export">Export a résumé</GuideLink> covers document review and
            downloads.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
