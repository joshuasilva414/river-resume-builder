# Reviewed job analysis design handoff

Updated 2026-09-05. A dedicated Paper subagent designed these states before implementation, following the Owner's Paper-first instruction. This handoff covers the remaining M3 requirement extraction and bounded evidence ranking. It does not add AI authoring, verification, resume editing, or template controls.

Authoritative file: [River App UI](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0). Existing job, manual selection, proposal, and operation boards remain unchanged. The manual foundation is documented in [jobs-design.md](jobs-design.md).

## Design map

| Surface | Paper node | Use |
| --- | --- | --- |
| 54 · Reviewed AI job analysis entry points · Manual-first | `6DH-0` | Configured actions, exact-input extraction/ranking launch, manual-only and saved-review availability |
| 55 · Requirement proposal review / Light · Illustrative | `6DI-0` | Complete current/proposed maps, all fields, exact passages, identity changes, removed associations, whole-map acceptance |
| 56 · Bounded evidence ranking review · Exact references | `6DJ-0` | Per-requirement results, bounded gaps, exact references, reviewed result selection, global ranking |
| 57 · AI execution, failure & cancellation / Dark | `6DK-0` | Queued/running/cancellation/success, provider/configuration failure, invalid output, bounded retries, save recovery |
| 58 · Persistent proposal review, staleness & rejection | `6DL-0` | Persistent Pending/Reviewed queue, stale inputs, failed acceptance, regeneration, payload removal |
| 59 · Mobile requirement proposal review / Dark | `6DM-0` | Single-column comparison, full field disclosures, removal review, whole-map actions |

Exact subtrees:

- Extraction launch: `6DS-0`; exact posting and target context: `6F1-0` / `6F4-0`; action group: `6FC-0`.
- Ranking launch: `6DU-0`; scope: `6FJ-0`; exact references: `6FO-0`; bounded-candidate explanation: `6FT-0`.
- Configured toolbar: `6G3-0`; manual-only toolbar: `6GH-0`; saved proposals when generation is unavailable: `6SF-0`, action `6SJ-0`.
- Current map: `6E2-0`; retained requirement A: `6GT-0`; removed requirement B: `6H8-0`; affected associations: `6HN-0` / `6HO-0`.
- Proposed complete map: `6E4-0`; updated A: `6HV-0`; new C with persisted identity: `6ID-0`; passage blocks: `6I8-0` / `6IQ-0`.
- Full-map acceptance consequence and actions: `6IX-0`; removal acknowledgment: `6J3-0`; disabled acceptance example: `6J9-0`.
- Pending requirement ranking: `6EC-0`; exact candidates: `6JM-0` / `6JZ-0`; review actions: `6KA-0`.
- Gap and accepted-result inspector: `6EE-0`; bounded gap: `6KH-0`; explicit post-review selection: `6KX-0`.
- Accepted global ranking: `6L7-0`; association selector: `6LC-0`; explicit general selection: `6LQ-0`.
- Operation stages: `6EW-0`; queued: `6NY-0`; running: `6O7-0`; cancellation requested: `6OG-0`; cancelled: `6OM-0`; succeeded with Pending proposal: `6OU-0`.
- Failure collection: `6EY-0`; unavailable provider: `6P2-0`; profile no longer configured: `6PD-0`; validation failure: `6PL-0`; exhausted retry budget: `6PW-0`; proposal persistence failure: `6Q4-0`.
- Persistent queue: `6EM-0`; Pending map: `6LZ-0`; Pending stale ranking: `6M9-0`; accepted summary: `6MM-0`; rejected metadata: `6MS-0`.
- Stale comparison and rejection: `6EO-0`; original/current input comparison: `6N4-0`; failed-acceptance message: `6NF-0`; disabled acceptance: `6NL-0`; reject confirmation: `6NP-0` / `6NR-0`.
- Mobile header: `6QC-0`; proposal context: `6QK-0`; current A: `6QR-0`; proposed A: `6R4-0`; added requirement disclosure: `6RM-0`; removed requirement and affected references: `6RU-0`; decision footer: `6S3-0`.

