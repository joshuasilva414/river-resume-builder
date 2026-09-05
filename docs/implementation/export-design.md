# Phase 1 review, export and checkpoint visibility design

Updated 2026-09-05. A dedicated Paper subagent prepared these designs before UI implementation, following the Owner's Paper-first requirement. Scope is M5 review/export and basic checkpoint visibility. This is a design handoff, not an implementation verification report.

Authoritative design: [River App UI](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0). Existing boards are preserved. Read actual styles through Paper `get_jsx` / `get_computed_styles` when implementing.

## Design map

| Surface | Paper board | Use |
| --- | --- | --- |
| Existing review/export | `1A3-0` | Application shell, checks, PDF/text/report split |
| Existing acknowledgment/pending/failure | `29V-0`, `2AA-0`, `2AK-0` | Warning vocabulary and operation status |
| Existing mobile review/download | `3MR-0` | PDF sizing, fit-width, format actions |
| Existing history vocabulary | `1W5-0`, `3P0-0` | Chronological rows only; omit later scoring/branch controls |
| 45 · Checkpoint review & export / Light | `5TM-0` | Exact-checkpoint review, checks and PDF inspector |
| 46 · Checkpoint capture & evidence acknowledgment | `5TN-0` | Save/capture preconditions and all five issue categories |
| 47 · Extracted text & validation report | `5TO-0` | Text inspection, expected/extracted comparison, report identities |
| 48 · Document operations & blocking failures / Dark | `5TP-0` | Queue, stages, retention, cancellation, failure and retry |
| 49 · Exported checkpoint history & files / Light | `5TQ-0` | Basic chronology, retained files and original export record |
| 50 · Mobile checkpoint review & download / Light | `5TR-0` | PDF/text/report tabs, download and additional formats |
| 51 · Mobile evidence acknowledgment / Dark | `5TS-0` | All five issue categories in a full-screen review flow |
| 52 · Mobile exported checkpoint history / Light | `5TT-0` | Resume review, open retained files and empty history |
| 53 · Updated evidence review & export authorization | `6BF-0` | Changed report comparison, export-ready/completed states |

Exact subtrees:

- Checkpoint review main: `5U8-0`; header: `5VF-0`; document checks: `5VS-0`; individual check rows: `5YL-0`, `5YR-0`, `5YX-0`, `5Z3-0`; layout advisory: `5Z9-0`; guarded export: `5ZE-0`.
- PDF inspector: `5VU-0`; checkpoint/revision identity: `5ZL-0`; PDF fixture container: `5ZP-0`; page controls: `609-0`.
- Capture/preconditions: `5UG-0`; capture action: `5W5-0`; save pending: `5WB-0` onward; capture conflict: `5WI-0` onward; evidence-change refresh: `5WP-0` onward.
- Evidence acknowledgment: `5UI-0`; Draft and Archived: `5X6-0`; Needs clarification and stale: `5XN-0`; unsupported: `5Y5-0`; acknowledgment save: `5YD-0`.
- Extracted text: `5UQ-0`; read-only extraction: `60L-0`; validation report: `5US-0`; expected/extracted comparison: `617-0`; input/validation identity disclosure: `61O-0` onward.
- Operations: `5VA-0`; queued: `61V-0`; running: `624-0`; retaining: `62D-0`; cancellation requested: `62J-0`; canceled: `62P-0`; preview expired: `62X-0`.
- Blocking outcomes: `5VC-0`; compile failure: `635-0`; prohibited construct: `63H-0`; text integrity: `63S-0`; artifact finalization failure: `640-0`.
- History timeline: `5V0-0`; pending review: `64D-0`; selected exported checkpoint: `64L-0`; earlier export: `64T-0`.
- Retained file inspector: `5V2-0`; PDF: `65D-0`; LaTeX: `65K-0`; text: `65R-0`; validation report: `65Y-0`; original export review: `66C-0`; later evidence-change notice: `66G-0`; interrupted download: `66K-0`.
- Mobile review: header `66P-0`; checkpoint context `66X-0`; tabs `673-0`; PDF `677-0`; main download `67W-0`; More formats `67Y-0`; additional formats `682-0` onward.
- Mobile acknowledgment: context `68W-0`; Draft/Archived `691-0`; clarification/staleness `69K-0`; unsupported `6A2-0`; footer `6AB-0`.
- Mobile history: context `68J-0`; pending `6AH-0`; exported `6AQ-0`, `6AZ-0`; earlier action `6B8-0`; empty state `6BC-0` onward.
- Changed review comparison: `6BL-0`; previous/current reports: `6BW-0`; changed issue: `6C8-0` onward; acknowledgment-save retry: `6CM-0` onward.
- Ready/completed export: `6BN-0`; passed checks/acknowledgments: `6CW-0`; first-export action: `6D1-0`; completed PDF download: `6D7-0`; zero-issue variant: `6DD-0` onward.

