import { type Guide, GuideLink } from "../shared";

export const evidence = {
  slug: "evidence",
  title: "Build your evidence library",
  description: "Save facts and skills directly, or add reviewed items from a source.",
  group: "How-to guides",
  sections: [
    {
      id: "claims",
      title: "Add evidence",
      body: (
        <>
          <ol>
            <li>
              Open <strong>Evidence</strong> and select <strong>Add evidence</strong>.
            </li>
            <li>
              Choose a type: <strong>Skill</strong>, <strong>Achievement</strong>,{" "}
              <strong>Experience</strong>, <strong>Education</strong>, <strong>Credential</strong>,
              or <strong>Other</strong>.
            </li>
            <li>Enter the evidence text. Add keywords that help you find it later.</li>
            <li>Optionally link sources.</li>
            <li>Save the item.</li>
          </ol>
          <p>
            Use a skill name for Skill evidence. For other types, describe what you did or earned.
            For example, “Built input validation for a React booking form.” Include numbers only
            when you can support them.
          </p>
        </>
      ),
    },
    {
      id: "review-states",
      title: "Use saved evidence",
      body: (
        <>
          <p>
            Evidence is usable as soon as you save it. You can select it for job requirements, use
            it to fill content fields, or draw on it while writing.
          </p>
          <p>
            From a source, edit the extracted items and use <strong>Add selected</strong> or{" "}
            <strong>Add all</strong> once. You do not need a second verification step. Older Draft,
            Needs clarification, or Verified decisions remain historical information; they do not
            control current use or export.
          </p>
        </>
      ),
    },
    {
      id: "changes",
      title: "Correct an item",
      body: (
        <>
          <ol>
            <li>
              Open the evidence item and edit its text, type, keywords, or optional source links.
            </li>
            <li>Save the changes together.</li>
            <li>
              Review any résumé wording or pending AI results that rely on the changed information.
            </li>
          </ol>
          <p>
            A correction does not silently rewrite earlier saved résumés. See{" "}
            <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "organize",
      title: "Find, delete, or restore evidence",
      body: (
        <>
          <p>
            Search by text or keywords and filter by type. Active Skill items also appear in content
            skill selectors.
          </p>
          <p>
            Use <strong>Delete</strong> to move an item to Trash without a reason. Use{" "}
            <strong>Restore</strong> in Trash to make it available again. Saved résumés and history
            retain their earlier references.
          </p>
        </>
      ),
    },
    {
      id: "duplicates",
      title: "Handle repeated information",
      body: (
        <>
          <p>
            Before adding extracted items, compare repeated facts and select the versions you want
            to keep. The count on <strong>Add all</strong> covers every result page.
          </p>
          <p>
            If you already saved duplicates, keep the clearest item and move unwanted copies to
            Trash. Repeating an import command after a connection interruption does not add the same
            batch twice.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