Read Paper `get_jsx` and `get_computed_styles` for implementation measurements. Screenshots were reviewed at desktop and 390px mobile widths; application implementation was not verified in this design task.

## Agreed contract additions

The current package boundaries and shared atomic command architecture support these workflows. No architecture replacement is required. These are new proposal contracts, agreed with the parent implementation agent:

1. **Extraction produces one Proposal for the complete Requirement Map.** It pins the exact Job Target aggregate revision, posting snapshot, and workspace/map revision used for generation. Acceptance applies the complete reviewed map atomically. There is no row-by-row acceptance of one generated map.
2. The comparison explicitly distinguishes retained identities, additions, and removals. Retain an existing requirement ID only when that correspondence is part of the shown proposal. Assign stable server IDs to added requirements when persisting the proposal, before review. Do not reassign IDs at acceptance or infer correspondence from array position or fuzzy text similarity.
3. Show every removed requirement and the exact count/list of requirement-specific evidence associations acceptance removes. A removal acknowledgment precedes acceptance when associations are affected. General job selections remain. References for retained requirement identities remain. Historical workspace revisions remain unchanged.
4. **Ranking is a separate bounded Proposal.** It pins the job, posting, map/workspace, task scope, and exact evidence dependencies. The server supplies a bounded candidate set from structured filters and FTS. Results may only reference those supplied claim and Evidence Revision identities.
5. Accepting a ranking records the review outcome only. The existing explicit evidence-selection command chooses each exact result afterward. Ranking acceptance never automatically selects evidence, closes a gap, verifies a claim, or mutates a resume/template.
6. Relevant input changes make acceptance fail atomically. No silent rebasing, partial map changes, association removals, or acceptance audit outcome may commit after a failed dependency check. Staleness is separate from `Pending`, `Accepted`, and `Rejected` review state.
7. A failed generation creates no actionable proposal. A successful run must persist its validated proposal before showing a review action. An Operation ends with generation/persistence completion; it does not remain running while the Owner reviews.

Use the exact dependency identities in services. Friendly revision numbers in the interface are labels, not concurrency tokens. Candidate material revisions, review/lifecycle state, and relevant referenced context must be rechecked when they affect the reviewed ranking. A manually changed map, a newly current posting, or archived target also invalidates a proposal aimed at the previous current state.

## Integrating the manual jobs UI

The read-only contract inspection covered `packages/domain/src/jobs.ts`, `packages/contracts/src/jobs.ts`, and `apps/web/src/routes/jobs_.$jobId.tsx`. This was contract review, not testing.

- Keep Add requirement, manual search, filtering, and explicit selection usable without any AI credentials. AI absence is not a job-page error.
- Show Extract requirements only when its server task profile is configured. Show Rank evidence only when its profile is configured and the requested scope is valid. Configuration is checked per task; do not assume one boolean implies every task is available.
- Hide generation actions when unavailable. Do not add browser API-key entry, disabled promotional controls, or a setup interruption to the manual flow.
- The no-profile toolbar with only Add requirement is the no-saved-proposals variant. If saved proposals exist, keep the Proposals entry available even after configuration disappears. Pending and previously reviewed data do not depend on a live provider connection.
- The current requirement row's hardcoded “manually entered” label must change for accepted extraction results. Persist enough origin metadata to display truthful provenance, or use a neutral label where origin is unavailable. A later Owner edit must remain attributable and create a normal immutable workspace revision.
- Historical and archived job views remain read-only. Do not expose generation or acceptance targeting those views. Viewing a historical accepted proposal does not make it current.
- Avoid duplicating evidence selection logic in an AI-specific component. Accepted ranking rows use the existing exact-reference selection action and its current revision guard.

## Extraction launch and complete-map review

The launch panel states the task, exact posting snapshot, current map revision, and job target. It explains that the result is a proposal requiring review. Generating from an existing map does not overwrite it. The complete original posting remains accessible; source text is untrusted task input, not executable instructions.

