import { type Guide, GuideLink } from "../shared";

export const scoring = {
  slug: "scoring",
  title: "Score a résumé",
  description:
    "Submit a saved checkpoint for advisory ATS feedback and record your review of the findings.",
  group: "How-to guides",
  sections: [
    {
      id: "submit",
      title: "Score a checkpoint",
      body: (
        <>
          <p>
            Scoring sends the full résumé text and saved posting to the configured scoring service.
            Review those inputs before submission.
          </p>
          <p>Start with a checkpoint whose document has passed validation.</p>
          <ol>
            <li>Open the checkpoint.</li>
            <li>
              Select <strong>Scores</strong>.
            </li>
            <li>
              Open <strong>View complete résumé text</strong>.
            </li>
            <li>
              Open <strong>View exact posting</strong>.
            </li>
            <li>Inspect the text, provider, and preflight limits.</li>
            <li>
              If the inputs are correct and within the limits, select{" "}
              <strong>Score checkpoint</strong>.
            </li>
            <li>
              Open the completed run in <strong>Scoring history</strong>.
            </li>
          </ol>
          <p>
            If the input exceeds the limits, follow{" "}
            <GuideLink slug="troubleshooting">Resolve common problems</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "findings",
      title: "Review a finding",
      body: (
        <>
          <p>To record a decision about a suggestion, open the finding's review controls.</p>
          <ol>
            <li>Read the complete suggestion.</li>
            <li>Compare the suggestion with your résumé and evidence.</li>
            <li>
              Choose <strong>Addressed</strong>, <strong>Accepted</strong>, or{" "}
              <strong>Not applicable</strong> to record your decision.
            </li>
            <li>
              Enter a <strong>Rationale</strong>.
            </li>
            <li>
              Select <strong>Save review</strong>.
            </li>
          </ol>
          <p>
            To change the résumé, edit the draft separately. Capture a new checkpoint before
            requesting a score for the changed document.
          </p>
        </>
      ),
    },
    {
      id: "compare",
      title: "Compare results",
      body: (
        <>
          <p>
            To compare saved results, open the score comparison and select a completed run on each
            side.
          </p>
          <p>
            If River reports incompatible results, inspect the posting and scoring identities
            instead of treating the scores as comparable.
          </p>
          <p>
            For what scoring can establish, see{" "}
            <GuideLink slug="review-states">Review states and export checks</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
