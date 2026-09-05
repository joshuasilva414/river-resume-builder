# Checkpoint history and branching

Implemented locally through migration `0025_checkpoint_labels.sql`. Paper boards 70–71 define capture, chronology and restoration; see `history-scoring-design.md`. Staging remains on migration 0018.

## Capture and chronology

The editor can save a checkpoint with an optional 80-character label, capture for export, or capture before creating a branch. Capture requires the acknowledged revision and stops for pending saves or conflict recovery. The checkpoint survives document failure. Retrying keeps its original command identity, label and selected action. Save & score remains conditional on provider configuration.

History lists checkpoints newest first with stable identity and pagination. It preserves loaded entries when another page fails. The persisted working draft is separate from saved checkpoints. Document, exported, scored and accepted-source states come from persistence. Drafts and branches for the same job are selectable; lineage identifies the exact originating checkpoint when available. Editor and checkpoint links open separately so browsing history does not discard local work.

## Restoration

An Owner command creates a named independent draft from an exact checkpoint. It copies local wording and composition overrides, generates new placement IDs, and retains pinned library/evidence references and the original posting snapshot. The new draft, reference indexes, checkpoint lineage, audit entry and permanent idempotency outcome commit together. Neither the source checkpoint nor newer drafts change.

Historical template bindings remain inspectable. New bindings require an eligible template; selecting a replacement requires complete graph comparison and explicit confirmation. Accepted source overrides enter the existing regeneration review instead of silently losing source changes. That review preserves the original source checkpoint and creates a separate structured branch.

## Verification

- All 120 Workers tests in 22 files pass. The two focused history cases cover immutable labels, newer draft/library edits, copy independence, exact rendered text, pinned references/posting, lineage, idempotency, agent denial, replacement confirmation and conflicting retries. Existing source-return tests still pass.
- Workspace type checks, lint and the staging build pass. Logs: `/tmp/river-history-ui-types.log`, `/tmp/river-history-ui-lint.log`, `/tmp/river-history-full-workers.log` and `/tmp/river-history-build.log`.
- Local browser restoration created `01a072a6-6541-7f20-a8e4-42f3a6c5c72b` from synthetic checkpoint `01a07081-284c-704c-a063-3be74f6ddb79`, preserving the original editor/checkpoint. Its real preview succeeded. Labeled capture created `01a072a7-a9c8-7e30-bcdf-42b4c8e9aea8` with label “Synthetic restoration baseline”; history shows its exact origin and ready document. No export acknowledgment or source-review attestation was submitted.
- Desktop history was inspected in both themes with visible focus. Mobile history/restoration, complete content/PDF comparison, hosted checks and the real Owner tailoring session remain open.

## Pinned content and PDF comparison

Paper boards 71–72 now have a local read-only implementation. Each side selects an exact checkpoint or saved working-draft revision. Loading saves the full response in the open comparison, with a SHA-256 identity. Lightweight draft-head polling reports newer saved work or previews without replacing the selected content or artifact. Explicit loading is required to refresh. Stale revision requests fail; incomplete saved drafts can still be compared without successful compilation. Inputs are bounded at 2 MB, with no truncation.

The comparison includes every wording value, section/block/content identity and order, local overrides, pinned library graph, evidence material, citations, captured contexts, posting snapshot, complete template graph and accepted source. Source-refined wording comes from accepted intended fields while its structured base remains separately identified. Repeated text is matched by locator; copied placements are distinct. Changed and unchanged complete values remain inspectable.

PDF panes retain independent zoom/page state across content/PDF switches. Each names its exact operation and rendered revision. Earlier or expired previews are identified, and missing files have no substituted document. Protected source/text/report links and original checkpoint review remain accessible. Working drafts cannot enter score comparison. Two saved checkpoints expose independent paginated completed-run selectors across their chosen branches. The existing identity policy and full result view are shared with checkpoint scoring review. New results are never selected automatically, and changing checkpoint pairs resets their run choices.

Four focused service/history tests and a focused domain comparison test pass. Workspace type checks, lint and the staging bundle pass (`/tmp/river-comparison-services.log`, `/tmp/river-comparison-domain.log`, `/tmp/river-comparison-final-types.log`, `/tmp/river-comparison-final-lint.log`, `/tmp/river-comparison-build.log`). The local browser compared the synthetic checkpoint against saved r0, changed the draft name in a second editor, kept r0 and its PDF pinned, observed the newer-work notice, then explicitly refreshed to r1. Both real PDFs rendered with independent 75%/fit-width zoom. Mobile comparison, dark comparison, failed-artifact recovery and accepted-source browser comparison remain open.

Source-refined restoration now includes the explicit eligible-template picker and complete graph comparison. The template confirmation and source-regeneration confirmation are separate and initially unchecked. The replacement joins the existing atomic branch command and its permanent identity; historical source, template and checkpoints remain unchanged. A focused isolated test proves a retired binding blocks the branch, an unconfirmed replacement creates no orphan, and confirmed replacement preserves references and replay.

The 25 focused source/history/scoring integration tests, workspace types/lint and staging build pass (`/tmp/river-history-integration-tests.log`, `/tmp/river-history-integration-types.log`, `/tmp/river-history-integration-lint.log`, `/tmp/river-history-integration-build.log`). Local browser inspection confirms empty completed-run selectors, complete unchanged content and dark PDF comparison; no provider request or Owner attestation was made. Source acceptance and its actual regeneration journey remain pending explicit approval. No V1 release is claimed.