## Agreed checkpoint and review contracts

No architecture replacement is needed. The implementation agent agreed to the following contract while these designs were prepared:

1. Capture the exact acknowledged saved draft, including evidence, material content/composition, context, contact and template identities. The immutable checkpoint must be sufficient to reproduce the historical composition without reading mutable current values.
2. Keep review/export evaluation as an immutable report identity tied to that checkpoint and a deterministic issue-manifest digest. Checkpoint composition, document artifacts and the evidence review report have distinct identities.
3. Before the first export authorization, recheck applicable verification/review decisions, lifecycle state and current-revision relationships. A change that alters the applicable issue set produces a new report and pauses export for explicit review.
4. Show Evidence changed during review with a comparison of the previous/current reports and the newly applicable issues. Never silently return to Ready, or apply acknowledgments from an unseen issue manifest.
5. Acknowledgments identify each applicable issue occurrence, the exact checkpoint, report and issue manifest. They are not a boolean for an entire evidence category, a mutable Claim identity or every future export.
6. Previously exported history retains the original report and acknowledgments. Later evidence changes do not rewrite its composition, files, report or original export record.

The service needs enough stable identity to reject a stale acknowledgment or first-export request atomically. A typical contract includes checkpoint identity, review-report identity, issue-manifest digest, the individual issue identities being acknowledged, expected review state and the standard command idempotency key. Exact field names belong to the application service schema.

The issue identity must distinguish separate applicable issues for the same placement/evidence relationship. For example, Draft and Archived can both apply to one referenced Evidence Revision and each requires review. Repeated wording placements remain attributable to their actual placement/field locators rather than array positions alone.

## Capture and review workflow

- Review begins from the current acknowledged draft. Capture & review export captures that exact revision as an immutable checkpoint before evidence acknowledgment or final export.
- If typing is pending or a save is in flight, show Waiting for save and disable capture. Finish saving or use the already-designed conflict recovery before proceeding. Do not capture a hidden earlier saved revision while suggesting it contains the visible local edits.
- The capture command uses expected draft revision. A racing save from another tab prevents dependent checkpoint writes; show the conflict path. An unseen newer draft must not become the export payload.
- A retry of the same capture command resolves to the same checkpoint/result. Repeated clicks must not create extra checkpoints or independent document jobs.
- Once captured, later draft edits do not alter the checkpoint. Back to draft returns to the current working draft; it does not restore the captured snapshot over newer work.
- A checkpoint may be captured before rendering, acknowledgment or export succeeds. Keep this pending checkpoint discoverable so its review can resume after navigation/reload. History status comes from its operation/review/export records, not mutation of the saved composition.
- A completed export can be reopened for downloads without capturing a new checkpoint. Whether an unchanged, never-exported draft reuses an existing matching checkpoint is an application idempotency/deduplication choice; no unconditional extra checkpoint creation is required by the design.

## Per-issue acknowledgments

| Issue | Required visible context | Acknowledgment |
| --- | --- | --- |
| Draft | Exact Evidence Revision and lack of verification for that revision | Acknowledge this Draft evidence |
| Needs clarification | Exact revision plus the Owner's rationale | Acknowledge this unresolved clarification |
| Stale / Evidence changed | Pinned reference plus the newer or changed relationship | Acknowledge this stale evidence/context relationship |
| Archived | Archived linked record plus retained provenance | Acknowledge this archived evidence |
| Unsupported | Exact wording/field without supporting evidence | Acknowledge this unsupported wording |

- Group related issues by the actual content placement. Show the complete checkpoint wording and exact evidence references. Open the existing evidence/provenance inspector for assertion, citations, pinned context and review rationale.
- Multiple issues remain separate checkboxes. No Acknowledge all shortcut is designed. Do not suppress an issue because the same row already has another warning.
- Checkboxes start unchecked for decisions not already valid for the exact displayed report. The Save acknowledgments action persists the reviewed decisions as a command, with actor/time recorded by the service. Local ticks alone are not saved authorization.
- Show acknowledged/applicable counts from actual issue records. Count issue occurrences, not categories or Claims. A disabled final action explains outstanding reviews.
- If saving acknowledgments fails, retain local choices and offer retry using the original command identity. If the report changed, show the refreshed report path rather than resubmitting old choices against new issues.
- On a changed issue manifest, the Owner must see the current report and explicitly acknowledge newly applicable issues. Any handling of unchanged prior acknowledgments must preserve their exact issue identity and cannot authorize an issue set the Owner has not reviewed. An old report digest never authorizes a different digest by itself.
- New checkpoint identity means new export review. Do not carry over an approval merely because the text looks unchanged.
- With no evidence issues, omit the empty checklist. Document validation and exact report identity still apply.
- Acknowledgment never changes a Claim's verification state, removes its warning, edits reusable content or overrides a document-integrity blocker.