Show every current and proposed requirement field:

| Field | Current domain contract and presentation |
| --- | --- |
| Text | Required, at most 2,000 characters; show complete text in review |
| Category | Required string, at most 60 characters; no invented closed enum |
| Priority | Required, Preferred, or Unspecified; never infer a hidden default |
| Keywords | At most 30 terms, each at most 100 characters; show all terms |
| Confidence | Nullable 0–1 domain value; display percentage or Unspecified |
| Supporting passages | At most five exact anchors; full quote, posting snapshot, start/end offsets, and derived line location where available |
| Stable identity | Explicit retained, added, or removed identity; never use list position |

The current workspace permits at most 100 requirements and 300 evidence associations. Task input/output budgets may be lower; use configured runtime limits rather than treating these domain maxima as provider budgets. Server validation applies before proposal persistence.

- Confidence describes the model's interpretation of the posting. It is not a qualification score, ATS score, or calibrated probability. Unspecified remains nullable; do not display it as zero.
- Quotes must match the pinned snapshot at start-inclusive/end-exclusive UTF-16 offsets. Show the complete quote and an Open full posting at passage action. Reject fabricated or ambiguous offsets; do not silently repair model output into an unreviewed passage.
- Review must expose complete values, not just a compact text diff. Desktop places current and proposed values beside each other. Mobile stacks Current then Proposed for each identity and uses disclosures for the rest of the map.
- Highlight additions, changes, and removals with both text labels and visual treatment. Unchanged requirements still belong to the complete reviewed map and remain inspectable.
- The fixture removal panel shows Requirement B and two exact associations. In implementation render real affected references and a real labeled checkbox. The acceptance action stays unavailable until the required removal review is acknowledged. Do not automatically check it.
- An empty proposed map must not silently clear the current map. If allowed by the adapter contract, treat it as a complete removal proposal with the same full comparison and explicit consequences. If no actionable valid map was generated, use a completed no-result message and keep manual editing available.
- Accept complete map, Reject map proposal, and Open manual requirements have distinct effects. Manual editing does not apply the proposal. If it changes a pinned revision, returning to the old proposal shows the stale state.
- Accepted changes enter normal revision/audit history with the Proposal identity. Newly added requirements show an explicit evidence gap until the Owner selects evidence.

## Ranking, explanations, and evidence selection

- The launch scope is This requirement or All requirements. Global results can later be associated with This job (general selection) or a particular current requirement through the existing selector.
- Explain that ranking considers a bounded subset of active evidence retrieved for the task. Candidate counts in Paper are illustrative; show the actual count and relevant filters in the saved result. Do not present a missing result as proof that the entire evidence bank has no support.
- Each result exposes stable Claim identity, exact Evidence Revision identity, assertion, review status, and a concise relevance explanation. The existing evidence inspector opens exact citations, processing/source identities, locators, and pinned context.
- Distinguish positive support, partial support, and an unresolved gap. Ranking position does not verify evidence. A Needs clarification result retains that status and the related warning.
- Per-requirement gaps explain what the bounded set did not establish. A gap caused by no selected evidence remains visible after accepting a ranking. Selecting something generally for the job does not close a requirement-specific gap.
- Pending rankings expose Accept ranking review and Reject ranking proposal. An accepted ranking exposes Choose for requirement or Choose for job using the existing explicit selection command. Preserve prior selections unless that explicit command changes their association.
- Recheck the current selection target and evidence reference when choosing a result later. If a saved accepted result is now outdated, retain its history, show the changed reference, and require explicit current-state review; do not silently choose a newer Evidence Revision.
- Global and requirement-centered views show relevance explanations and exact provenance. Do not fabricate numerical match scores or advertise whole-bank coverage.

## Operations, provider failure, and persistence

Use the current Operation states `Pending`, `Running`, `Succeeded`, `Failed`, and `Cancelled`. Queued is the friendly label for Pending. Cancellation requested is a transient request indicator; it is not a terminal Operation state.

