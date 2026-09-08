import { type Guide, GuideLink } from "../shared";

export const scoring = {
  slug: "scoring",
  title: "Score a résumé",
  description:
    "Review the full inputs, request advisory feedback, and track your scoring allowance.",
  group: "How-to guides",
  sections: [
    {
      id: "submit",
      title: "Score a saved version",
      body: (
        <>
          <p>
            Scoring sends the full résumé text and its saved job posting to River’s configured
            scoring service. It uses a separate service from your personal AI connections.
          </p>
          <ol>
            <li>Open a saved version and review its complete PDF and job posting.</li>
            <li>Choose Score résumé to check readiness.</li>
            <li>Check readiness and the available allowance, then select Score.</li>
            <li>Review progress and completed results in the Scores tab.</li>
          </ol>
          <p>Scoring is optional. You can review and export a valid document without it.</p>
        </>
      ),
    },
    {
      id: "allowance",
      title: "Check the daily allowance",
      body: (
        <>
          <p>
            The default allowance for a normal account is 25 successful scoring results per UTC day.
            Each successful template-validation sample counts as one result. Administrators are
            exempt from this daily cap and can configure or reset account allowances.
          </p>
          <p>
            A pending scoring request reserves capacity. A successful result consumes it. Failed or
            cancelled work releases it. Reusing an already saved result does not use another slot.
          </p>
          <p>
            When the daily allowance is used, wait until the next UTC day or ask the administrator
            about your account’s configured allowance. Your personal AI connections have no daily
            River quota.
          </p>
        </>
      ),
    },
    {
      id: "findings",
      title: "Review the findings",
      body: (
        <>
          <p>
            Compare each suggestion with the résumé and the facts you want to present. Use the
            finding’s review controls to record whether it is addressed, accepted, or not
            applicable.
          </p>
          <p>
            To change the document, edit the résumé separately and capture a new version. A score
            does not establish that a claim is true or predict an employer’s decision.
          </p>
        </>
      ),
    },
    {
      id: "compare",
      title: "Compare saved results",
      body: (
        <>
          <p>
            Open score comparison and choose a completed run on each side. Use results from
            compatible scoring configurations and the same intended job context.
          </p>
          <p>
            If River reports incompatible results, inspect the saved inputs and scoring
            configuration before interpreting the numbers. See{" "}
            <GuideLink slug="review-states">Document checks and result status</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
