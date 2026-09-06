import { type Guide, GuideLink } from "../shared";

export const jobs = {
  slug: "jobs",
  title: "Tailor to a job posting",
  description:
    "Capture a posting, identify its requirements, and choose supporting experience for a résumé.",
  group: "How-to guides",
  sections: [
    {
      id: "capture",
      title: "Capture the posting",
      body: (
        <>
          <p>
            Copy the full job description before you start. River stores a posting URL but does not
            fetch its page.
          </p>
          <ol>
            <li>
              Open <strong>Job targets → Add job target</strong>.
            </li>
            <li>
              Enter the <strong>Role title</strong> and <strong>Company</strong>.
            </li>
            <li>If useful, enter the location.</li>
            <li>
              Paste the job description into <strong>Complete posting text</strong>.
            </li>
            <li>
              If available, enter the <strong>Posting URL</strong>.
            </li>
            <li>
              Select <strong>Create job target</strong>.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: "requirements",
      title: "Record the requirements",
      body: (
        <>
          <p>To record requirements manually, use the requirement editor in the job target.</p>
          <ol>
            <li>Add a requirement.</li>
            <li>
              Enter the <strong>Requirement text</strong>.
            </li>
            <li>Choose the category that matches the requirement.</li>
            <li>
              Set <strong>Priority</strong> to <strong>Required</strong>, <strong>Preferred</strong>
              , or <strong>Unspecified</strong>, based on the posting.
            </li>
            <li>Add a supporting passage from the posting.</li>
            <li>If the passage repeats, choose the intended occurrence.</li>
            <li>Save the requirement.</li>
          </ol>
          <p>
            If you use AI requirement extraction, follow{" "}
            <GuideLink slug="ai">Review AI suggestions</GuideLink> before accepting the proposed
            map.
          </p>
        </>
      ),
    },
    {
      id: "select-evidence",
      title: "Choose evidence for each requirement",
      body: (
        <>
          <p>
            Use <strong>By requirement</strong> to select evidence for a specific requirement.
          </p>
          <ol>
            <li>Select a requirement.</li>
            <li>Find a relevant claim.</li>
            <li>Inspect the claim's assertion, citations, and review state.</li>
            <li>If the claim supports the requirement, add the evidence association.</li>
            <li>
              Review your choices in <strong>Selected</strong>.
            </li>
          </ol>
          <p>If no claim supports a requirement, leave the requirement as a gap.</p>
          <p>
            To choose additional context for the job, use <strong>All evidence</strong>. For the
            difference between general selections and requirement associations, see{" "}
            <GuideLink slug="evidence-model">Sources, claims, and résumé wording</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "drafts-and-updates",
      title: "Create the résumé draft",
      body: (
        <>
          <p>After you review the job, create a draft for that posting.</p>
          <ol>
            <li>
              In <strong>Résumé drafts</strong>, select <strong>Create résumé draft</strong>.
            </li>
            <li>
              Enter a <strong>Draft name</strong>.
            </li>
            <li>Choose a built-in template or an Approved saved template revision.</li>
            <li>
              Select <strong>Create draft</strong>.
            </li>
            <li>
              Follow <GuideLink slug="editing">Edit a résumé</GuideLink> to add and tailor the
              content.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: "changed-posting",
      title: "Capture a changed posting",
      body: (
        <>
          <p>A new posting snapshot starts with an empty requirement map and evidence selection.</p>
          <ol>
            <li>Open the job's saved posting.</li>
            <li>
              Select <strong>Add posting snapshot</strong>.
            </li>
            <li>Enter the updated posting text and details.</li>
            <li>Save the snapshot.</li>
            <li>Review the new requirements and select evidence again.</li>
          </ol>
          <p>
            To inspect earlier work, open <strong>Posting history</strong>. For version behavior,
            see <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
