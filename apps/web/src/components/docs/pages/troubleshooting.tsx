import { type Guide, GuideLink } from "../shared";

export const troubleshooting = {
  slug: "troubleshooting",
  title: "Resolve common problems",
  description: "Recover access, interrupted processing, conflicting edits, and blocked exports.",
  group: "How-to guides",
  sections: [
    {
      id: "sign-in",
      title: "Recover account access",
      body: (
        <>
          <p>If you cannot sign in, check account access first.</p>
          <ol>
            <li>Confirm that you used the invited email address.</li>
            <li>Open the verification email if you have not verified the account.</li>
            <li>
              If you forgot the password, follow{" "}
              <GuideLink slug="account">Access your workspace</GuideLink>.
            </li>
            <li>If access remains blocked, contact the person who shared River with you.</li>
          </ol>
        </>
      ),
    },
    {
      id: "source",
      title: "Recover a failed source import",
      body: (
        <>
          <p>Inspect the source's status before retrying.</p>
          <ul>
            <li>
              If the upload is incomplete, use its resume-upload action with the exact original file
              or text.
            </li>
            <li>
              If extraction failed, inspect the error and retry extraction from the source
              inspector.
            </li>
            <li>
              If the file is unsupported or too large, supply a supported file within the{" "}
              <GuideLink slug="file-formats">File formats and limits</GuideLink>.
            </li>
            <li>If the document is a scan, supply a text version.</li>
            <li>
              If extracted text is incomplete, add a separate corrected text source with a note
              explaining its origin.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "conflict",
      title: "Preserve edits after a conflict",
      body: (
        <>
          <p>
            Reloading a saved version can discard local edits. Preserve the local text before
            reloading.
          </p>
          <ol>
            <li>Read the comparison between local and saved content.</li>
            <li>Copy any local wording you need to retain.</li>
            <li>If the draft offers duplication and you want a separate draft, use that option.</li>
            <li>Otherwise, reload the saved version after preserving your text.</li>
            <li>Reapply the intended change.</li>
          </ol>
        </>
      ),
    },
    {
      id: "preview",
      title: "Refresh an old preview",
      body: (
        <>
          <p>If the preview does not show your latest changes, inspect the save status first.</p>
          <ol>
            <li>Resolve any failed save or conflict.</li>
            <li>
              Wait for <strong>All changes saved</strong>.
            </li>
            <li>Check the document status.</li>
            <li>If compilation is active, wait for it to finish.</li>
            <li>If compilation failed, inspect the error before retrying.</li>
            <li>If the preview expired, request a fresh preview.</li>
          </ol>
        </>
      ),
    },
    {
      id: "export",
      title: "Complete a blocked export",
      body: (
        <>
          <p>Open the checkpoint and inspect the document checks and evidence review.</p>
          <ul>
            <li>If compilation or text integrity failed, correct the document before exporting.</li>
            <li>
              If evidence issues remain, inspect each issue and save the acknowledgments you choose
              to make.
            </li>
            <li>
              If evidence changed during review, inspect the refreshed report before acknowledging
              new issues.
            </li>
            <li>If your correction changes the draft, capture and review a new checkpoint.</li>
          </ul>
          <p>
            For the complete procedure, follow <GuideLink slug="export">Export a résumé</GuideLink>.
          </p>
        </>
      ),
    },
    {
      id: "assistance",
      title: "Resume AI or scoring work",
      body: (
        <>
          <p>Use the reported failure to choose the next action.</p>
          <ul>
            <li>
              If the provider is unavailable, continue manually or contact the person running River.
            </li>
            <li>
              If inputs changed, follow <GuideLink slug="ai">Review AI suggestions</GuideLink> to
              request an updated proposal.
            </li>
            <li>
              If active tasks fill your allowance, wait for a task to finish or cancel a task you no
              longer need.
            </li>
            <li>If the daily allowance is exhausted, wait for the reset at midnight UTC.</li>
            <li>
              If scoring input is too long, inspect the preflight counts. Shorten the résumé only if
              the shorter wording remains accurate, then capture a new checkpoint.
            </li>
          </ul>
          <p>
            If the saved posting exceeds the scoring limit, continue without scoring. Do not replace
            the full posting with an excerpt just to obtain a score.
          </p>
        </>
      ),
    },
    {
      id: "missing",
      title: "Find a missing item or update",
      body: (
        <>
          <p>Check the collection and version you are viewing.</p>
          <ul>
            <li>
              For an imported document, open <strong>Sources</strong>.
            </li>
            <li>
              For a factual statement, open <strong>Evidence bank</strong>.
            </li>
            <li>
              For reusable wording, open <strong>Content library</strong>.
            </li>
            <li>For a résumé draft, open its job target.</li>
            <li>If an item is absent from an active list, include archived items in the filter.</li>
            <li>
              If a draft shows older library content, inspect its reuse comparison before applying
              an update.
            </li>
          </ul>
        </>
      ),
    },
  ],
} as const satisfies Guide;
