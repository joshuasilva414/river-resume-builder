import { type Guide, GuideLink } from "../shared";

export const savedVersions = {
  slug: "saved-versions",
  title: "Saved versions and local changes",
  description: "Why changes to your library, evidence, or draft do not rewrite an earlier résumé.",
  group: "Explanation",
  sections: [
    {
      id: "revisions",
      title: "A saved revision preserves what you selected",
      body: (
        <>
          <p>
            Reusable content helps you prepare several applications from the same experience. An
            automatic update across every résumé could also change wording you already reviewed.
          </p>
          <p>
            River avoids that surprise by saving exact revisions. A draft keeps the library content
            and evidence revisions it selected until you choose an update.
          </p>
          <p>
            Suppose you revise a project bullet for one application. An earlier draft can still
            retain the original bullet and its original evidence links.
          </p>
          <p>
            A stale warning exposes a difference between a saved reference and a changed record. The
            warning calls for comparison rather than an automatic replacement.
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
            A local wording change tailors a Content item for one placement. A local composition
            change adjusts a placed block or section.
          </p>
          <p>
            Neither change automatically rewrites the reusable library. Promotion saves a reusable
            revision, while a fork creates a separate reusable identity.
          </p>
          <p>
            This distinction supports both kinds of work: a change for one employer and an
            improvement worth keeping for future applications.
          </p>
        </>
      ),
    },
    {
      id: "checkpoints",
      title: "Checkpoints preserve a reviewable document",
      body: (
        <>
          <p>
            A draft is the working composition. A checkpoint captures an exact saved draft and its
            supporting information.
          </p>
          <p>
            The checkpoint can exist before rendering, evidence review, or export completes. Those
            outcomes are separate from the saved composition.
          </p>
          <p>
            Once you export a checkpoint, its files and original review remain in history. Later
            edits cannot silently change the document associated with that export.
          </p>
          <p>
            A branch provides a new draft from saved content. Restoring through a branch lets you
            continue an earlier version while retaining the original work.
          </p>
        </>
      ),
    },
    {
      id: "changes-during-review",
      title: "Changed inputs require another decision",
      body: (
        <>
          <p>
            A review is meaningful only for the material the reviewer saw. AI proposals therefore
            record their input revisions and target.
          </p>
          <p>
            If a relevant input changes, applying the old proposal could introduce wording that no
            longer matches its support. River requires a new reviewed proposal.
          </p>
          <p>
            Export acknowledgments follow the same principle. If the applicable evidence issues
            change before export authorization, the updated issue set needs review.
          </p>
          <p>
            Document-source refinement produces a separate checkpoint. A return to structured
            editing regenerates source from the structured base, so source-only changes can be
            excluded.
          </p>
        </>
      ),
    },
    {
      id: "archival",
      title: "Archival changes visibility",
      body: (
        <>
          <p>
            Archival removes an item from active lists and new-content pickers. Existing placements,
            checkpoints, and history retain their saved references.
          </p>
          <p>
            Archiving a library section does not archive its blocks or content. Restoration makes
            the item available again without rewriting its earlier revisions.
          </p>
          <p>
            Archived evidence can still appear as an issue in an export review. Library organization
            and evidence review are separate decisions.
          </p>
        </>
      ),
    },
    {
      id: "further-reading",
      title: "Related guides",
      body: (
        <>
          <p>
            <GuideLink slug="editing">Edit a résumé</GuideLink> covers local wording and library
            updates.
          </p>
          <p>
            <GuideLink slug="history">Compare and restore versions</GuideLink> covers checkpoints
            and branches.
          </p>
          <p>
            <GuideLink slug="export">Export a résumé</GuideLink> covers review and downloads.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
