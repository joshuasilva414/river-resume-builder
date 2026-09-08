import { type Guide, GuideLink } from "../shared";

export const jobs = {
  slug: "jobs",
  title: "Tailor to a job posting",
  description:
    "Import a public URL or pasted posting, review its requirements, and select relevant evidence.",
  group: "How-to guides",
  sections: [
    {
      id: "capture",
      title: "Import and review the posting",
      body: (
        <>
          <ol>
            <li>
              Open <strong>Jobs</strong> and select <strong>Import job</strong>.
            </li>
            <li>
              Choose <strong>Public URL</strong> or <strong>Paste text</strong>. Enter the full
              posting URL or description.
            </li>
            <li>
              Check <strong>AI for this action</strong>, then start the import.
            </li>
            <li>
              Review the retrieved description, role title, company, and proposed requirements. Edit
              any incorrect values.
            </li>
            <li>
              Choose the requirements to keep. Save the job and selected requirements together.
            </li>
          </ol>
          <p>
            River first retrieves the public page directly. If it needs JavaScript, River tries
            browser rendering. The job is saved only after your review.
          </p>
          <p>
            You can use <strong>Enter details manually</strong> with pasted text when you do not
            want AI analysis.
          </p>
        </>
      ),
    },
    {
      id: "requirements",
      title: "Separate qualifications from eligibility",
      body: (
        <>
          <p>
            Qualifications describe the skills, experience, education, or credentials the role asks
            for. Use them to guide evidence matching and résumé wording.
          </p>
          <p>
            Eligibility covers items such as work authorization, location, travel, or schedule.
            Review these against your circumstances. River does not infer your answers, match
            evidence to them, or use them to block résumé creation.
          </p>
          <p>
            Edit a requirement’s type, wording, category, priority, and keywords.{" "}
            <strong>Use selected</strong> keeps the selected results; <strong>Use all</strong> uses
            the complete result set. Counts include results on other pages.
          </p>
        </>
      ),
    },
    {
      id: "select-evidence",
      title: "Choose evidence for qualifications",
      body: (
        <>
          <ol>
            <li>Open a qualification and inspect its selected evidence.</li>
            <li>
              Choose evidence yourself, or use <strong>Find evidence matches</strong> with a
              connected model.
            </li>
            <li>
              Review the matches and choose <strong>Use selected</strong> or{" "}
              <strong>Use all</strong>.
            </li>
            <li>Check that each selected fact supports the qualification.</li>
          </ol>
          <p>
            Selection helps you tailor the application. It does not invent a qualification or
            automatically add wording to the résumé.
          </p>
        </>
      ),
    },
    {
      id: "drafts-and-updates",
      title: "Create and tailor the résumé",
      body: (
        <>
          <p>
            Create a résumé from the job and choose an available template. Add sections, enter
            details directly, or use <strong>Fill from evidence</strong> within an entry.
          </p>
          <p>
            For assisted wording, edit the choices before applying them.{" "}
            <strong>Apply selected</strong> and <strong>Apply all</strong> use the displayed
            complete-set counts. Choose one alternative for each target entry. See{" "}
            <GuideLink slug="editing">Edit a résumé</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "changed-posting",
      title: "Refresh a saved posting",
      body: (
        <>
          <ol>
            <li>
              Open the job and select <strong>Refresh posting</strong>.
            </li>
            <li>Retrieve the URL again or paste the updated posting.</li>
            <li>Review the new description, details, and requirements.</li>
            <li>Save the reviewed refresh.</li>
          </ol>
          <p>
            A refresh creates a new saved capture. It keeps earlier posting captures and saved
            résumé history. River does not silently refresh jobs in the background.
          </p>
          <p>
            If you edit the description after analysis, reanalyze it or explicitly confirm the
            reviewed requirements before saving.
          </p>
        </>
      ),
    },
    {
      id: "recovery",
      title: "Continue after an import fails",
      body: (
        <>
          <p>
            If a page is blocked, requires sign-in, or cannot be read, copy the posting yourself and
            use <strong>Paste text</strong>. River does not bypass access restrictions.
          </p>
          <p>
            If retrieval succeeds but analysis fails, the retrieved text remains editable. Retry,
            select a different model for a new import, or enter the details manually.{" "}
            <strong>Cancel</strong> discards pending results; a late response cannot save the job.
          </p>
          <p>
            An <strong>Inputs changed</strong> message means relevant material changed after the
            result was created. Refresh the analysis and review it again before applying the batch.
          </p>
        </>
      ),
    },
    {
      id: "trash",
      title: "Delete or restore a job",
      body: (
        <>
          <p>
            Move a job to <strong>Trash</strong> when you no longer want it in active lists. No
            reason is required. Restore it from Trash when needed. Earlier posting captures and
            saved résumés remain available.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
