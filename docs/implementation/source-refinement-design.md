# Final-document source refinement design handoff

Updated 2026-09-05. A dedicated Paper subagent completed these designs before UI implementation. This task owns Paper and this document only; application code and other documentation were not changed or verified. Source-refinement deployment remains the implementation agent's responsibility.

Authority: [SPEC.md](../../SPEC.md#final-document-refinement), [PLAN.md](../../PLAN.md), the source contract in [template-ai-design.md](template-ai-design.md#final-document-source-proposal-contract), and current read-only contracts in [refinement.ts](../../packages/contracts/src/refinement.ts), [source repository](../../packages/db/src/refinement.ts), and [source field model](../../packages/domain/src/refinement.ts). This handoff refines the earlier acceptance description: **Accept starts artifact publication; the new checkpoint and Accepted decision are committed together only after retained artifacts are complete.**

Presentation: [River App UI](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0). All changes use that exact file. Preserve its current logo, Newsreader, Instrument Sans, IBM Plex Mono and light/dark semantic tokens. No new application shell or workspace was created.

## Paper and component map

The existing review, export and branch designs remain the base. New boards are focused alternative-state sheets. Do not render Pending, Accepted, failed and expired alternatives simultaneously or seed their illustrative names, dates, counts, IDs, content or scores into production.

| Surface | Exact board and JSX subtrees |
| --- | --- |
| Existing source-review page | `2V3-0`; header `2X3-0`; saved queue entry `9Z5-0`; four tabs `2XY-0`, including new Expected fields `9Z8-0` and PDF/report `9Z9-0`; existing source `2Y9-0` and PDF `30Y-0`; coverage `9ZC-0`; footer action row `9ZB-0` and disabled initial acceptance `31S-0` |
| Complete source and manifest review | Board 65 `6ZZ-0`; full source/diff `77Q-0`; complete original/proposed source `791-0`; unchanged-context expansion `796-0`; source hunks `798-0`; candidate manifest/support `77S-0`; full manifest action `7B7-0`; launch `7LA-0` |
| Extracted text, PDFs and report | Board 66 `700-0`; complete text comparison `780-0`; blocking integrity failure `7C5-0` onward; base/proposed PDF and report `782-0`; candidate PDF `7CT-0`; layout warning `7DH-0`; exact coverage and publication-aware acceptance `7DM-0` |
| Existing structured return and promotion | Board 67 `701-0`; return confirmation `78A-0`; excluded source changes `7E2-0`; structured-base comparison `7E5-0`; branch name `7E9-0`; initially unchecked regeneration acknowledgment `7EE-0`; create branch `7EK-0`; saved-branch preview recovery `7EN-0` onward; generic promotion `78C-0` |
| Existing shared Operation recovery | Board 68 `702-0`; stage/cancel states `7G1-0`; failure/staleness `7G3-0`. Source-specific attempt and publication semantics below take precedence over the separate template preview-cycle examples on this board. |
| 96 · Source refinement launch and saved candidates | `9ZG-0`; launch `9ZQ-0`; exact successful checkpoint `A0H-0`; bounded goal `A0T-0`; unavailable base `A16-0`; total-input failure `A1H-0`; queue `9ZS-0`; state filters `A1Q-0`; rows `A22-0`; pagination `A3N-0`; AI-unavailable/manual/base export `A3U-0` |
| Saved rows | Ready Pending `A24-0`; safety-blocked Pending `A2F-0`; publication Pending `A2Q-0`; Accepted result `A31-0`; Rejected metadata `A3C-0` |
| 97 · Source field review and checkpoint publication | `9ZH-0`; field inspector `A01-0`; changed structured field `A4G-0`; moved field `A4T-0`; server-located source-only addition `A54-0`; full-change navigation `A5K-0`; exact review identity `A5T-0`; unchecked coverage `A61-0`; publication `A6C-0`; Accepted result and export `A6P-0`; branch/promotion entries `A72-0` |
| 98 · Source generation preview and publication recovery / Dark | `9ZI-0`; generation progress `A7A-0`; failed generation `A7L-0`; safety-blocked saved source `A7W-0`; saved-preview retry `A8B-0`; expired preview `A8O-0`; exhausted preview budget `A91-0`; failed publication `A9F-0`; cancel-requested publication `A9R-0`; stale evidence `AA0-0`; publication with expired preview `AAC-0`; exhausted publication `AAM-0`; rejection/cleanup `AAY-0`; unavailable profile `AB5-0` |
| 99 · Mobile source candidate review and publication | `9ZJ-0`; reused header `ABQ-0`; review body `AC1-0`; four tabs `ACA-0`; full changed field `ACM-0`; complete field/PDF/report entries `ACZ-0`; unchecked coverage `AD6-0`; failed publication recovery `ADG-0`; base export `ADS-0` |

### Exact visual references

Use `get_jsx` for the above subtree and `get_computed_styles` for exact values when implementing; do not infer them from screenshots. Current JSX was read for the representative queue row `A24-0` and coverage component `A61-0`. Computed styles were read for the original source shell and the new containers/rows/mobile controls.

| Component | Current Paper values |
| --- | --- |
| Desktop focused launch / queue | `9ZQ-0` 600px and `9ZS-0` 752px; 24px column gap; panels use 24px padding, 20px internal gap, 8px radius, 1px `--color-rule` border |
| Field / publication panels | `A01-0` 752px and `A03-0` 600px; same panel vocabulary |
| Queue row | `A24-0`: 18px vertical padding, 16px gap, bottom rule; status lane `A25-0` 104px and trailing-action lane `A2B-0` 88px, both nonshrinking; main text flexes |
| Coverage | `A61-0`: 16px vertical gap; checkbox/label row has 12px gap; visible unchecked square 16px; label Instrument Sans 14px/20px; desktop actions 40px minimum height and 4px radius |
| Original review footer | `31L-0` stacks coverage above `9ZB-0`; the action row retains a 550px scope-description lane, flexible spacer, 73px Reject and 193px Accept controls. Paper uses matching min/max widths to prevent inherited fill sizing from stretching these original controls. |
| Dark recovery | `A0C-0` / `A0E-0` 676px each; 24px padding, 18px gap, 8px radius; `--color-dark-surface`, `--color-dark-rule`, `--color-dark-text`, `--color-dark-muted` |
| Mobile | `AC1-0`: 24px vertical and 20px horizontal padding, 20px gap; 16px/23px body text; tabs `ACA-0` have two flex rows, 10px vertical gap, 169px controls with 12px horizontal gap; all actions at least 44px tall |
| State/action colors | Existing `--color-editor` / `--color-dark-editor` primary; `--color-rule` with `--color-graphite` for disabled light acceptance; established warning and approved tokens. State is always named in text. |

Paper exports presentation divs. Implement semantic buttons, labeled form fields, real checkboxes and accessible tabs/disclosures using River's components rather than copying nonsemantic markup. Full source, manifests and extracted text use scrollable regions without truncation. Keep focus visible and restore it when leaving an inspector.

## Launch and saved queue

Launch from the exact selected **successful checkpoint**, not the browser's unsaved draft or a moving latest checkpoint. Show checkpoint/document Operation, structured-base and template identities, with inspection and normal base review/export available. Start requires complete successful source, expected fields, extracted text and document artifact/report references. An incomplete or failed base directs the Owner to its existing document job.

The current `StartSourceRefinementRequest` pins `checkpointId`, document `operationId`, command identity and a nonempty goal of at most **4,000 characters**. The task's configured complete-input limit is currently **160,000 UTF-16 units**, including its actual captured content. Nothing is silently truncated or sent when the bound fails. Show actual counts when supplied by the server; a pictured count is not an implementation constant. A goal asking for layout alone never narrows the review to layout: unrestricted proposed source can change wording or facts.

Open saved refinements from the checkpoint review or `9Z5-0`. The queue stays scoped to that checkpoint and includes task/Operation state independently of Proposal Pending/Accepted/Rejected. The current list contract uses checkpoint ID and offset. Pagination, filters and displayed counts must describe the real persisted results consistently; do not present a count of one loaded page as the total. Keep selected candidate, filters and scroll on return. A task may fail before creating any candidate; show its saved Operation and original goal without a candidate-review link.

A generated candidate is persisted before its safety/render checks. Pending can mean saved source awaiting preview, blocked source, failed/expired preview, ready review, or publication in progress. Accepted means the result checkpoint was saved; its row opens that exact checkpoint. Rejected rows expose only minimal decision metadata. Queue reads and manual/base export remain available without the AI profile; new-generation controls are hidden when unavailable. A provider failure after an authorized launch remains its saved failed task, with bounded retry only when the original profile and dependencies are usable.

## Four complete review views

All views name the same candidate digest and, when available, exact preview Operation and review digest. Switching views must not switch candidates or adopt a newly completed preview silently.

1. **Source:** complete original and proposed LaTeX, every addition/removal and expanded unchanged context, including the preamble. The original Paper code snippet is only a viewport. Treat candidate source as text in the UI; never execute it in the browser.
2. **Expected fields/support:** all ordered before/after fields, stable locators, source versus structured origin, required-field obligations, movement, complete text, exact evidence references, and meaning/support changes. Existing required fields cannot be silently deleted by omitting them from the intended manifest. Source-only additions use River-assigned locators such as `source/<candidate>/added/<index>` and do not acquire invented structured placements. Show unsupported additions and fresh wording-review issues explicitly.
3. **Extracted text:** complete base and candidate extraction, every text change, additions/removals, multiplicity and order. Candidate extraction is checked against the independently intended field manifest. Do not define expected text from whatever the PDF happened to extract or hide normalization failures.
4. **PDF/report:** complete base and proposed PDFs, all pages/zoom, and the candidate's full validation report with exact source/field/renderer/report identities. Keep base artifacts accessible during candidate failure. A missing candidate PDF is not replaced by the base PDF under a Proposed label.

Classifications are navigation aids, not a substitute for complete changes. Layout-only wording is valid only when intended and extracted text have no changes. Manifest values and a successful compile do not verify factual support. Changed source wording or support receives fresh Needs clarification review; unsupported content retains its separate applicable issue. Exact captured evidence remains inspectable. Source-only headings/content retain the server-assigned roles and review requirements; do not infer those from styling.

If safety checks reject the saved source before compilation, keep complete candidate source and intended-field inspection available. Show **Source safety failed** and no candidate PDF or rendered report. The full computed rendered comparison is unavailable until a preview exists; never substitute an empty diff implying no changes. Correction starts a new explicitly reviewed proposal; it does not modify the Pending candidate under its old digest. Compile, prohibited constructs and integrity failures block acceptance, while valid layout warnings remain visible under the established policy.

## Generation, preview and expiry

Generation and preview each have a maximum of **three attempts**. Render retries reuse the saved candidate rather than invoking generation. Use server attempt counters and real stage text; the initial task may reserve counters before the work finishes. Do not invent token streaming, percentages or separate budgets not present in the contract. Preserve bounded cancellation, safe failure detail, and prior Operations.

The implementation agent confirmed an explicit **Rerender saved candidate** after a successful preview expires. It consumes the remaining **original three-attempt preview budget**. It creates no fresh cycle or budget reset. Candidate files are transient for seven days; expiry leaves the Pending source payload inspectable but blocks acceptance. An exhausted preview task exposes inspection/rejection and manual/base-export paths, without retry.

Failed or Cancelled publication can also rerender an expired preview. Its reserved checkpoint and publication-attempt count stay unchanged. Active publication blocks rerender. After the new preview is saved, the Owner must review it and confirm coverage against its new preview/review identity. Old coverage cannot authorize the replacement, even when the candidate source digest is unchanged. Repeated expiry, refresh, cancellation or new command keys never reset the counters.

## Coverage, publication and result

The coverage checkbox starts unchecked (`9ZC-0`, `A61-0`, mobile `AD6-0`). Its label covers full source, fields/order/support, extracted text, meaning/factual changes and PDFs/report. Opening tabs is not automatic confirmation. Reset confirmation when the candidate, preview Operation, review digest or pinned dependencies change; do not silently carry it into reopened retry review.

**Accept & save checkpoint** requires the current task revision, proposal ID, candidate digest, exact current preview Operation and review digest, passing unexpired complete preview, coverage confirmation and unchanged inputs. Its first success starts a recoverable artifact-publication Operation and reserves one result checkpoint identity. Display Pending/publication state until the four retained files are complete and the checkpoint plus Accepted decision are committed atomically. A reserved ID is not an openable ready checkpoint.

Publication has its own maximum of **three attempts**. **Review & retry publication** reuses the reserved checkpoint, exact candidate and review contract; it does not regenerate or create another checkpoint. Keep prior Operation history. With a current available preview, retry goes through the exact acceptance/review action. With an expired preview, use the original preview budget first, then require new coverage. A failed retry never silently abandons the reserved identity or resets publication count. Exhaustion exposes recovery diagnostics and base export.

Cancellation requested remains distinct from Cancelled. While publication is Pending/Running, do not permit parallel acceptance, rejection or rerender. Wait or request cancellation; if finalization already succeeded, show the saved checkpoint rather than asserting cancellation. All dependent writes require atomic task/proposal/Operation, preview and evidence/context/review/lifecycle guards. Recheck them when finalizing after artifact work. Stale supplied evidence blocks acceptance/publication, preserves inspection, and directs the Owner to compare captured/current inputs and start a new reviewed request. No silent rebase or removal of failed guards.

Only after successful publication show **Checkpoint saved** with its retained PDF, `.tex`, extracted text and report. The new source override and field manifest belong to that immutable checkpoint and link to the unchanged base. It enters the existing checkpoint review/export policy with a new exact issue report. Earlier export acknowledgments never transfer to changed wording or unseen issues. Existing exports and working drafts remain unchanged.

## Rejection and subsequent work

Rejection makes generated source, explanation, field/comparison payload and preview artifacts unavailable in live review. Schedule recoverable cleanup of candidate and incomplete publication objects, preserving original/accepted artifacts. Do not retain generated excerpts in separate queue, audit/idempotency, raw-response, Workflow result, clipboard cache or conversation records. Minimal decision, task and identity metadata remain; ordinary backup retention still applies. UI cache invalidation and guarded late callbacks prevent payload resurrection. Describe object cleanup as pending until confirmed; do not promise immediate deletion of every object or backup copy.

The Accepted result's **Return to structured editing** opens the existing board 67 confirmation. It shows source-only edits excluded from regeneration, comparison with the retained structured base, a new branch/draft name, and an initially unchecked acknowledgment. Confirming creates a new branch and regenerates LaTeX. Preserve accepted source/PDF, original checkpoint and newer draft; never reverse-engineer source changes into reusable Content automatically. A saved branch with failed preview retries that preview without duplicating the branch. Repeated refinement keeps the full chain and original structured base for this comparison.

**Promote layout idea** opens existing generic-only promotion (`78C-0`) and the current template workflow. Pass a new generic brief and supported normalized layout delta into synthetic template generation. Private expanded source, wording, evidence/context and PDF text are excluded. An unisolatable change directs the Owner to a generic brief. The resulting template proposal creates a Draft and follows its own preview, validation and approval; no Approved template or existing résumé binding is changed. These existing forms were inspected and preserved rather than redesigned.

## Implementation and completion

Use the existing source-refinement task/detail/retry/review contracts, protected artifact access and Operation polling. UI task progress is independent from Proposal state and from acceptance publication. Owner-only résumé/template mutations remain separate from external Agent Credentials. The expiry/rerender clarification above was explicitly confirmed by the implementation agent; it does not inherit template generation's separate fresh-preview-cycle behavior.

Mobile reuses the existing header, full text/source inspectors and PDF viewer. Its four tabs stack into two rows with full-size controls; selected fields, support and coverage remain complete. Failed publication has the same reserved-checkpoint and fresh-review behavior as desktop. Status announcements should not steal focus or replace the Owner's inspected candidate. For long data, use scrollable full content and real pagination, not clipped cards.

Paper review covered the original page updates and new desktop, dark and 390px mobile sheets for spacing, typography, contrast, fixed row lanes and content fit. Existing node identities and the current logo were preserved. All edited boards were finalized. No implementation verification or deployment was performed by this design task.
