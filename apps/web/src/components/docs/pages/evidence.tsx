import { type Guide, GuideLink } from "../shared";

export const evidence = {
  slug: "evidence",
  title: "Create and review claims",
  description:
    "Cite a factual statement, record your review decision, and manage claims you no longer need.",
  group: "How-to guides",
  sections: [
    {
      id: "claims",
      title: "Create a claim",
      body: (
        <>
          <p>Start with a source whose extraction contains the passage you want to cite.</p>
          <ol>
            <li>
              Open <strong>Evidence bank → New claim</strong>.
            </li>
            <li>
              Enter one factual statement in <strong>Assertion</strong>.
            </li>
            <li>
              Select <strong>Add citation</strong>.
            </li>
            <li>Choose the source and its extraction.</li>
            <li>
              Select a supporting passage or paste the passage into <strong>Exact quote</strong>.
            </li>
            <li>If the passage appears more than once, select the correct occurrence.</li>
            <li>
              Select <strong>Add citation</strong>.
            </li>
            <li>
              If the claim needs context, select a context revision or use{" "}
              <strong>New context</strong>.
            </li>
            <li>
              Select <strong>Create claim</strong>.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: "review-states",
      title: "Record a review decision",
      body: (
        <>
          <p>
            Before verifying a claim, inspect each citation and confirm that the source supports the
            entire assertion.
          </p>
          <ol>
            <li>Select the claim.</li>
            <li>
              Select <strong>Review claim</strong>.
            </li>
            <li>
              If the assertion is supported, select <strong>Verified</strong>. If a detail needs
              resolution, select <strong>Needs clarification</strong>. Otherwise, keep{" "}
              <strong>Draft</strong>.
            </li>
            <li>
              Enter the reason for your decision in <strong>Rationale</strong>.
            </li>
            <li>
              Select <strong>Record decision</strong>.
            </li>
          </ol>
          <p>
            For the meaning of each decision, see{" "}
            <GuideLink slug="review-states">Review states and export checks</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "changes",
      title: "Correct a claim",
      body: (
        <>
          <p>
            A material edit creates a new Draft revision. To correct the claim, follow these steps.
          </p>
          <ol>
            <li>Open the claim's edit form.</li>
            <li>Correct the assertion, citations, or context references.</li>
            <li>
              Select <strong>Save new revision</strong>.
            </li>
            <li>Review the new revision before verifying it.</li>
          </ol>
          <p>For a label, tag, or private note, use the metadata form instead.</p>
        </>
      ),
    },
    {
      id: "organize",
      title: "Find or archive a claim",
      body: (
        <>
          <p>
            To find a claim, search the evidence bank. Narrow the results with the{" "}
            <strong>Status</strong>, <strong>Context</strong>, or <strong>Lifecycle</strong> filter.
          </p>
          <p>
            To hide a claim from active lists, use the claim's archive action and record a reason.
          </p>
          <p>
            To restore a claim, include archived claims in <strong>Lifecycle</strong>. Open the
            claim and use its restore action.
          </p>
        </>
      ),
    },
    {
      id: "duplicates",
      title: "Review possible duplicates",
      body: (
        <>
          <p>
            Before a merge, compare both assertions and their citations. A merge archives one claim
            and creates a new Draft revision of the kept claim.
          </p>
          <ol>
            <li>Open a duplicate comparison from the evidence bank.</li>
            <li>Inspect both claims.</li>
            <li>
              If both claims belong together, review the resulting assertion and enter a merge
              rationale.
            </li>
            <li>
              Select <strong>Merge into kept claim</strong>.
            </li>
            <li>Review the new Draft revision.</li>
          </ol>
          <p>If the claims describe different facts, choose the option to keep them separate.</p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
