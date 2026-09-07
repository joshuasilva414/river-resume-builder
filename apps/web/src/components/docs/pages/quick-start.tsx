import { type Guide, GuideLink, Note } from "../shared";

export const quickStart = {
  slug: "quick-start",
  title: "Create a practice résumé",
  description: "Build a short résumé for a fictional project, then export a PDF.",
  group: "Tutorials",
  sections: [
    {
      id: "before-you-start",
      title: "Before you start",
      body: (
        <>
          <p>
            We will build a practice résumé for Alex Example, who built a booking form with React.
            The finished PDF contains a name and a Projects section.
          </p>
          <p>
            Use a desktop browser and an account that can sign in to River. For account setup,
            follow <GuideLink slug="account">Access your workspace</GuideLink>.
          </p>
          <p>
            The Getting started checklist on Job targets tracks your saved work. You can skip it and
            reopen it in Settings. AI is optional for this tutorial.
          </p>
          <Note>
            This example is fictional. Keep the practice claim in Draft. Do not verify the claim or
            submit the practice PDF for a job application.
          </Note>
        </>
      ),
    },
    {
      id: "add-sources",
      title: "Save the practice source",
      body: (
        <>
          <p>First, add the material we will cite.</p>
          <ol>
            <li>
              Open <strong>Sources</strong>.
            </li>
            <li>
              Select <strong>Add source</strong>.
            </li>
            <li>
              Enter "Practice: Alex Example" in <strong>Title</strong>.
            </li>
            <li>
              Set <strong>Source type</strong> to <strong>Pasted text</strong>.
            </li>
            <li>
              Paste the following text into <strong>Source text</strong>:
              <blockquote>
                Fictional practice profile: Alex Example. Project: Booking form. Built a booking
                form with React.
              </blockquote>
            </li>
            <li>
              Select <strong>Save source</strong>.
            </li>
          </ol>
          <p>
            Wait until the source shows its extracted text. The text contains the practice profile
            you pasted.
          </p>
        </>
      ),
    },
    {
      id: "review-evidence",
      title: "Create a cited Draft claim",
      body: (
        <>
          <p>Now, connect the project statement to its source.</p>
          <ol>
            <li>
              Open <strong>Evidence bank</strong>.
            </li>
            <li>
              Select <strong>New claim</strong>.
            </li>
            <li>
              Enter "Built a booking form with React." in <strong>Assertion</strong>.
            </li>
            <li>
              Select <strong>Add citation</strong>.
            </li>
            <li>
              Choose "Practice: Alex Example" in <strong>Source</strong>.
            </li>
            <li>
              Enter "Built a booking form with React." in <strong>Exact quote</strong>.
            </li>
            <li>
              Confirm that River shows <strong>Exact match</strong>.
            </li>
            <li>
              Select <strong>Add citation</strong>.
            </li>
            <li>
              Select <strong>Create claim</strong>.
            </li>
          </ol>
          <p>
            The new claim appears in the evidence bank with the Draft state and its supporting
            quotation. Leave the claim in Draft.
          </p>
        </>
      ),
    },
    {
      id: "save-job",
      title: "Create a practice job target",
      body: (
        <>
          <p>Use a fictional posting for this draft.</p>
          <ol>
            <li>
              Open <strong>Job targets</strong>.
            </li>
            <li>
              Select <strong>Add job target</strong>.
            </li>
            <li>
              Enter "Practice frontend developer" in <strong>Role title</strong>.
            </li>
            <li>
              Enter "Example Company" in <strong>Company</strong>.
            </li>
            <li>
              Enter "Fictional practice posting. Build web forms with React." in{" "}
              <strong>Complete posting text</strong>.
            </li>
            <li>
              Select <strong>Create job target</strong>.
            </li>
            <li>
              In <strong>Résumé drafts</strong>, select <strong>Create résumé draft</strong>.
            </li>
            <li>
              Enter "Practice: Alex Example" in <strong>Draft name</strong>.
            </li>
            <li>
              Keep the <strong>Classic</strong> template.
            </li>
            <li>
              Select <strong>Create draft</strong>.
            </li>
          </ol>
          <p>
            The résumé editor opens with an empty draft. Next, we will add the name that the preview
            requires.
          </p>
        </>
      ),
    },
    {
      id: "contact",
      title: "Add the practice name",
      body: (
        <>
          <p>Use a starter to add the name without building each reusable field separately.</p>
          <ol>
            <li>
              Open <strong>Content library</strong> and select the <strong>Contact / header</strong>{" "}
              starter.
            </li>
            <li>
              Enter "Practice: contact" in <strong>Save as</strong> and "Alex Example" in{" "}
              <strong>Name</strong>.
            </li>
            <li>
              Select <strong>Save to library</strong>.
            </li>
            <li>
              Return to the draft through Job targets, select{" "}
              <strong>Choose library section</strong>, and choose your saved contact section.
            </li>
          </ol>
          <p>
            The draft now contains Alex Example as its name. The PDF preview can render this draft.
          </p>
        </>
      ),
    },
    {
      id: "assemble",
      title: "Add the project",
      body: (
        <>
          <p>Use the editor’s Back navigation to add the project and its supporting evidence.</p>
          <ol>
            <li>
              Select <strong>Create section</strong>.
            </li>
            <li>
              Enter "Practice: projects section" in <strong>Library label</strong>.
            </li>
            <li>
              Set <strong>Section type</strong> to <strong>Projects</strong>.
            </li>
            <li>
              Keep <strong>Projects</strong> as the <strong>Section heading</strong>.
            </li>
            <li>
              Under <strong>Entries in reading order</strong>, select <strong>Create entry</strong>.
            </li>
            <li>
              Enter "Practice: booking form block" in <strong>Library label</strong>.
            </li>
            <li>
              Under <strong>Project title</strong>, select <strong>Write new wording</strong>.
            </li>
            <li>
              Enter "Practice: project title" in <strong>Library label</strong>.
            </li>
            <li>
              Enter "Booking form" in <strong>Wording</strong>.
            </li>
            <li>
              Select <strong>Create wording</strong>.
            </li>
            <li>
              Under <strong>Accomplishments</strong>, select <strong>Write new wording</strong>.
            </li>
            <li>
              Enter "Practice: React accomplishment" in <strong>Library label</strong>.
            </li>
            <li>
              Enter "Built a booking form with React." in <strong>Wording</strong>.
            </li>
            <li>
              Select <strong>Choose evidence</strong>.
            </li>
            <li>Select the practice claim about the booking form.</li>
            <li>
              Select <strong>Link this revision</strong>.
            </li>
            <li>
              Select <strong>Create wording</strong>.
            </li>
            <li>
              In the block form, select <strong>Create entry</strong>.
            </li>
            <li>
              In the section form, select <strong>Create section</strong>.
            </li>
          </ol>
          <p>
            Wait for the draft to save and the PDF preview to finish. The PDF shows Alex Example,
            Projects, Booking form, and the React accomplishment.
          </p>
        </>
      ),
    },
    {
      id: "export",
      title: "Export the practice PDF",
      body: (
        <>
          <p>Finally, capture and review the practice document.</p>
          <ol>
            <li>
              Wait until the draft reports <strong>All changes saved</strong>.
            </li>
            <li>
              Select <strong>Capture &amp; review export</strong>.
            </li>
            <li>Wait for the checkpoint document to finish.</li>
            <li>Inspect the PDF and its extracted text.</li>
            <li>Open the evidence-issue review.</li>
            <li>
              Inspect the Draft issue for the accomplishment and the unsupported issues for the name
              and project title.
            </li>
            <li>For this fictional practice export, select each issue's acknowledgment.</li>
            <li>
              Select <strong>Save acknowledgments</strong>.
            </li>
            <li>
              Select <strong>Export checkpoint files</strong>.
            </li>
            <li>
              Select <strong>Download PDF</strong>.
            </li>
          </ol>
          <p>
            The downloaded PDF contains the practice name and project. The source, claim, library
            items, draft, and checkpoint remain in your workspace.
          </p>
          <p>
            For a real application, continue with{" "}
            <GuideLink slug="jobs">Tailor to a job posting</GuideLink> using your own experience.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
