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

General comparison is the next milestone. Source-refined restoration with a retired template still needs the explicit replacement picker in the existing regeneration review. No V1 release is claimed.
