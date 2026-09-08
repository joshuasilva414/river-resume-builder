import { type Guide, GuideLink } from "../shared";

export const quickStart = {
  slug: "quick-start",
  title: "Create a practice résumé",
  description:
    "Build and export a small résumé with fictional details. No AI connection is required.",
  group: "Tutorials",
  sections: [
    {
      id: "before-you-start",
      title: "Prepare a practice workspace",
      body: (
        <>
          <p>
            Sign in to River. This tutorial uses Alex Example and a fictional booking-form project.
            Keep these details in a practice résumé; replace them with your own facts before
            applying for a job.
          </p>
          <p>
            You will save evidence, add a job, create a Summary and an Experience section, then
            review the PDF. Sources and AI assistance are optional.
          </p>
        </>
      ),
    },
    {
      id: "add-sources",
      title: "Choose the practice facts",
      body: (
        <>
          <p>
            Use these fictional facts for the exercise: Alex Example built a booking form in a class
            project using React and TypeScript. Alex implemented input validation and tested the
            form with classmates. No measured improvement or employment history is provided.
          </p>
          <p>
            You can enter these facts directly as evidence. To try document intake separately, paste
            them into a source using <GuideLink slug="sources">Add source material</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "review-evidence",
      title: "Save practice evidence",
      body: (
        <>
          <ol>
            <li>
              Open <strong>Evidence</strong> and select <strong>Add evidence</strong>.
            </li>
            <li>
              Choose <strong>Experience</strong> as the type.
            </li>
            <li>
              Enter: Built a class-project booking form with React and TypeScript, including input
              validation and testing with classmates.
            </li>
            <li>Add React and TypeScript as keywords, then save.</li>
            <li>
              Add a second item with type <strong>Skill</strong> and text React. Add TypeScript as
              another Skill item if you want to try the skill selector.
            </li>
          </ol>
          <p>The saved items are ready to use. Source links are optional.</p>
        </>
      ),
    },
    {
      id: "save-job",
      title: "Save a practice job",
      body: (
        <>
          <ol>
            <li>
              Open <strong>Jobs</strong> and select <strong>Import job</strong>.
            </li>
            <li>
              Choose <strong>Paste text</strong> and enter: Practice frontend role. Build accessible
              forms with React and TypeScript.
            </li>
            <li>
              Choose <strong>Enter details manually</strong>.
            </li>
            <li>
              Enter Practice Frontend Developer as the role title and Example Company as the
              company.
            </li>
            <li>Save the job. Open it and create a résumé using an available template.</li>
          </ol>
          <p>
            For automatic details and requirement extraction, choose a connected model before
            analyzing the posting. See <GuideLink slug="jobs">Tailor to a job posting</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "contact",
      title: "Enter the practice name",
      body: (
        <>
          <ol>
            <li>Add a Contact section to the résumé.</li>
            <li>Enter Alex Example as the name. Leave optional contact fields empty.</li>
            <li>Save the section and inspect the preview.</li>
          </ol>
          <p>
            When preparing your own résumé, use contact information you want an employer to receive.
          </p>
        </>
      ),
    },
    {
      id: "assemble",
      title: "Add Summary and Experience",
      body: (
        <>
          <ol>
            <li>
              Create a Summary section and enter: Computer science graduate with experience building
              and testing web forms using React and TypeScript.
            </li>
            <li>Preview the section in the résumé and add it.</li>
            <li>Create an Experience section. Add an Experience Entry within the section.</li>
            <li>
              Enter Booking form as the title and Class project as the employer. Leave unknown dates
              empty.
            </li>
            <li>
              Enter the booking-form accomplishment from your saved evidence. You can also use{" "}
              <strong>Fill from evidence</strong> and review the suggested values.
            </li>
            <li>
              Preview the résumé with the section in its intended position, then save the section
              and its entries together.
            </li>
          </ol>
          <p>
            You can type directly into each field. Reusable entries are optional. If you add a
            Skills section, select the active Skill evidence you created.
          </p>
        </>
      ),
    },
    {
      id: "export",
      title: "Review and download the practice PDF",
      body: (
        <>
          <ol>
            <li>
              Wait for the résumé to show <strong>Saved</strong>.
            </li>
            <li>Open its review and capture a saved version for export.</li>
            <li>
              Inspect every PDF page and read the extracted text. Confirm that Alex’s name and the
              practice wording appear correctly.
            </li>
            <li>Correct any missing text or document error, then capture the corrected version.</li>
            <li>Export the saved version and download its PDF.</li>
          </ol>
          <p>
            Scoring is optional. For download details, see{" "}
            <GuideLink slug="export">Export a résumé</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