## Document validation and inspection

- Keep PDF, Extracted text and Report tabs for the same exact document job/checkpoint. Every pane exposes the checkpoint and source draft revision. A preview from an older draft is explicitly identified as such.
- The PDF is the Tectonic output. Use the existing PDF.js viewer; page count, zoom and fit-width controls use actual PDF state. The screen's synthetic PDF is only an illustrative fixture.
- Extracted text is read-only and complete. Search and issue navigation help inspect long text. Missing-text findings must identify the expected content locator even when there is no extracted region to scroll to.
- The validation report distinguishes compilation, prohibited constructs, text completeness, expected multiplicity and reading order. Missing, duplicated or incorrectly ordered required text blocks export.
- An expected/extracted comparison shows the full relevant text and exact field/placement locator. Do not show only a vague failed score or truncate away the difference.
- Layout and page-count findings are advisory. Link them to the reported page/section when a trustworthy locator exists. They do not need an evidence-policy acknowledgment and do not block export.
- Report details expose actual document fingerprint, template revisions, compiler/renderer identities, font/asset bundle, normalization/validation identity and source locators. Keep these in a disclosure so the primary flow stays readable.
- Passed document checks do not claim an ATS score or an ATS Screener tested designation. Scoring controls remain absent.
- Blocked output has no enabled Export action. Diagnostics remain inspectable, and the Owner can return to editing. A deterministic prohibited construct or integrity failure is not solved by repeatedly retrying identical inputs.

## Operation progress, cancellation and recovery

- Operation records are authoritative. Map their real state/stage to Queued, Running/Compiling, Extracting text, Validating and Retaining files where those stages exist. Do not fabricate percentages, timers or stages the backend cannot report.
- Coalesce obsolete preview work. Show the last successful PDF with its exact revision and stale/updating/failed status while new work is pending. An obsolete completion cannot replace a newer relevant successful preview.
- The pending checkpoint view may show the last successful draft preview, but must state that it is not the checkpoint's output. It must never become the export payload by fallback.
- First render with no successful PDF uses an empty preview with actual progress/failure. This differs from an update failure that retains a prior PDF.
- Cancellation is a request until the authoritative Operation reaches a terminal state. The current bounded step may finish before cancellation takes effect. Keep Cancellation requested visible; do not promise instant termination.
- After a confirmed cancellation, keep the captured checkpoint and earlier successful preview. A new attempt is explicit. A completed operation that wins the cancellation race must be reported as completed, not mislabeled canceled.
- Retry compile/extraction/validation transient failures against the same immutable checkpoint and declared render inputs. Attempt identities, limits and elapsed-time budgets come from the document service. A retry never means an unbounded loop.
- Artifact finalization is separate from successful compilation. Keep downloads unavailable until the required immutable objects and metadata are finalized. Retry recoverable finalization; do not display a partial artifact set as a completed export.
- Use stable dispatch identity and idempotent recovery. Do not create a duplicate checkpoint merely because Workflow dispatch or R2 finalization was interrupted.
- Transient previews expire after seven days. Show Preview expired with a request for a fresh current-draft preview. Checkpoint artifacts remain retained; temporary-preview expiration cannot delete historical output.
- Compilation failure, prohibited constructs and text-integrity failure remain blocking regardless of evidence acknowledgments. The retry path must preserve the saved draft and the failed checkpoint for diagnosis.

## First export and retained downloads

