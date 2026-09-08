import { type Guide, GuideLink } from "../shared";

export const reviewStates = {
  slug: "review-states",
  title: "Document checks and result status",
  description:
    "What blocks a document, what needs review, and how historical statuses are retained.",
  group: "Reference",
  sections: [
    {
      id: "evidence",
      title: "Evidence is usable when saved",
      body: (
        <>
          <p>
            Current evidence has text, a type, keywords, and optional sources. Imported evidence
            becomes usable after one Add selected or Add all action.
          </p>
          <p>
            Older Draft, Needs clarification, and Verified decisions remain historical records. They
            do not filter current evidence or block new exports. This guide keeps its earlier
            review-states URL for saved links.
          </p>
        </>
      ),
    },
    {
      id: "warnings",
      title: "Changed and deleted references",
      body: (
        <>
          <p>
            A résumé can retain wording linked to evidence or content that has since changed or
            moved to Trash. The saved reference remains available for comparison.
          </p>
          <p>
            These notices are informational. They do not require an acknowledgment before export.
            Missing source links are allowed.
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
            <dt>Blocking errors</dt>
            <dd>
              Compilation failure, unsafe document source, missing required document content, or
              unexpected missing or duplicated text. Correct the résumé or template before
              exporting.
            </dd>
            <dt>Diagnostic findings</dt>
            <dd>
              Reading-order differences, layout concerns, and page-count information. Inspect the
              PDF and extracted text to assess the result.
            </dd>
            <dt>Preview status</dt>
            <dd>
              A rendering task may be pending or failed while the previous successful PDF remains
              visible. Check that the preview represents the current edit.
            </dd>
          </dl>
        </>
      ),
    },
    {
      id: "templates",
      title: "Template working copies",
      body: (
        <>
          <p>
            Template edits and chat responses change a working copy. Undo returns to an earlier
            edit. Save validates the completed template and its referenced schemas and layouts.
          </p>
          <p>
            Earlier saved template versions and validation records remain available. Ordinary
            editing does not require a separate proposal approval after each response.
          </p>
        </>
      ),
    },
    {
      id: "ai",
      title: "AI result status",
      body: (
        <>
          <dl>
            <dt>In progress</dt>
            <dd>The task is running. Cancel prevents later publication into saved work.</dd>
            <dt>Ready to review</dt>
            <dd>Inspect the returned text and choices before adding or applying them.</dd>
            <dt>Applied or added</dt>
            <dd>
              The chosen result has been saved. Retrying the same successful batch does not
              duplicate it.
            </dd>
            <dt>Inputs changed</dt>
            <dd>
              Relevant material changed after the result was created. Refresh the task and review
              new results.
            </dd>
            <dt>Failed or cancelled</dt>
            <dd>Saved sources and résumés remain available. Use the displayed recovery action.</dd>
          </dl>
        </>
      ),
    },
    {
      id: "scores",
      title: "Scoring feedback",
      body: (
        <>
          <p>
            Scores and findings are advisory. They are separate from document validation, evidence
            truth, and an employer’s hiring decision. A score is not required for export.
          </p>
          <p>
            Successful results use the scoring allowance described in{" "}
            <GuideLink slug="scoring">Score a résumé</GuideLink>.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
