import type { Guide } from "../shared";

export const reviewStates = {
  slug: "review-states",
  title: "Review states and export checks",
  description: "Evidence decisions, lifecycle warnings, template states, and document checks.",
  group: "Reference",
  sections: [
    {
      id: "evidence",
      title: "Evidence review states",
      body: (
        <>
          <p>
            An Evidence Revision is a saved version of a claim's assertion, citations, and context
            references. A review decision applies to that exact revision.
          </p>
          <dl>
            <dt>Draft</dt>
            <dd>
              The revision has not been verified. A claim can have an explicit Draft review
              decision.
            </dd>
            <dt>Needs clarification</dt>
            <dd>
              The revision has an unresolved detail. The review rationale records the concern.
            </dd>
            <dt>Verified</dt>
            <dd>
              The reviewer decided that the revision accurately reflects its cited sources.
              Verification requires at least one citation and a rationale.
            </dd>
          </dl>
          <p>
            Verification records a review decision. It does not represent an independent fact-check
            by River or an employer endorsement.
          </p>
        </>
      ),
    },
    {
      id: "warnings",
      title: "Evidence and content warnings",
      body: (
        <>
          <p>These warnings are separate from the Evidence Revision's review state.</p>
          <dl>
            <dt>Stale</dt>
            <dd>
              A saved reference differs from a newer or changed record. The saved wording still
              refers to the selected revision.
            </dd>
            <dt>Archived</dt>
            <dd>A referenced record is archived. Existing saved references remain available.</dd>
            <dt>Unsupported</dt>
            <dd>A wording placement has no linked supporting evidence.</dd>
          </dl>
          <p>
            One placement can have several issues. Draft, Needs clarification, stale, archived, and
            unsupported issues each require an acknowledgment when applicable to an export.
          </p>
          <p>
            Each saved acknowledgment belongs to the exact checkpoint and review report. An
            acknowledgment does not verify evidence or bypass a document failure.
          </p>
        </>
      ),
    },
    {
      id: "document",
      title: "Document checks",
      body: (
        <>
          <dl>
            <dt>Document compiles</dt>
            <dd>The document renderer successfully produces the PDF.</dd>
            <dt>Prohibited constructs</dt>
            <dd>The document passes the restrictions on supported source constructs.</dd>
            <dt>Text integrity</dt>
            <dd>
              The PDF contains the expected text, the expected number of occurrences, and the
              required reading order.
            </dd>
            <dt>Evidence review</dt>
            <dd>The checkpoint has saved acknowledgments for all applicable evidence issues.</dd>
          </dl>
          <p>
            Compilation failures, prohibited constructs, and text-integrity failures block export.
            Page-count and layout-risk findings are warnings.
          </p>
          <p>A successful compilation does not establish visual quality or factual accuracy.</p>
        </>
      ),
    },
    {
      id: "templates",
      title: "Template revision states",
      body: (
        <>
          <dl>
            <dt>Draft</dt>
            <dd>A saved template revision that is not yet validated.</dd>
            <dt>Validated</dt>
            <dd>
              A revision that has passed validation. Visual approval is still required before use as
              an approved custom template.
            </dd>
            <dt>Approved</dt>
            <dd>
              A validated revision with an explicit visual review. Approval applies to that exact
              revision.
            </dd>
            <dt>Retired</dt>
            <dd>
              A revision removed from eligibility for new draft selection. Existing saved references
              retain their selected revision.
            </dd>
          </dl>
          <p>Template approval does not verify résumé claims.</p>
        </>
      ),
    },
    {
      id: "ai",
      title: "AI proposal review states",
      body: (
        <>
          <dl>
            <dt>Pending</dt>
            <dd>A proposal awaiting a decision. Pending proposals persist across reloads.</dd>
            <dt>Accepted</dt>
            <dd>
              A proposal with a recorded acceptance decision. The resulting change depends on the
              task.
            </dd>
            <dt>Rejected</dt>
            <dd>
              A proposal with a recorded rejection decision. Rejection discards the live generated
              payload.
            </dd>
          </dl>
          <p>
            Staleness is separate from the proposal's review state. Changed inputs can prevent
            acceptance of a Pending proposal.
          </p>
          <p>
            Accepted source candidates create Draft claims. Accepted wording creates a local change.
            Accepted requirement extraction applies the reviewed map. Accepted ranking records
            review without selecting evidence.
          </p>
        </>
      ),
    },
    {
      id: "scores",
      title: "ATS feedback",
      body: (
        <>
          <p>
            ATS scores are advisory simulations. They are not results from an employer's applicant
            tracking system or predictions of hiring outcomes.
          </p>
          <p>
            Scores and scoring failures do not block export. Comparisons require compatible job
            snapshots and scoring identities.
          </p>
          <p>Finding decisions are separate from résumé edits and provider results.</p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
