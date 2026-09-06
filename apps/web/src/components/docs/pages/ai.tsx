import { type Guide, GuideLink } from "../shared";

export const ai = {
  slug: "ai",
  title: "Review AI suggestions",
  description: "Inspect a proposal and choose whether to apply the proposed change.",
  group: "How-to guides",
  sections: [
    {
      id: "available",
      title: "Start an assistance task",
      body: (
        <>
          <p>
            AI tasks can send selected inputs to an external service. Inspect the task's input and
            provider information before starting.
          </p>
          <ol>
            <li>Open the source, job target, wording item, or template you want help with.</li>
            <li>Open its AI assistance controls.</li>
            <li>Select the inputs required by the task.</li>
            <li>Enter your request, if the task includes an instruction field.</li>
            <li>Start the task.</li>
            <li>Open the proposal when the task completes.</li>
          </ol>
          <p>
            If assistance is unavailable, follow the manual task guide or contact the person running
            River.
          </p>
        </>
      ),
    },
    {
      id: "review",
      title: "Accept or reject a proposal",
      body: (
        <>
          <p>Review the complete proposal before making a decision.</p>
          <ol>
            <li>Compare the proposal with the source material and current content.</li>
            <li>Check factual support, omissions, and changed meaning.</li>
            <li>
              For a requirement map, inspect removed requirements and affected evidence
              associations.
            </li>
            <li>If you want the proposed change, use the acceptance action.</li>
            <li>If you do not want the proposed change, use the rejection action instead.</li>
            <li>Inspect the saved result.</li>
          </ol>
          <p>
            After accepting source candidates, review the resulting Draft claims through{" "}
            <GuideLink slug="evidence">Create and review claims</GuideLink>.
          </p>
          <p>
            After accepting a ranking, choose evidence through{" "}
            <GuideLink slug="jobs">Tailor to a job posting</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "stale",
      title: "Replace a stale suggestion",
      body: (
        <>
          <p>
            If River reports changed inputs, review the current material before requesting another
            proposal.
          </p>
          <ol>
            <li>Inspect the changed evidence, wording, or other dependency.</li>
            <li>Start a new task with the intended current inputs.</li>
            <li>Review the replacement proposal before accepting it.</li>
          </ol>
          <p>
            For why the earlier proposal cannot be applied unchanged, see{" "}
            <GuideLink slug="saved-versions">Saved versions and local changes</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "source-refinement",
      title: "Refine the final document",
      body: (
        <>
          <p>
            To change the generated LaTeX source, follow{" "}
            <GuideLink slug="source-refinement">Refine document source</GuideLink>.
          </p>
          <p>
            To create a reusable layout, follow{" "}
            <GuideLink slug="templates">Create and approve a template</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
