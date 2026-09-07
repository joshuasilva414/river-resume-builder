# Private in-app feedback

Every admitted River account can open `/feedback` from the workspace header. A GitHub account or repository invitation is not required. Signed-out visitors are redirected to sign-in.

Users submit a bug report or feature request with a title and description. They can read their own submissions, status, and the administrator's current response. Only the River administrator can open the inbox across accounts, filter reports, update status, and respond. Statuses are New, In review, Planned, Resolved, and Closed. Lists are paginated in groups of 20.

The form explicitly shares its entered text with the administrator. The inbox includes reporter name and email. Neither feedback nor administrator access attaches or exposes résumé records, provider keys, diagnostics, or other workspace content. Agent credentials cannot use feedback actions. There are no GitHub links, external submissions, email notifications, or attachments in this feature.

## Implementation

- `packages/contracts/src/feedback.ts` defines bounded request schemas: 160-character title, 12,000-character description, and 4,000-character administrator response.
- `packages/db/migrations/0033_feedback.sql` adds the feedback table and owner/status indexes. Apply through the normal migration pipeline before releasing the application.
- Repository methods enforce account scope and administrator permissions. Submission and updates use the existing transactional command receipts and audit framework. Retries reuse keys; administrator writes check the observed revision atomically. Audit entries contain metadata, not report text or responses.
- Server functions use River's existing session authentication. The administrator role comes from the authenticated principal, never client input.
- Forms preserve entered text after errors. A successful submission clears the form and returns to Your feedback. An administrator conflict preserves the proposed response and asks the administrator to refresh before trying a new update.

Paper handoff: App UI · Newsreader, page `3-0`; desktop `B8C-0` / content `B9A-0`; mobile `B9Z-0` / content `BA5-0`; new feedback dialog `BCJ-0` / `BCK-0`; form states `BDJ-0`; administrator inbox `BDV-0`, update form `BEJ-0`.

## Local validation

- Six Cloudflare/D1 tests cover account isolation, administrator-only reads and writes, agent rejection, concurrent idempotent submissions, key mismatch, atomic revision conflicts, audit privacy, filters/pagination, validation, anonymous rejection, and a verified account-session submission and administrator-response flow.
- Web TypeScript and production client/server builds pass. Focused Biome and diff checks pass.
- Browser component previews use the real UI and built styles with fictional, simulated transport data. Checked empty state, form validation, disabled submitting state, error/retry with preserved text, success, administrator inbox/update, reporter response visibility, feature-request guidance, and responsive layouts. These previews complement the real authenticated service tests; they do not claim a live production submission.

Release preparation includes the already-deployed v1.1 baseline followed by this feedback feature. Promote through `dev` to `staging`; the automatic staging deployment applies migration 0033 after its database backup. Production promotion is a separate step.