- Export checkpoint files acts on the exact checkpoint, reviewed report/digest, saved acknowledgments and finalized document artifacts. The service rechecks applicable current evidence state before authorizing the first export.
- A changed issue set returns Evidence changed during review and a new immutable report. It does not alter the checkpoint composition or silently authorize the old review.
- A completed export record links the checkpoint, artifact identities, validation report, evidence review report, issue manifest, acknowledgments and Owner actor/time. The user sees Export complete only after this record exists.
- Retain the PDF, exact rendered `.tex`, PDF-extracted `.txt` and validation report `.json`. Keep the separate evidence review/export record inspectable. Exact report-file packaging is an implementation contract; do not substitute a current live evaluation for the original exported report.
- Each download uses authenticated protected artifact access to the exact retained object. A file type selector must not resolve a moving current-preview pointer. Private R2 keys are not public share links.
- The design uses individual file downloads. It does not require ZIP generation, a shareable public URL, DOCX, background email or automatic delivery.
- Downloading a previously completed export retrieves the retained bytes and original export review. Later evidence changes may be explained as current context, but they do not rewrite historical files or delete the original acknowledgment record.
- A failed download keeps the file available and offers Retry download. It does not rerender, recapture a checkpoint or create another export. A session failure uses existing sign-in recovery and returns to the same artifact.
- Do not claim that merely opening a PDF viewer prevents browser-level saving. Product export authorization and its acknowledgment record are service contracts, not browser DRM. Application download actions still obey the policy gate.

## Basic checkpoint visibility

- Default chronology is newest captured checkpoint first, with capture time and its source draft revision. An exported checkpoint also exposes its original export time and retained file availability.
- Distinguish captured/needs review, rendering, failed/canceled and exported states using real related records. Capturing alone is not successful export. Pending checkpoints allow Resume review rather than a misleading Download action.
- The list belongs to the selected resume/draft context. Show context for a conflict-created branch when needed, without adding general branch creation, restoration or comparison controls.
- Opening an earlier checkpoint is read-only. It does not switch current posting, overwrite the working draft or discard later checkpoints.
- Show earlier checkpoints paginates persisted records. A failed history read has Retry; it must not become No exported checkpoints yet.
- Existing `1W5-0` / `3P0-0` include later scoring and branching. Use their timeline vocabulary only. Save checkpoint, Save & score, general comparison, restore-as-branch and branch experimentation remain Phase 3.

## Responsive and accessibility notes

- Preserve River's logo, Newsreader headings, Instrument Sans UI/body and IBM Plex Mono locators. Reuse the established light/dark palette. Light pass status is green; issue severity remains explicit text so color is not the only signal.
- Desktop review uses the existing 64px header/204px sidebar with a 650px review pane and 586px inspector at 1440px. At smaller widths stack the panes or use tabs while keeping checkpoint/revision labels visible.
- Long reports, content and issue lists scroll within readable panels. Use fixed trailing action/status lanes; do not let long wording displace action buttons.
- Mobile uses a 390px reference with 20px side padding, 16px body wording and 44px action targets. PDF fit-width remains available. Mobile supports review, evidence acknowledgment, export and download; composition stays deferred.
- The More formats area in `5TR-0` is an expanded reference state. Implement it as the accessible disclosure/sheet opened by More formats, rather than duplicating controls permanently.
- The empty-state blocks on the history sheets are alternative states. Do not render them below a populated timeline in the product.
- A mobile issue checkbox has a 20px visible square inside a label/hit area at least 44px high. Its accessible label names the actual issue and affected content. Tapping the row label changes only that checkbox.
- Keep action footers reachable with safe-area spacing. Full-screen mobile acknowledgment maintains focus and returns to checkpoint review. Closing it does not falsely claim unsaved decisions were recorded.
- Use semantic tabs, headings, buttons and fieldsets. Announce operation transitions and saved acknowledgment state politely. Do not move focus on each background stage update.
- Blocker summaries link to individual findings. Review report refresh receives a clear announcement and an explicit review action; it must not erase the current selection silently.

## Remaining implementation contracts

- Exact Operation stage names, cancellation boundaries, retry budgets and file-finalization states must come from the bounded document pipeline. These designs provide truthful UI states, not new engine guarantees.
- Define stable issue occurrence identity and report/digest serialization. Keep policy evaluation identity separate from rendering fingerprint and immutable checkpoint composition.
- Define artifact-manifest/report-file shape and MIME types. All four required file types must resolve to the same successful checkpoint artifact set; the evidence review record remains linked to the original export.
- Define canonical text normalization and locator mapping in the validator. The UI may only claim completeness, multiplicity or ordering that the validator actually proves.
- Capture pins historical contact/context/material values. A mutable profile read during rendering must not change old checkpoint output.
- Retention remains seven days for temporary previews and indefinite retention of original sources/checkpoint artifacts. Backup/restore procedures and 30-day daily backup retention belong to M6 operations, not new controls on these screens.

## Design completion

All nine new boards were screenshot-reviewed in Paper and their working indicators were released. The designs use neutral placeholders and existing synthetic Paper PDF/text fixtures. No application data was seeded, no existing board was replaced, and no app implementation or runtime behavior was verified by this design-only task.
