import { type Guide, GuideLink } from "../shared";

export const templates = {
  slug: "templates",
  title: "Create and approve a template",
  description:
    "Save a custom layout, validate its sample documents, and approve the revision for use.",
  group: "How-to guides",
  sections: [
    {
      id: "choose",
      title: "Choose a layout for a résumé",
      body: (
        <>
          <p>
            If you want an existing layout, choose a built-in template or an Approved saved revision
            when you create the draft.
          </p>
          <p>
            To adjust that draft's layout, use its available template controls. Inspect the PDF
            after each adjustment.
          </p>
        </>
      ),
    },
    {
      id: "customize",
      title: "Save a custom template",
      body: (
        <>
          <p>
            Custom template editing includes document structure and source. To create a template,
            follow these steps.
          </p>
          <ol>
            <li>
              Open <strong>Templates</strong>.
            </li>
            <li>
              Select <strong>Create template</strong>.
            </li>
            <li>Choose a base.</li>
            <li>Edit the design's structure, style, or source as needed.</li>
            <li>
              Select <strong>Save new Draft revision</strong>.
            </li>
          </ol>
          <p>
            If you use AI template assistance, describe the layout and constraints you want. Follow{" "}
            <GuideLink slug="ai">Review AI suggestions</GuideLink> before accepting the proposal.
          </p>
        </>
      ),
    },
    {
      id: "approve",
      title: "Validate and approve the revision",
      body: (
        <>
          <p>Run validation on the exact saved revision you want to approve.</p>
          <ol>
            <li>Open the template revision's validation controls.</li>
            <li>Start validation.</li>
            <li>Wait for the sample documents to finish.</li>
            <li>Inspect each sample PDF and validation report.</li>
            <li>If validation fails, correct the template and save a new Draft revision.</li>
            <li>After validation passes, confirm that you have visually reviewed the outputs.</li>
            <li>
              Select <strong>Approve this template revision</strong>.
            </li>
          </ol>
          <p>
            For template states, see{" "}
            <GuideLink slug="review-states">Review states and export checks</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