- Stage labels describe real persisted progress such as queued, preparing input, generating, validating, and saving the proposal. Do not invent token percentages or stream model text. The browser may poll stage progress.
- Cancel remains bounded by the executing stage. Explain that the current provider step may finish before cancellation is confirmed. Terminal status comes from the server. A late success/cancellation race must never apply domain changes; proposals still require review.
- Provider unavailable after a requested run shows the saved failure, a manual recovery action, and Retry only when the profile and remaining attempt budget permit it. A profile that is no longer configured shows a manual action without a dead retry button.
- Schema/output validation failure states that no proposal was saved. Show safe diagnostic details separately; never put raw provider output, prompts, API keys, or unvalidated suggestions into the actionable review UI.
- An exhausted retry budget removes Retry and keeps the manual route available. Exact retry counts, timeouts, input/output limits, models, and cancellation behavior are runtime outputs owned by implementation; Paper does not pin them.
- If validated generation completes but persistence fails, show proposal-save recovery only if the server has a recoverable result. Retry save must be idempotent and must not accidentally trigger duplicate provider work. Otherwise show failure and the valid bounded retry path.
- A succeeded Operation and a Pending Proposal appear separately. Leaving the page or reloading does not discard the review queue or keep a provider process running.

## Stale input, acceptance, and rejection

The stale panel compares the proposal's original input identities against current identities. Use explicit messages such as “The Requirement Map changed” or “Evidence revision changed” rather than a generic retry error. A server rejection after the Owner clicks Accept states that nothing was applied.

Keep the old Proposal Pending with an Inputs changed indicator. Acceptance remains unavailable. The Owner can keep it for reference, reject it, or regenerate from current inputs when the task profile is available. Regeneration creates a new proposal requiring review; it does not silently replace or accept the previous payload.

Reject confirmation states that rejection removes the proposal content from live storage while retaining a minimal decision/audit record. Pending and accepted content remain governed by the approved proposal history rules. Backup copies expire through the existing retention policy; the interface must not claim immediate deletion from every backup or the provider.

Ensure discarded proposal content is also absent from live cached command responses and ordinary detail endpoints. Minimal retained metadata can identify task, decision, time, and safe record references without preserving the rejected generated payload. No detailed AI trace retention UI is added in this milestone.

## Presentation and accessibility

- Reuse the current River logo, Newsreader headings, Instrument Sans interface text, IBM Plex Mono metadata, and existing light/dark semantic tokens. Blue identifies actions and proposed changes; yellow flags gaps and consequences. Color never carries meaning alone.
- Desktop state sheets map to dialogs, inline review panels, and the existing jobs page. Do not build six unrelated routes simply because six artboards describe the states.
- On small screens, open proposal review as a full-height view with a clear back/Proposals control. Stack current and proposed fields, retain complete passages through accessible disclosures, and keep action targets at least 44px. The long comparison must scroll without fixed overlays hiding the decision footer.
- Mobile ranking uses the same vertical evidence cards and provenance disclosure pattern from manual jobs board `4PA-0`; mobile failures use the reviewed dark operation cards. Do not force side-by-side desktop comparisons on narrow screens.
- Use semantic buttons, actual checkboxes, labeled dialogs, keyboard-operable disclosures, visible focus, and logical focus restoration. Announce operation stage changes and acceptance failures without moving focus unexpectedly. Do not use an indeterminate progress bar to imply measurable provider completion.
- All posting text, claim references, counts, revision numbers, confidence values, and stages in these boards are neutral illustrative fixtures. Render saved application state in production. The design fixture contains no Owner qualifications and must not be seeded as evidence.

## Completion

All six new boards were screenshot-reviewed, including complete desktop comparison/footer, dark operation recovery, global ranking, persistent proposal queue, and 390px mobile review. Existing Paper boards and application code were preserved. Implementation and focused service/browser checks remain with the parent agent.
