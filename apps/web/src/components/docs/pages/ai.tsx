import { type Guide, GuideLink } from "../shared";

export const ai = {
  slug: "ai",
  title: "Review AI results",
  description:
    "Choose a model, review the result for each task, and recover from changed inputs or failures.",
  group: "How-to guides",
  sections: [
    {
      id: "available",
      title: "Start an AI task",
      body: (
        <>
          <p>
            Connect your own provider in <GuideLink slug="ai-connections">AI connections</GuideLink>
            . Before each task, check <strong>AI for this action</strong> and change the provider or
            model if needed.
          </p>
          <p>
            AI can extract source evidence, analyze job requirements, find evidence matches, suggest
            wording, help build templates, and refine a final document. Manual résumé work remains
            available without an AI connection.
          </p>
          <p>
            While a task runs, follow its status and use <strong>Cancel</strong> if you want to
            stop. A cancelled task cannot publish a late result into your saved work.
          </p>
        </>
      ),
    },
    {
      id: "review",
      title: "Review and save the result",
      body: (
        <>
          <dl>
            <dt>Source evidence</dt>
            <dd>
              Edit text, types, and keywords. Add selected items or all results in one review.
            </dd>
            <dt>Job import</dt>
            <dd>
              Edit the description, job details, and requirements. Save the job and chosen
              requirements together.
            </dd>
            <dt>Requirements and evidence matches</dt>
            <dd>Inspect the results, then use selected results or the complete set.</dd>
            <dt>Wording</dt>
            <dd>
              Edit a choice before applying it. Apply selected changes or all available changes,
              with one alternative for each target.
            </dd>
            <dt>Template chat</dt>
            <dd>
              Responses update the working copy and sample preview. Use Undo if needed. One Save
              validates and stores the completed template.
            </dd>
          </dl>
          <p>
            Check names, dates, scope, and numbers. Remove unsupported claims. Counts on
            selected/all actions cover the complete result set, including other pages.
          </p>
        </>
      ),
    },
    {
      id: "stale",
      title: "Refresh a result after relevant inputs change",
      body: (
        <>
          <p>
            An <strong>Inputs changed</strong> message means a relevant source, requirement,
            evidence item, or target wording changed after analysis. Run the task again and review
            fresh results before applying them.
          </p>
          <p>
            The same initial pasted text and an already-applied result should not produce this
            warning. Bulk actions refuse a stale batch without applying only part of it.
          </p>
          <p>
            For a failed task, read the displayed error. Retry within the task’s limit or start a
            new task with another model. Job imports retain retrieved text after analysis failure;
            sources remain available after extraction failure.
          </p>
        </>
      ),
    },
    {
      id: "source-refinement",
      title: "Refine a final document",
      body: (
        <>
          <p>
            Final-document refinement edits the generated document and can affect wording and
            layout. It saves an accepted result as a separate version after preview and review.
          </p>
          <p>
            Follow <GuideLink slug="source-refinement">Refine the final document</GuideLink>.
            Returning to the structured editor can omit changes made only to that generated
            document.
          </p>
        </>
      ),
    },
  ],
} as const satisfies Guide;
