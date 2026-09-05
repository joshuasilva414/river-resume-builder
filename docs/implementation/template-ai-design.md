# Phase 2 reviewed authoring and template design handoff

Updated 2026-09-05. A dedicated Paper subagent designed these states before implementation, following the Owner's Paper-first instruction. This task owns Paper and this document only; it does not verify or change application code.

Authority: [SPEC.md](../../SPEC.md), [PLAN.md](../../PLAN.md), ADRs [0007](../adr/0007-require-optimistic-concurrency-and-permanent-idempotency.md), [0008](../adr/0008-keep-operation-history-in-the-application.md), [0011](../adr/0011-use-typed-template-manifests-and-latex-fragments.md), and [0012](../adr/0012-separate-reusable-compositions-from-draft-placements.md). The existing M5 immutable capture, issue-manifest reports, acknowledgments, and original export records remain the export foundation.

Authoritative presentation: [River App UI](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0). Preserve the current logo, Newsreader, Instrument Sans, IBM Plex Mono, and semantic light/dark palettes. Read Paper `get_jsx` and `get_computed_styles` for measurements; screenshots are visual review, not implementation specifications inferred from pixels.

## Design map

Existing boards remain intact:

| Existing surface | Paper node | Continue using |
| --- | --- | --- |
| Template library | `1KH-0` | Approved/Drafts/Retired views, pack gallery, studio entry; saved proposal entry `99X-0` |
| Template studio | `2O3-0` | Guided brief `2QL-0`, synthetic preview `2QO-0`, validation inspector `2QQ-0`; conversation details on boards 91/92; composer input review `2S6-0` |
| Wording queue | `1R4-0` | Queue `1U6-0`, per-item original/proposed review `1U8-0` |
| Final document source review | `2V3-0` | Full source/preview split `2XS-0`, acceptance footer `31L-0` |
| Source extraction and claim review | `31Y-0` | Original source `35P-0`, candidate claims `35R-0`, exact citation review |
| Manual evidence review and merge | `4D0-0`, `4D1-0` | Verification rationale, material edits, retained originals, reviewed merge |
| Persistent proposal and operation recovery | `6DK-0`, `6DL-0` | Bounded attempts, save recovery, Pending/Reviewed queue, stale inputs and rejection |
| M5 checkpoint/export review | `5TM-0` through `5TT-0`, `6BF-0` | Original artifacts, checkpoint-specific issue reports, refresh-before-export and mobile downloads |

New focused state sheets:

| Board | Paper node | Exact implementation subtrees |
| --- | --- | --- |
| 62 · Template brief and iterative proposal · Synthetic only | `6ZW-0` | Brief `709-0`; exact base `97C-0`; candidate review `70B-0`; generate `71V-0`; one-fixture preview `97J-0`; PDF/text/report tabs `97S-0`; preview gate `985-0`; accept as Draft `72J-0`; next adjustment `72P-0`; saved queue/manual entry `998-0` |
| 63 · Template lifecycle and cross-pack compatibility | `6ZX-0` | Lifecycle `70J-0`; design-scoped saved queue `99Z-0`; validate `734-0`; visual review `73L-0`; guarded approval `73O-0`; edit approved `73U-0`; retirement `73Z-0` onward; retired result `7LP-0`; compatibility `70L-0`, failure `74T-0` |
| 64 · Wording proposal review · Exact Content placement | `6ZY-0` | Review `70T-0`; original/proposed `75H-0`; meaning/rationale `75V-0` onward; accept `764-0`; changed meaning `768-0`; exact support `70V-0`; unchanged target `776-0`; stale target `77B-0`; launch `7KW-0` |
| 65 · Final-source proposal · Complete source and manifest review | `6ZZ-0` | Source comparison `77Q-0`; classification `78S-0`; full-file controls `791-0`; source hunks `798-0`; manifest change `77S-0`; full manifest action `7B7-0`; launch `7LA-0` |
| 66 · Final-source text, preview and blocking validation | `700-0` | Text comparison `780-0`; blocking failure `7C5-0` onward; preview/report `782-0`; candidate PDF `7CT-0`; warning `7DH-0`; checkpoint acceptance `7DM-0` |
| 67 · Source checkpoint branch and template promotion | `701-0` | Structured return `78A-0`; exclusion warning `7E2-0`; branch name `7E9-0`; confirmation `7EE-0`; create branch `7EK-0`; preview retry `7EN-0` onward; promotion `78C-0`; allowed delta `7F2-0`; destination `7FB-0`; isolation failure `7FQ-0` |
| 68 · Phase 2 operations and review recovery / Dark | `702-0` | Execution `7G1-0`; cancellation request `7GZ-0`; succeeded + Pending `7HD-0`; failures `7G3-0`; provider unavailable `7HN-0`; preserved review access `7HX-0`; stale inputs `7I6-0`; outdated validation `7IG-0`; rejected result `7IU-0`; template candidate recovery `99R-0`; persisted/rendering `9AE-0`; preview retry `9AR-0`; exhausted cycle `9B5-0`; expiry `9F3-0`; newer-preview rejection `9FH-0`; payload removal `9G9-0`; no-profile manual/review access `9GG-0` |
| 69 · Source-to-claim review and clarification · Draft only | `703-0` | Claim proposal `7GB-0`; exact quote `7J7-0`; create Draft `7JP-0`; duplicates `7GD-0`; Keep separate / Review merge `7KC-0`; clarification `7KJ-0` onward |
| 80 · Source claim generation · Ready extraction and bounded input | `8A6-0` | Launch `8AD-0`; exact ready extraction `8AS-0`; optional contexts `8B8-0`; focus/total input `8BP-0`; generate `8C0-0`; profile availability `8C3-0`; input-limit failure `8CJ-0`; requested-run recovery `8D1-0` |
| 81 · Source candidate queue · Independent review and manual edit | `8A7-0` | Queue `8AN-0`; run/review filters `8DK-0`; Pending rows `8E2-0`, `8EE-0`; Accepted `8ES-0`; Rejected metadata `8F4-0`; empty/unavailable `8FE-0`; candidate payload `8FR-0`; read-only context/notes `8G7-0`; decisions `8GI-0`; stale inputs `8H0-0`; manual transition `8HJ-0`; clarification transition `8HU-0` |
| 82 · Duplicate comparison · Exact pair launch and advisory review | `8I3-0` | Launch `8IA-0`; Pending pair scope `8IO-0`; exact Claim inputs `8IW-0`, `8JB-0`; input cap/generate `8JQ-0`, `8JX-0`; result identity/provenance `8K8-0`; Shared `8KM-0`, Different `8KS-0`, Uncertain `8KZ-0`; acknowledgment/rejection `8L8-0`; reviewed-result attribution and manual disposition `8LH-0` |
| 83 · Duplicate comparison recovery and retained history / Dark | `8I4-0` | Operation `8LY-0`; retry/size failures `8MC-0`; stale pair/claim/context `8MX-0`; retained history entry `8NF-0`; captured/current inspection `8NT-0`; unreviewed comparison after pair disposition `8O7-0`; rejection metadata `8OK-0`; no configured provider `8OS-0` |
| 84 · Manual template editor · Exact scoped component | `8P2-0` | Base/scope `8P9-0`; complete component editor `8PB-0`; full manifest `8QP-0`; fragment `8QY-0`; Section styles `8R2-0`; before/after `8RK-0`; save new Draft `8RU-0` |
| 85 · Complete graph review · Scoped proposal and validation | `8RX-0` | Scoped proposal `8S6-0`; original/proposed/full comparison `8SH-0`; all 14 references `8SP-0`; accept/reject `8X4-0`; full-graph validation `8S8-0`; exact-report approval `8TH-0`; compatibility failure `8TO-0`; stale base `8XC-0` |
| 86 · Cross-pack combination · Exact eligible donors | `8RY-0` | Builder `8XT-0`; component/donor selection `8Y7-0`; replacements `8YR-0`; combination review/save `8Z4-0`; full donor identity `8ZF-0`; inherited styles `8ZT-0`; retirement race `902-0`; eligibility `90E-0` |
| 87 · Approved custom graph · New résumé and composition | `8RZ-0` | New draft `90Q-0`; graph selector `915-0`; fixed/custom options `91B-0`; create `93U-0`; empty custom list `93X-0`; composition `90S-0`; before/apply `91U-0`, `927-0`; retired selection `92G-0`; retained existing binding `944-0` |
| 88 · Scoped template styles and manual recovery / Dark | `94D-0` | Document fields `94K-0`; margin `955-0`; field error `95J-0`; Block fields `94M-0`; inherited-only fields `965-0`; unsaved scope change `96F-0`; manual conflict `96Q-0` |
| 89 · Template saved proposal queue and preview inspection | `99Q-0` | Queue `9A9-0`; design/review filters `9BG-0`, `9BK-0`; ready/failed Pending rows `9BT-0`, `9C4-0`; Accepted `9CF-0`; Rejected metadata `9CQ-0`; pagination `9D2-0`; unavailable/empty `9D8-0`, `9J8-0`; exact brief/base/scope/digest `9DF-0`; full graph comparison `9DS-0`; extracted text `9E6-0`; report `9EP-0`; resulting Draft/iteration `9FQ-0` |
| 90 · Narrow saved template proposal review | `9GR-0` | Review body `9HD-0`; exact input/full comparison `9HH-0` onward; PDF/text/report tabs `9HR-0`; all-pages PDF `9IL-0`; passing acceptance `9IO-0`; expired alternative `9IX-0`; fresh preview `9J2-0`; return to queue `9J5-0` |
| 91 · Template refinement conversation · Exact saved iterations | `9JL-0` | Conversation `9JS-0`; earlier turns `9K0-0`; original instructions `9K4-0`, `9KK-0`, `9KU-0`; Accepted/Rejected/Pending outcomes `9K9-0`, `9KP-0`, `9KZ-0`; composer `9LC-0`; exact base `9LD-0`; earlier instruction selection `9LL-0`; input review `9LT-0`; selected turn inspector `9JV-0`; exact input/full diff `9M5-0`, `9M7-0`; existing proposal review entry `9MX-0`; accepted-result continuation `9N1-0`, `9N9-0` |
| 92 · Template conversation input and recovery / Dark | `9JY-0` | Complete preflight `9NJ-0`; current instruction/base `9NO-0`; selected accepted instruction `9O2-0`; rejected/other-scope alternatives `9OA-0`, `9OI-0`; full input/count/launch `9OQ-0`; overflow `9PO-0`; running turn/cancel `9P0-0`; bounded generation retry `9PC-0`; newer-base comparison/selection `9Q0-0`; unavailable profile `9QC-0`; rejection/reference-only card `9QO-0` |

The sheets contain alternative states together. Do not render success, failure, and stale alternatives simultaneously in the product. Existing app shells are reused; these boards do not imply eight unrelated routes. Counts, names, revisions, confidence values, and candidate facts are neutral fixtures, not production seed data.

## Decisions agreed during design

1. Wording proposals use **stable per-placement target fingerprints**. AI input is bounded to the target Content placement, exact selected evidence/context/decisions, and immutable job snapshot. Acceptance rereads the current draft, verifies that the target and every pinned dependency remain unchanged, then commits with CAS against that currently observed aggregate revision. Unrelated placement edits may preserve validity. Target, dependency, or posting changes require regeneration. A proposal generated from wider resume context cannot use this exception.
2. Final-source proposals include an explicit **candidate expected-text manifest** with stable field/placement locators. Review shows the complete change from the base manifest alongside source and extracted-text differences. Candidate extraction must match that candidate manifest. The model's manifest does not establish factual support; wording changes retain their exact evidence relationships and applicable issue review.
3. Source-to-template promotion uses a **generic design brief plus an allowlisted layout delta**, followed by synthetic-only generation and validation. Expanded private resume source never enters reusable template generation.

These extend service/domain contracts without replacing the current architecture. Effect Schema remains canonical; UI server functions, REST, and MCP share application services. New resume/template mutations remain Owner-only and do not broaden external Agent Credential permissions.

## Shared proposal and execution contract

Every task uses an application-owned Operation and a separately persisted Proposal. Suggested task discriminants are `wording`, `template-create`, `template-refine`, `source-refine`, `source-claims`, and `duplicate-compare`; exact names are implementation choices, while their input boundaries are not interchangeable.

| Record or command | Required contract |
| --- | --- |
| Operation input | Task profile/version, actor, immutable input bundle digest, exact input references, stable dispatch identity, bounded attempt/time budgets |
| Proposal envelope | Stable ID, task kind, immutable candidate digest/payload reference, exact base/target identities, typed dependencies, input-scope declaration, operation ID, independent Pending/Accepted/Rejected review state |
| Proposal acceptance | Actor, permanent idempotency key, observed proposal revision, exact reviewed candidate digest, task-specific target/dependency guards, required review record identities |
| Proposal rejection | Observed proposal revision, stable command identity, minimal decision metadata; remove all live generated payload copies |
| Inspection | Return complete authorized candidate content, exact references, stage or review state, safe failure code, and original/current dependency comparison when stale |

- Persist Operation and dispatch before starting a Workflow. Reuse a stable dispatch identity. Persist immutable artifacts with recoverable upload/finalization states before exposing an actionable result.
- Schema validation precedes candidate persistence. Invalid model output must not become actionable UI content. A valid source/template candidate can retain a failed document validation report for inspection and further refinement, but cannot pass its acceptance/approval gate.
- Progress displays real stages such as preparing, generating, validating fixtures, rendering, extracting text, and saving. Do not show model-token streaming or invented completion percentages.
- Cancellation requested is distinct from terminal Cancelled. A bounded step may finish before cancellation is confirmed. Neither a late success nor cancellation applies domain changes automatically.
- Retries use the same operation/command identity where retrying the same work. A new input or candidate gets a new identity. If a validated result survives a persistence interruption, retry finalization without repeating provider work. Use the existing M3 save-recovery state for this case.
- Hide generation/regeneration controls when that task's server profile is unavailable. Keep pending and accepted proposal inspection available. A requested run that subsequently fails has provider-unavailable recovery and a manual path. Retry appears only when a configured profile and budget permit it.
- Manual evidence editing, wording, approved template use, document preview, and export remain usable without AI. Provider loss is not permission to discard saved review work.
- Pending proposals persist across sessions. Accepted payloads and resulting domain identities stay attributable. Detailed provider traces remain ephemeral; do not add a trace-retention UI or sensitive logs in this milestone.

Rejection must remove payloads from proposal storage, candidate artifact references/objects when no retained accepted record owns them, live idempotency response bodies, and audit payload copies. Retain command identity, result identity/status, task, actor, and timestamps needed for idempotency and audit. A delayed retry returns the minimal rejected outcome, never reconstructs or exposes deleted content. Backups expire through the existing retention policy; do not claim instant erasure from backups or a provider.

## Template revisions, briefs, and lifecycle

Template identity is stable. Each immutable Template Revision contains its validated manifest, fragments, parent/child revision references, assets, and content digest. Separate lifecycle decisions and validation reports refer to that revision; changing a status never rewrites its payload.

- A brief covers structure, density, visual character, and constraints, scoped to Document, Section, or Block level. Template naming is organizational metadata. The studio exposes only fields supported by the manifest contract; it does not invent arbitrary page targets or executable scripts.
- Template task input is a typed synthetic bundle: brief revision, authorized base template revisions, declared style contracts, allowed assets, canonical synthetic fixture-set identity, and task profile. Its service must not load workspace evidence, real Content Revisions, resume text, or expanded final-document source. A prompt instruction alone is not this boundary.
- A candidate exposes the complete manifest and all LaTeX fragments, before/after comparisons for refinement, inherited and overridden values, and synthetic preview. The compact metadata card on board 62 is navigation into the full manifest/fragments viewer, not a substitute for reviewing the complete payload.
- Initial generation persists a Pending template proposal before rendering its candidate preview. Accept as Draft requires a current passing all-types preview for the exact candidate and creates a new immutable Draft revision. Iterative requests generate new proposals against the exact saved base revision; accepted iterations create new Draft revisions, not in-place updates.
- Editing an Approved or Validated payload also creates a new Draft revision. Approval and retirement never mutate or delete an earlier payload, fixture output, or checkpoint binding.
- Lifecycle is Draft → Validated → Approved → Retired. Draft validation records failures without pretending that it passed. Validated requires a complete successful local report for the exact revision and required fixture set. Approved additionally records the Owner's visual review of that report's rendered outputs. Retired is excluded from new-draft selection while historical checkpoints remain renderable.
- Approval uses the exact reviewed validation report, template digest, fixture identity, validator/renderer identity, and component graph. If any relevant input changes, show Validation no longer current and rerun the necessary checks before another approval attempt. Never authorize using an unseen newer report.
- Local structural/extraction validation supports the ATS-safe designation. Do not show an ATS Screener tested designation or fixture-scoring action until the Phase 3 six-simulation workflow is functional. Existing older-board scoring placeholders are not enabled Phase 2 controls.

Concrete service boundaries:

| Service | Guarded result |
| --- | --- |
| Generate/refine template | Pending Proposal over a typed synthetic input bundle; no approved/library payload changed |
| Accept template proposal | New immutable Draft Template Revision plus accepted proposal/result references in one command, pinned to the exact reviewed candidate and successful unexpired preview Operation/report digest |
| Validate template revision | Durable bounded fixture Operation; immutable report and exact artifact manifest; lifecycle qualification only after complete success |
| Approve template revision | Owner visual-review record tied to the exact valid report, plus Approved transition; reject stale reports or graph/lifecycle inputs |
| Retire template revision | Recorded rationale and lifecycle transition, preserving exact historical payload/artifact references |
| Fork/edit template revision | New Draft payload/revision and explicit base reference, preserving the approved source |

The approval checkbox is a real labeled control and begins unchecked. A successful compilation does not check it. Fixture navigation exposes every required preview and report, including all seven content types, long text, Unicode/special characters, repetitions, overflow, and ordering. Layout/page findings stay visible warnings. Compilation, prohibited constructs, required compatibility failures, and missing/duplicated/misordered required extracted text block successful validation.

## Cross-pack compatibility

Board 63 compares exact Document, Section, and Block revisions. Require the declared content/child type relationships, typed slot grammar, inherited style requirements, required/provided tokens, and allowed assets to agree. Matching display names, shared fonts, or a visual resemblance do not prove compatibility.

- An incompatible candidate exposes the concrete failed contract and keeps selection unavailable. Compare contracts and choose a different exact revision.
- A compatibility result pins the complete revision graph and validator identity. Complete synthetic fixture rendering validates the combination; a single component preview is insufficient.
- New reusable combinations follow Draft/Validated/Approved review before becoming an approved option. Binding approved compatible components in a resume still pins exact revisions and uses the shared composition guard. Do not mutate an approved pack to make a combination fit.
- Recheck lifecycle eligibility when selecting for a new draft. Existing checkpoints continue using retired pinned revisions. If a new structured branch needs a retired template, require a separately reviewed eligible compatible choice instead of silently moving to latest.
- Keep existing fixed Classic/Minimal/Technical behavior available. Show cross-pack controls only when the manifest registry and compatibility service actually support them.

## Per-Content wording queue

The editor's Suggest wording for this placement opens `7KW-0`. It identifies one Content placement, its exact selected support, and the immutable job snapshot. The queue at `1U6-0` remains resumable and accepts/rejects suggestions individually; there is no bulk acceptance.

A wording payload contains the complete original visible wording, proposed wording, exact proposed evidence links, reason, relevant posting terms/passages, and a meaning assessment with explanation. Meaning assessment should admit preserved, changed, and uncertain; none is a verification decision. Show full strings and all support changes, not a truncated keyword-only diff.

The target fingerprint must be versioned and deterministically cover the actual bounded input: stable placement identity and semantic binding/type, exact base Content Revision, full local override if present, wording, exact selected evidence links, and any target context actually supplied. Dependencies include exact Evidence/Context Revisions and relevant verification/lifecycle decisions, plus the immutable job snapshot and any requirement-map data actually supplied. Do not claim independence from a field the model received.

Acceptance sequence:

1. Read the Pending proposal, current draft, and all relevant current dependency identities. Verify the candidate digest and target fingerprint still match.
2. Validate every output evidence reference against the bounded input set and preserve exact identities. A reference list is not proof of semantic entailment; the Owner sees the support and meaning explanation.
3. Build a change to this one Content Override, preserving its base library reference and recording complete local wording, exact support, and rationale. Do not change sibling placements, reusable library revisions, or checkpoint content.
4. Commit with CAS against the draft revision just observed, and guards for every pinned mutable dependency. The override, reference indexes, proposal acceptance/result identity, audit metadata, and idempotency outcome commit together. A CAS race or changed dependency rejects all writes.

An unrelated draft edit can leave the target valid because it was not part of the AI input. This is not permission to silently rebase a proposal that used whole-resume context. If wider context was used, pin it and require regeneration when it changes. Multiple proposals for the same target become stale after one is applied. Regeneration creates a new reviewable proposal rather than silently replacing an old candidate.

Accept for this résumé creates a local override only. It never verifies the underlying Evidence Revision or promotes the wording to the library. The existing explicit M4 promotion flow remains separate. If support does not establish a proposed change, the UI directs the Owner to reject it or use manual wording; it cannot label the unsupported new fact verified.

The older Edit proposal control at `1VX-0` is not required for this first implementation. Use Open manual wording as designed. A manual edit changes the normal target and makes the old proposal stale; do not quietly modify a Pending immutable payload while retaining its digest or review acknowledgment.

## Final-document source proposal contract

Start from an exact saved checkpoint whose source, expected text, structured base, evidence/contact/context/template references, and renderer/artifact identities are available. The launch request may favor small layout corrections, but the candidate's technical scope is unrestricted. All changed source and text must therefore be reviewable regardless of the request's wording.

Suggested immutable candidate fields:

| Field | Purpose |
| --- | --- |
| Base checkpoint and structured-base identities | Identify the accepted input and the structure to use when returning to the editor |
| Base source/manifest/artifact digests | Prevent comparison against moving or mismatched inputs |
| Candidate complete source | Preserve the complete proposed LaTeX, not only a patch or model summary |
| Candidate expected-text manifest | Ordered required fields with stable locators, complete expected text, and exact supporting references |
| Source/manifest/text diffs | Complete additions, removals, replacements, and movement, with stable change IDs/locators |
| Change classifications | Layout, wording, factual, or uncertain, with explanation and complete underlying changes still accessible |
| Candidate artifact and validation manifest | Exact PDF, `.tex`, extracted text, local report, source/manifest fingerprint, and renderer/compiler/assets identity |
| Review identity | Candidate digest and full review-coverage confirmation; no carryover after candidate mutation |

Expected-text locators identify existing section/block/content placements and field bindings where available. Source-only additions need stable server-assigned candidate field identities and explicit origin; do not invent a structured placement that does not exist. Removed or moved required fields must appear in the full manifest comparison. Server schema/structural rules remain enforced, so deleting a required field from the candidate manifest cannot silently bypass a required document constraint.

Do not derive the expected manifest solely from whatever text the candidate PDF happened to extract. The candidate manifest is an explicit reviewed intended-text contract. Validate candidate extraction against it for required completeness, multiplicity, and order; show the original-to-candidate text change separately. Preserve the normalization/validator identity used by the document pipeline rather than hiding discrepancies behind a new normalization rule.

The review has four linked views: complete source, full expected-text manifest change, all extracted-text changes, and original/proposed PDF with validation report. Expand unchanged source context and provide full before/after source access. The source excerpt in board 65 is an illustrative viewport, not authorization to omit the preamble or unshown hunks. Labels and change counts come from the saved comparison.

Classification never suppresses changes. A layout-only summary is valid only when both expected and extracted text have no changes. Unknown or disputed meaning remains visible. The manifest and successful compiler checks do not verify facts. Changed wording retains its exact evidence links, and unsupported/uncertain relationships feed the existing evidence-issue review rather than silently inheriting prior approval.

## Source acceptance, export, and return to structured editing

- Candidate compilation, prohibited-construct checks, and text integrity must pass before acceptance. Failed candidates keep inspection and bounded correction/retry available. Layout/page findings remain warnings and appear in the review.
- Accept & save checkpoint confirms the exact source, expected-text, extracted-text, factual/wording, and rendered changes. The checkbox is real and initially unchecked. A modified candidate gets a new digest and new review.
- Atomically create a new immutable checkpoint with a resume-specific source override, base checkpoint link, retained structured base, candidate manifest, exact material references, and ready artifact/report identities; record Proposal Accepted and the result checkpoint in the same command. Guard every relevant target/dependency and proposal state before dependent writes. No original checkpoint or library template is updated.
- Coordinate R2/D1 through the existing upload/finalization protocol. A candidate that has not finalized its complete artifact manifest is not ready for acceptance. A retry resolves to the same resulting checkpoint rather than duplicating output.
- The new checkpoint enters normal M5 review/export. Its exact issue report and digest are evaluated against applicable current review/lifecycle state before first export authorization. A changed issue set gets a new report and explicit review. Prior checkpoint acknowledgments do not transfer. Previously exported historical records remain unchanged.
- Return to structured editing opens `78A-0`. Show all source-only changes excluded from regeneration and the complete structured-base comparison. The accepted source checkpoint, PDF, original checkpoint, and newer working draft remain preserved.
- Confirming creates a new draft branch from the retained structured base and regenerates LaTeX. The displayed branch-name field names that new draft; it does not require a separate branch-title domain concept. Preserve exact compatible template/content/evidence bindings, subject to explicit new-draft lifecycle eligibility.
- Do not reverse-engineer accepted source wording into Content Revisions or silently import source-only edits into the structured tree. Explicit manual content edits or M4 promotion can carry a chosen idea later.
- Branch creation and preview execution are separate recoverable outcomes. If the branch saves and its preview fails, offer Open new branch and Retry branch preview. Never create another branch merely to retry compilation.
- For repeated source refinement, each accepted checkpoint retains the exact preceding source checkpoint and the original structured base. Return-to-editor comparison includes all source-only changes relative to that base, not just the most recent proposal.

## Explicit source-to-template promotion

Promotion at `78C-0` starts from an accepted source checkpoint, but its model input is a new template brief. The displayed allowed layout adjustment is a read-only normalized delta produced by an allowlisted mapping; it is not a freeform LaTeX paste field.

- The Owner chooses a new Draft revision of the appropriate base template or a distinct new template identity. Both preserve the approved revision and all historical bindings.
- Pass only the generic brief, typed allowed layout delta, authorized template base/contracts/assets, and synthetic fixture bundle to template generation. Do not attach the expanded private source, PDF text, wording diff, claim/context records, or source-checkpoint content as hidden model context.
- If the change cannot be isolated into the allowlisted generic form, show Layout change cannot be isolated and ask for a generic design brief. Do not “sanitize” by replacing a name while leaving the rest of a private resume attached.
- Generated promotion output is a Pending template proposal. Acceptance creates a Draft; normal synthetic validation and explicit visual approval follow. Promotion never changes an Approved template or automatically updates resume placements.

## Source-to-claim, duplicate, and clarification completion

Board 69 closes the interaction gaps around existing `31Y-0`. Source/processing previews, citation selection, verification rationale, and reviewed merge already have concrete evidence designs; use those inspectors rather than inventing another provenance surface.

- A source extraction operation may produce multiple independent claim proposals. Each pins the immutable Source Artifact, exact Processing Result, selected context revisions, and complete quoted occurrences. Persist stable candidate identity before review. Each acceptance creates one Draft Claim/Evidence Revision with accepted Proposal attribution; no generated claim is automatically Verified.
- Citations retain exact source and processing identities, complete quote, stable UTF-16 start-inclusive/end-exclusive offsets, and page/line locators when available. The neutral board 69 quote has length 30 and occupies offsets 0–30; production anchors must come from the actual extraction.
- A changed source-processing selection or relevant context requires refreshed review. If the Owner changes the proposed context/citation/assertion in review, persist a new reviewed candidate identity or use the ordinary manual claim editor; do not accept different content under the old digest.
- AI duplicate comparison pins both exact claims/revisions and explains shared and differing assertions/citations/context. It cannot merge by itself. Keep separate records a reviewed disposition. Review merge opens the existing complete merge flow, which requires both observed revisions, preserves the original identities/history, archives the source Claim explicitly, and creates a new Draft target revision.
- A clarification question is attributable to the exact unresolved claim/proposal and evidence revision. The Needs clarification badge on board 69 represents an explicit Owner review decision, not an automatic AI status transition.
- An answer enters as an immutable supporting source or clearly identified Owner attestation through the existing intake flow. The resulting material claim edit becomes a new Draft Evidence Revision. Verification still requires exact citations and a separate recorded rationale.

Service contracts for these evidence controls include persisted per-claim proposal identities/dependency guards; a duplicate-comparison proposal/result linked to the existing manual duplicate disposition; and durable clarification-question references with links to the answering source and revised Evidence Revision. The existing designs do not authorize sending questions externally, inventing answer provenance, retaining free-floating answers as verified facts, or adding an unbounded chatbot.

## Source generation and multi-candidate queue follow-up

Boards 80 and 81 fill the launch and queue gaps in boards 16 and 69. They preserve the existing source page, provenance inspector, manual claim editor, and review surfaces; they do not introduce another application shell. They contain alternative states, so successful, failed, empty and stale examples are not displayed together in the product.

Use the source-detail entry beside the existing Write claim manually action. Show Generate claim proposals only when the server task profile is configured. The modal selects the **current ready source extraction**, up to **10 optional current Context Revisions**, and an optional bounded extraction focus. A source page can preselect its own source; it cannot silently substitute a different processing result when the modal is submitted.

| Launch field/state | Contract and Paper reference |
| --- | --- |
| Exact source | Source Artifact + current ready Processing Result identities, complete extracted text and input digest; inspect original/full extraction via `8AS-0` |
| Optional contexts | Zero to ten explicitly selected current revisions; inspect full saved values, remove or clear selections; no hidden extra context; `8B8-0` |
| Optional focus | A task-scoped bounded instruction; it does not authorize unsupported claims, source mutation or broader workspace access; `8BQ-0` |
| Total input | Server-computed size of the actual bounded task input, including complete extraction, selected contexts and focus; **160,000 UTF-16 units maximum**; `8BU-0` |
| Size failure | Show actual total and limit; block provider dispatch; changing optional context/focus is explicit; no hidden truncation/splitting; `8CJ-0` |
| Unready selection | Processing, failed or superseded extractions do not start the requested run; inspect processing/select current ready result; `8CX-0` onward |
| Profile absence | Hide new-generation controls; manual claims and saved review stay available; `8C3-0` |
| Requested-run failure | Preserve input and prior saved candidates; provider-unavailable/validation/save recovery follows the bounded Operation contract; `8D1-0` |

The count uses the same UTF-16 convention and serialized input boundary as the server preflight, not an approximate browser token estimate. The source is supplied completely. An extraction that alone exceeds the cap requires manual claim creation; the application does not quietly process a prefix or manufacture several runs. The pictured totals are examples. A changed optional context/focus produces an explicitly different input bundle.

Generation yields up to **20 independent candidates**. A valid completed run may yield zero; show No candidates were found and retain manual/source-inspection actions. An invalid output is not an empty successful run. Each actionable candidate has a stable server identity/digest, full assertion, exact citations, proposed context references restricted to the supplied set, explanatory notes and optional clarification questions. Validate every quote and offset against the pinned complete Processing Result; repeated text must retain the chosen exact occurrence. Do not invent a citation location when the parser cannot provide one.

The queue groups candidates by the actual source/extraction and generation run. Review filters use Pending, Accepted and Rejected; **staleness is independent of review status**. Display saved candidate counts, run time and Operation state from persistence. Generation complete means candidates are available for review, not that any Claim was created. Pending review survives reload and provider loss. A newly completed run does not silently replace the candidate currently being inspected.

Board 16's old selection checkboxes and bulk Add draft claims footer are not the implementation contract. Board 81 uses individual decisions. Board 69's apparent context selector is replaced in this follow-up by the read-only saved context list at `8G7-0`. Changing assertion, citations or context uses Edit manually; acceptance never submits edited values under an old digest.

Individual transitions:

1. **Create Draft claim** at `8GO-0` requires the Pending candidate's observed revision/digest and exact pinned source/context dependencies. Recheck the current ready processing selection and every context actually supplied to generation. Source/context changes reject acceptance atomically and preserve the Pending candidate for inspection. The new Claim, initial Draft Evidence Revision, exact citations/context, accepted candidate/result attribution, any claim-linked clarification questions, indexes, audit and permanent idempotency outcome commit together. Verification is a separate Owner decision.
2. **Accepted** candidates link to their resulting Draft Claim. Do not offer another acceptance action. Retrying the same command returns that result; accepting one candidate does not alter siblings or create a bulk acceptance outcome.
3. **Reject candidate** removes its live generated assertion, citation copies, context proposal, notes and questions, leaving minimal decision metadata. Accepted siblings and original source/extraction/context data stay intact. There is no rejected-payload preview or generated excerpt in history.
4. **Inputs changed** at `8H0-0` identifies reviewed/current processing and context revisions. Compare old/current inputs, then Refresh generation inputs opens launch for a new run and new candidates. Old candidates do not get silently rewritten or rebased. Reject remains available for a stale Pending candidate. Previously Accepted outputs retain their original attribution.
5. **Edit manually** at `8GM-0` opens the ordinary claim editor through `8HO-0`, optionally initialized with the candidate's visible assertion, exact citations and context. All fields use normal manual validation/review. The original candidate remains Pending. Saving produces an independent manual Draft Claim and records origin candidate ID/digest in audit metadata; it does not mark the candidate Accepted or reuse its acceptance receipt. Return to candidate lets the Owner separately review or reject the original.

The implementation agent confirmed independently removable candidate payloads. The parent task/Operation retains original input and execution metadata, and Workflow step results contain no generated output. Avoid a durable raw batch response containing all twenty candidates: rejection must remove that candidate's content from shared batch copies, Operation results, receipts and audit payloads as well as its primary row. Per-candidate storage preserves siblings while allowing this deletion. Original supporting source text is not generated payload and is not removed by rejecting a proposal.

Clarification questions stay within Pending candidate payloads. On acceptance they become durable questions linked to the created Claim; rejection creates no separate question copies. The question chip on `8EE-0` is a review note, not an automatic Needs clarification decision. After a Draft exists, the Owner can use the existing claim review at board 69 to record that decision. Answers enter via immutable supporting-source or explicitly identified Owner-attestation intake. Link the answer to the question and a new Draft Evidence Revision, then verify separately. Do not edit an accepted or Pending candidate payload to append an answer under its original digest.

Use the existing narrow-screen form and full-screen provenance/review patterns: stack launch fields, list and inspector; keep full assertions/quotes accessible; retain 44px actions and visible Return to queue/Cancel. Semantic light/dark tokens carry over from the existing claim and Operation surfaces. No new settings page, editable API key form, bulk verification, automatic duplicate merge, or external messaging is implied.

## AI duplicate comparison follow-up

Boards 82 and 83 add only the missing controls to the existing possible-duplicate review at `7GD-0`, manual merge at `4D1-0`, and claim-history inspector at `4MQ-0`. They are state sheets, not new pages or a chat surface. All pair IDs, assertions, citation locations, review decisions, totals and dates are illustrative. The existing source/evidence/merge pages remain the base.

Generation is scoped to **one current Pending duplicate pair**. The Owner cannot start this action over an arbitrary unreviewed collection of claims or a pair already kept separate/merged. Show Generate comparison only with a configured server task profile. Manual Keep separate and Review merge remain available through their existing commands without AI attribution.

The launch (`8IA-0`) identifies the exact pair/revision and both stable Claim identities, aggregate revisions and current immutable Evidence Revisions. Display their complete assertions, exact cited passages/Processing Result identities and offsets, captured context values, lifecycle state and review decisions/rationales. Inspect provenance opens the existing authorized evidence inspector. Preserve the exact context/citation revisions referenced by the evidence; do not silently substitute latest values under historical identities. Capture current dependency observations separately where the staleness guard needs them.

Input is bounded to those two claims and the captured citation/context/review data. Job targets, resume content, unrelated evidence and general workspace search are outside the task. The provider receives the complete bounded bundle, with a **160,000 UTF-16-unit total-input cap** using the same server-side counting boundary as preflight. Show the actual total/limit. Overflow blocks provider dispatch; do not drop citations, shorten assertions, replace context with summaries, or silently split the comparison. The manual review path remains usable.

The persisted result has a stable comparison identity/digest, exact input/dependency bundle, Operation/task-profile identity and complete Shared, Different and Uncertain findings. It is advisory. Do not invent a duplicate-confidence percentage, automatic merge verdict or verification outcome. Any displayed support link must resolve to the captured input's actual reference; a model explanation does not establish factual entailment. Invalid output is a failed generation, not an actionable comparison with missing categories.

Show all findings and complete captured values. Long lists may scroll or use disclosures, but summaries cannot hide unreviewed findings. The Captured inputs / Current provenance controls (`8KF-0`) open clearly labeled inspection of original versus current assertions, quotes/locations, context values, review states and rationales. Changes appear explicitly; the current view never overwrites the immutable captured bundle. Preserve original quote occurrence offsets when text repeats.

There are three independent state axes: Operation progress, comparison review, and pair disposition. Generation success creates an Awaiting review result. It does not resolve the pair, create/change a Claim, archive anything or verify evidence. **Mark reviewed** (`8LD-0`) is an acknowledgment of the exact saved result, not acceptance of its conclusions as facts. Rejection (`8LB-0`) removes the live generated payload and retains minimal decision metadata.

The parent implementation agent confirmed the stale/historical boundary: when the pair or relevant dependencies change, an unreviewed saved comparison permits **inspection and rejection only**. It cannot be newly acknowledged as a historical result. Previously acknowledged results remain visible but cannot authorize a fresh disposition under stale references. A new generation requires a current Pending pair and current input guards.

| Command or read | Required contract |
| --- | --- |
| Generate comparison | Owner, permanent command identity, Pending pair identity/revision, both exact observed Claim/Evidence identities, captured supporting data/current dependency observations, bounded input digest, configured task profile |
| Inspect comparison | Complete authorized immutable input/result, current pair/dependency status and reasoned differences, separate Operation/review states; readable through either Claim after pair disposition |
| Mark reviewed | Observed Pending comparison revision, exact reviewed digest, still-current Pending pair and atomic relevant Claim/context/review/lifecycle guards; acknowledgment, audit and idempotency result commit together |
| Reject comparison | Observed Pending comparison revision/digest and command identity; allowed when dependencies or pair are stale; remove generated findings from live payloads and every generated receipt/audit/Operation copy |
| Manual disposition with attribution | Existing Keep separate or merge request plus optional exact acknowledged comparison identity/digest; validate pair membership and all current dependencies atomically with the disposition's existing guards |
| Manual disposition without attribution | Existing guarded command; AI availability, generation failure or stale advisory output does not gate it |

After acknowledgment, `8LH-0` offers an initially unchecked **Link comparison in this decision's history** control. Optional attribution is a reference in the decision record, not a Context Record or evidence citation. Keep separate remains an explicit Owner disposition. Review merge opens the full existing form: choose the kept/archived claims, assertion, exact citations/context and rationale. The confirmed merge creates a new Draft Evidence Revision, archives the other stable Claim, and preserves both original histories/provenance. A reviewed comparison does not prefill-and-submit or silently promote generated findings into that revision.

If attribution was selected and its guards fail, reject the complete dependent command. Do not silently remove the comparison reference and retry the manual action. The Owner can inspect current inputs and explicitly choose an ordinary manual action without attribution. Failed comparison acknowledgment likewise has no dependent pair or Claim writes. A successful pair disposition does not change the comparison's historical payload/review record.

Operations use the existing durable dispatch/Workflow boundary and a **three-attempt total budget per operation**. Show actual Preparing → Generating → Validating → Saving stages, not tokens, percentages or a running duplicate score. Cancel requested is separate from terminal Cancelled. A late provider result follows the operation-state guard and cannot automatically resolve the pair. Retry failures only while a configured task and remaining budget permit; show attempt 1/2/3, preserve diagnostics at exhaustion, and retain manual review. If a valid persisted result only needs finalization, recover its save without regenerating it. A changed input starts a new explicitly identified run rather than rebasing the old output.

Provider absence before launch hides Generate comparison (`8OS-0`). Failure after a requested run shows provider-unavailable recovery and bounded retry (`8MC-0`). Both keep saved comparisons accessible. A failed or cancelled later operation does not replace a previously saved result. Rejection removes Shared/Different/Uncertain payloads from primary storage and any live raw response, idempotency, audit or Operation result copies. Original supporting source/claim/context records are preserved; backup copies follow existing retention.

Saved access must not depend on membership in the Pending duplicate queue. Add the comparison identity/state/time and **View saved comparison** to both Claims' history/inspectors (`8NF-0`). After Keep separate, the comparison remains available beside that decision. After merge, retain access on both the kept Claim and the archived original; follow the existing historical-inspection controls. A pair resolved before acknowledgment shows Awaiting review + pair no longer Pending, with Inspect and Reject only (`8O7-0`). Rejected history shows identity, actor/time and Rejected, without generated excerpts or a payload-view link (`8OK-0`).

Use the existing source/provenance dialogs for captured/current inspection. At narrow widths stack Claim A/Claim B and the three findings groups; wrap action rows with 44px targets, preserve focus/return location and full text. The light and dark sheets use River's existing semantic tokens. No new application boundary or external Agent Credential authority is needed; these AI review/generation actions remain Owner-only.

## Manual template editor and exact graph follow-up

Boards 84–88 fill missing controls within the existing library (`1KH-0`), studio (`2O3-0`), lifecycle (`6ZX-0`), new-draft dialog (`5RP-0`) and composition layout inspector (`5I8-0`). Preserve those references and shells. These are focused alternatives and inspector/dialog contents, not five new pages. The new-draft fields on board 87 are cloned from the existing dialog. Board 88 supplies the dark palette and the Document/Block field variants; board 84 shows Section fields.

The implementation agent confirmed that **a stable template design owns immutable complete graph revisions**. A selected editing scope identifies one component within that graph. Validation and approval qualify the complete rendered graph; components do not gain an independent lifecycle. A custom graph owns its captured components and donor provenance. Later retirement of a donor does not change or revoke an independently approved combination. This clarification supersedes any older wording that implies a component has an independent approval decision.

The graph has 14 keyed components: one Document; Summary, Experience, Project, Education, Skill and Credential Sections; and Contact, Summary, Experience, Project, Education, Skill and Credential Blocks. Contact is a direct document-header Block, with no Contact Section. Keep the three built-in complete graphs available: Classic, Minimal and Technical, currently revision 1. Illustrative older-board pack revision numbers and scoring badges are not runtime identities or enabled capabilities.

### Manual edit and review

Start from an exact built-in complete graph or an explicitly selected immutable saved base. Choose Document, Section plus one of six types, or Block plus one of seven types. The component selector changes the editor target, not the approval scope. Preserve unsaved local manifest/fragment input when navigating or recovering. The scope-change warning (`96F-0`) requires keeping the current editor or explicitly discarding local input; saving a new Draft first is the ordinary save action.

The payload region shows the **complete** selected manifest and LaTeX fragment, with controls to inspect the original, proposed and full difference. Display all slots, content/child declarations, style contract, inheritance, overrides, assets and validator metadata. Identity fields are assigned by River. Do not replace the manifest with a summary or omit long fragments from review. Code areas may scroll, and a full payload view must remain available. Complete comparison shows both exact base and candidate component references/digests; the all-components list (`8SP-0`) makes unchanged references explicit.

Typed controls and the manifest editor describe one payload. A change in either must be reflected in the other before saving; avoid two conflicting sources of truth. Structural/field errors identify the exact field or fragment location and retain the entered value. The declared component scope, typed slots, allowed assets and closed fragment grammar remain server-validated. Unsupported commands, arbitrary template scripts or user-supplied executable code are not enabled by the raw source editor.

The confirmed style controls are:

| Token | Allowed value | Editable scope |
| --- | --- | --- |
| `font` | Latin Modern Roman or Latin Modern Sans | Document, Section, Block |
| `bodySize` | Integer from 9 through 12 pt | Document, Section, Block |
| `sectionSpacing` | Integer from 4 through 20 pt | Document or Section |
| `margin` | Number from 0.5 through 1 in | Document only |

Each eligible field offers Inherit or a typed override and shows the resolved inherited value. Reset removes that override; it does not copy the current inherited value into a permanent override. Ineligible fields show resolved values and their controlling level without an editable control. Resolve Document defaults, then Section, then Block. Contact inherits directly from Document. Imported components inherit from their destination parents unless their own manifest declares a permitted override. The implementation agent confirmed actual scoped compositor behavior for these fields; the controls must not be decorative.

**Save new Draft revision** captures the complete resulting graph, exact immutable base, changed component and attribution in one guarded command. Only the selected component payload changes. Preserve all other component payloads and references. Editing an Approved/Validated revision creates a new Draft payload; it never mutates the approved graph, saved report or existing résumé binding. A saved Draft is not automatically Validated or Approved.

Manual save uses the observed template aggregate revision and permanent command identity. A race preserves the local form and exposes full local/base/current comparison and explicit reload (`96Q-0`). Any option to preserve that form as a new template Draft must create a separately named design from the captured immutable graph, not overwrite a newer revision or silently rebase the component. If that explicit create-from-preserved-input command is unavailable, keep comparison/copy-out/reload and hide its save control until functional.

### Scoped proposals and complete validation

A generated proposal replaces exactly one keyed Document/Section/Block component in an exact captured full graph. Its input remains synthetic-only. Store the captured graph identity/digest, scope, complete candidate component payload/digest, unchanged component references, synthetic fixture manifest and task/Operation identity. Schema validation must reject output that changes another scope or imports private résumé/evidence data. An exact reviewed proposal creates a new Draft graph atomically; the proposal cannot update the approved base in place.

Board 85 retains separate execution, Pending review, accepted Draft and validation states. Accept/reject operates on the full scoped candidate digest. A newer base or changed pinned dependency makes acceptance stale; inspect/reject or explicitly regenerate against the selected current graph. Do not transfer approval or a review acknowledgment to a new candidate. Hide generation/regeneration when its server profile is absent; keep manual editing and saved proposal review. Reuse board 68 for durable stages, cancellation, bounded retries, provider loss and rejected-payload removal.

Every saved manual, generated or mixed Draft graph validates against **all canonical synthetic fixtures using the complete resulting graph**, including fixtures covering all seven content types. Run all four fixtures twice. The immutable report pins the full graph digest, required fixture manifest, renderer/validator/assets identities and complete artifact results. No isolated component preview, donor approval or one successful candidate PDF qualifies the combination. All required outputs remain inspectable. Failure or an incomplete result blocks validation/approval; layout findings remain reviewable according to the existing warning policy.

Approval requires an initially unchecked Owner visual-review acknowledgment of the exact valid report and all required rendered outputs. The disabled action in `8TH-0` is intentional until its real gate passes. Recheck report/graph/fixture/lifecycle identities atomically. The real child-type failure on board 85 replaces the older board 63's illustrative “heading style token” example: `heading` is not an implemented style token. The separate ATS fixture-scoring designation remains governed by the Phase 3 contract, not ordinary document validation.

### Exact donor selection and résumé binding

Cross-pack selection (`8Y7-0`) chooses a destination component key and an exact eligible donor **full-graph revision**, then the corresponding scoped component key/digest. Eligible donors are built-in fixed graphs or Approved custom graph revisions. Draft, Validated and Retired custom revisions cannot be newly selected as donors. Inspect complete original/donor manifests, fragments, full selectable digests and the destination's resolved inheritance before adding the replacement. Multiple explicit replacements build a reviewable combination; all remaining base references stay exact.

Creating the new combination atomically checks every selected donor graph's observed eligibility and component digest. A retirement/race rejects the whole dependent save, preserves the local selection, and asks for an explicit eligible donor. Never silently choose a newer revision or remove a failing replacement. The new graph keeps donor identities/digests in provenance and follows its own Draft → Validated → Approved lifecycle. Its later eligibility is based on its own approval, not current donor lifecycle.

Add the exact approved custom graph selector to the existing new-draft dialog and composition layout controls (`90Q-0`, `90S-0`). Keep fixed Classic/Minimal/Technical choices. Each custom option shows its design name, immutable revision and Approved state and opens its exact graph/report/fixtures. “Latest” is not a binding. Exclude Retired/Validated/Draft options from new selection; with no eligible custom graphs, keep fixed packs and a normal template-library entry. Do not display a fake approved option while the registry is empty.

Creating a résumé pins that exact graph and its immutable posting association. Applying a graph to an existing saved draft uses its current aggregate revision and selected graph eligibility guard, creates a new draft revision, and requests a new preview. Show the exact before/after graph and all resolved layout changes before applying. Preserve wording, evidence, placements and existing checkpoints. Keep the last successful PDF labeled with its revision/freshness while the new graph renders.

A graph retired between selection and save rejects the new binding atomically (`92G-0`). An already pinned retired graph remains inspectable/renderable for that existing draft and historical checkpoints (`944-0`); it is not silently upgraded or removed. New bindings, including a new structured branch, require an eligible explicit graph choice. Changes to a custom graph never push updates into existing résumé bindings.

These contracts extend the existing template registry, deterministic compositor, command and document-operation services; they do not require replacing the architecture or broadening Agent Credential authority. The read-only manifest inspection established the actual four-token catalog and fourteen-component shape. The implementation agent owns the new graph persistence and scoped inheritance behavior. This handoff does not claim those changes are implemented or tested.

## Saved template proposals and candidate preview follow-up

Boards 62, 85 and 68 now distinguish a **candidate preview** from an accepted Draft's **complete validation**. The additions preserve their original nodes. The template library tab (`99X-0`) and exact design inspector action (`99Z-0`) open the same saved proposal queue on board 89. The design inspector preselects the stable design identity while retaining access to proposals from earlier immutable base revisions. Board 90 supplies a narrow saved-review layout; it does not add full mobile template authoring.

### Candidate persistence and preview

Generation targets one Document/Section/Block component in the captured complete graph. Keep the exact brief, base graph, scope, synthetic input/fixture identity, profile/Operation identity, and complete candidate component/graph digests. Show complete before/after graphs and component manifest/fragment differences through `9DS-0` and the existing fourteen-component comparison. Do not show only the changed fragment or a model-written summary as the complete review.

Persist the schema-valid immutable candidate and its Pending review state **before** starting document rendering. Generation output and preview artifacts have separate persistence and recovery states. A successful generation followed by a failed render must leave a saved candidate in the queue. Retry rendering that exact candidate without invoking generation, replacing its payload or changing its digest. Workflow step/result copies must follow the existing removable-payload rules.

The initial candidate preview renders the **complete resulting graph once** using the canonical `all-types` input from `river-template-fixtures-v1`. This input covers all seven content types. The preview shows its real PDF, complete extracted text and complete validation report, along with exact candidate/graph and preview Operation/report identities. The Paper PDF thumbnail and text excerpt are illustrative navigation into those complete artifacts; do not seed them as real runtime output or use the thumbnail as proof that text passed.

Expected text comes from the canonical synthetic document and its deterministic expected-text contract, not a model's proposed description of successful output. Compilation/prohibited-construct checks, exact graph checks, text integrity and required runtime/renderer identity checks must pass. Layout findings remain visible under the existing warning policy. Missing output, failed text/graph/runtime validation or an unfinished artifact publication blocks acceptance. A Preview passed label never changes template lifecycle to Validated or Approved.

The preview report and protected PDF/text/report downloads all belong to the same immutable preview Operation. Show rendered time and expiry. A full report contains the real validator results and identities, not merely the three compact status labels shown on board 62. Reading another tab or downloading a file must not silently switch to a different preview revision.

### Independent bounded budgets and expiry

The implementation agent confirmed two distinct budgets: generation has its own three-attempt task budget; each preview cycle has a three-attempt render budget. A preview attempt exposes Preparing → Rendering → Extracting → Checking → Saving preview stages. No token streaming, progress percentage or invented fixture completion count is implied.

Within a cycle, failures and cancellation share the three-attempt limit. Cancel requested is distinct from Cancelled. A late render result cannot accept the proposal or revive a rejected payload. Retry is available only with remaining attempts and still-current candidate guards; an exhausted cycle permits inspection/rejection and ordinary manual paths. Failure does not silently create a new cycle, rerun the model, or reset either budget.

Candidate preview files are transient for **seven days**. Expiry removes the preview files without removing a Pending candidate. An expired successful preview blocks acceptance and exposes **Render fresh preview** (`9FA-0`, narrow `9J2-0`). The Owner explicitly starts a new bounded preview cycle for the same exact candidate; this fresh cycle has three attempts and does not regenerate output. A refreshed cycle that then fails/cancels cannot repeatedly use the same old expired preview as authority to reset its budget again. Record the expired preview/cycle being refreshed and guard that transition atomically.

New generation/regeneration is hidden without a configured server template profile. Saved candidate inspection, manual editing and document preview rendering remain available without that AI profile. A requested provider run that fails uses the existing failure state rather than making saved review disappear. Do not confuse an unavailable AI profile with a document runtime failure; each has its own action availability and diagnostics.

### Exact acceptance and review recovery

Accept as Draft requires the Pending candidate's observed review revision, exact reviewed candidate/full-graph digests, current base/scope guards, the **exact reviewed successful preview Operation and report digest**, and unexpired complete artifacts with passing required checks. Check these atomically with creation of the new immutable Draft graph, proposal acceptance/result identity, indexes, audit and permanent idempotency outcome.

An open view using OP24/report PR04 cannot authorize a replacement OP25/report PR05, even when candidate content is unchanged. Show **A newer preview is ready** (`9FH-0`) and require review of that current PDF, text and report. Do not transfer a prior review reference to a new preview silently. Expiry or staleness between opening review and submitting acceptance similarly produces no Draft. Changed base/component dependencies follow the existing stale-proposal comparison/regeneration path; a render retry does not rebase them.

Accepted proposals link to the exact resulting Draft through the queue (`9CN-0`) and inspector (`9FW-0`). Open that Draft for full validation, manual editing or the next exact-base conversation turn (`9FY-0`, `9N9-0`). The existing adjustment field `72P-0` can seed an unsent instruction through its conversation entry `72V-0`. Accepted history remains attributable when transient candidate preview files expire. Do not offer a second acceptance or make the accepted Draft depend on those transient files.

After acceptance, full validation is a separate operation over all four canonical fixtures, each rendered twice: `all-types`, `unicode`, `long-content`, and `repeated-order`. All eight required runs and the complete report must pass the existing deterministic/document gates. The Owner then performs the separate visual review/approval. The candidate's one-fixture preview cannot satisfy or skip any of these runs (`99I-0`). Fixture labels and counts come from the canonical manifest, not hard-coded illustrative queue counts.

### Queue, rejection and narrow behavior

The saved queue has All/Pending/Accepted/Rejected views, an explicit design filter, real status/count data and cursor pagination. Preview state is independent of review state: ready, rendering, failed, expired and stale candidates can remain Pending. Accepted rows link to the result; Rejected rows expose metadata only. Preserve selected queue/filter/scroll state when returning from inspection, and never replace the currently reviewed proposal with a newly completed one.

Rejecting a Pending candidate removes its generated manifest/fragments/full candidate graph payload and all live preview artifacts, plus generated copies in receipts, audit payloads, raw responses and Operation results. Retain minimal identity, base/scope/task and decision metadata needed for audit/idempotency; preserve original immutable bases and user-authored briefs. Do not retain a candidate excerpt, generated source download, full preview report containing removed payloads, or artifact-view link in the Rejected row. Late generation/render/finalization callbacks must honor rejection and clean up their candidate artifacts instead of recreating live payloads. Existing backup retention still applies.

The narrow layout stacks exact input, full comparison, PDF/text/report and actions. Use 44px controls and 16px body text. Full code/text views can scroll without truncation; PDFs provide all-page access and zoom. An expired alternative offers rerender/inspection/rejection without an active Accept action. Keep the existing back/queue navigation and restore focus on return. Full template editing remains the existing desktop workflow.

## Conversational template refinement

SPEC's iterative AI chat is an ordered conversation, not a sequence of disconnected brief forms. Boards 91/92 extend the existing studio with successive original Owner instructions, their exact input bases, saved Operation/proposal cards and explicit resulting Draft links. Keep the guided brief for initial generation. **Open refinement conversation** (`72V-0`) and **Continue conversation** (`9FY-0`) enter this same surface within the studio; they do not create a new app shell or a general workspace chat.

The conversation belongs to one stable template design. Each turn records an ordered identity, exact immutable full-graph base and selected component scope, the full original user-authored instruction, and task/Operation/proposal references. Show real timestamps and support earlier-turn pagination without changing the current composer or losing the selected review. The visible conversation may include different component scopes; each turn labels its own scope and base. History being visible does not make the whole history provider input.

### Exact input before every turn

The composer always shows its exact selected base graph (`9LD-0`) and scope. **Continue from Draft 3** (`9N9-0`) explicitly selects that accepted result for the next turn. It never follows a moving head. A newer graph shows comparison and an explicit **Select revision** action (`9Q0-0`); choosing it requires another complete input review. Pending proposal changes are absent from the selected saved base. Do not silently include them, wait for later acceptance and launch against that new result, or apply an unreviewed candidate to continue the chat.

The implementation agent confirmed the visible earlier-instruction selection policy:

- Default original instructions from prior **Accepted turns with the same exact component scope** to selected. Rejected, failed, unaccepted and other-scope turns default off.
- The Owner can explicitly adjust this list before launch. Each option shows the full original instruction, task identity, scope, review outcome and accepted result when present. Selecting a rejected turn includes only its original user-authored instruction.
- Snapshot the selected task IDs and complete original instruction text into the new immutable task input. Later history changes cannot alter what that turn received. These original inputs remain distinct from generated candidate payloads.
- Send only the exact selected full graph and scope, canonical synthetic fixtures, the current design instruction and explicitly selected original prior instructions. Do not send generated historical explanations, an entire stored conversation transcript, unrelated workspace records, evidence, jobs, or private résumé text. The selected accepted graph already carries its accepted template changes.
- Show the complete input and its actual total before launch (`9OQ-0`). Count every included field against the same **160,000 UTF-16 unit** cap. On overflow (`9PO-0`), preserve the unsent instruction and selection, offer editing/deselection, and send nothing. Do not silently truncate, summarize, omit selected instructions or substitute excerpts.

The Paper counts and task IDs are neutral illustrations. Review input remains disabled for an empty current instruction. Scope changes recalculate default eligible prior-instruction selection visibly; preserve any unsent instruction and require review of the resulting exact selection. Explicit Owner choices must not be silently overwritten during background refresh. The finalized immutable input is the server-validated input that generation actually receives.

### Conversation outcomes and recovery

User instruction bubbles contain original input. Generated response cards read their current saved Operation/proposal state by reference. A Pending card opens the existing complete graph and synthetic PDF/text/report review; the conversation itself has no automatic acceptance action. A passing candidate preview leaves the base unchanged. After explicit guarded acceptance, show the exact new Draft and a separate continuation action. Full four-fixture, twice-per-fixture validation and visual approval remain separate from chat and candidate acceptance.

Generation exposes real stages, cancellation and the existing three-attempt task budget (`9P0-0`, `9PC-0`). Cancellation requested, Cancelled and exhausted states reuse board 68. Retry uses the same exact captured turn/input and remaining task budget; editing input starts an explicitly requested new turn. Candidate persistence, preview retries, seven-day expiry, fresh preview cycles and acceptance pinned to the exact reviewed preview Operation/report digest retain the previous section's contracts. A chat card must not reset a failed preview budget or regenerate an already saved candidate.

With no configured profile, hide new generation and provider retry actions. Keep the conversation, original instructions, accepted results, saved Pending review, manual editing and permitted document-preview retries available (`9QC-0`). A provider failure after a requested launch remains visible as that saved turn's outcome, with bounded recovery when capabilities permit it. The execution Operation does not wait for the Owner to review a proposal.

Rejection retains the original instruction and minimal task/proposal/decision identity, then removes generated explanations, candidate payloads, live preview artifacts and all generated copies under the existing rejection contract. Do not serialize assistant prose into conversation records, user-instruction snapshots, audit/idempotency payloads, or independent generated summary cards. Fetch explanation content through the proposal reference while it exists; rejection invalidates open views and cached payloads, leaving a metadata-only rejected card (`9KP-0`, `9QO-0`). Late results cannot restore the removed response. Accepted results remain attributable through their existing retained identities.

Concrete contract additions are small extensions to the existing task/proposal services:

| Record or command | Required behavior |
| --- | --- |
| Conversation and turn index | Stable design-scoped conversation identity; ordered turn/task references; original user instruction and exact base/scope; no independent generated response body |
| Prepare turn input | Resolve only selected original instruction identities; snapshot their complete text; return exact graph/scope/fixtures/current/prior input and real total/digest for review |
| Start turn | Owner authorization, permanent command identity, exact reviewed input digest/base/scope and validated cap; atomically persist immutable input, turn reference, Operation and dispatch before provider execution |
| Read conversation | Cursor pagination; current Operation/proposal state and allowed actions by reference; complete authorized original input; generated content only through an existing allowed proposal payload |
| Accept or reject proposal | Reuse existing exact guarded commands; update reference-derived conversation outcome without writing an assistant prose copy or silently selecting a newer base |
| Continue from accepted result | Explicitly set that immutable result as the unsent composer's base; select/review prior instructions before a separate new generation request |

These preserve the existing architecture and Owner-only template authority. Record/API names remain implementation choices. No further product-contract question is open for conversational iteration.

At narrower desktop/tablet widths, stack the conversation and selected-turn inspection while retaining full input access and the exact-base composer. Selecting a turn opens its inspection without replacing the composer. Mobile saved proposal review continues to use board 90; this task does not add full mobile template authoring. Use semantic ordered history, labeled real checkboxes, explicit buttons and keyboard focus restoration. Announce new Operation/proposal states without scrolling a reader away from older turns or stealing focus.

## Responsive, accessibility, and completion

Use the existing desktop workspace/inspectors. At narrow widths stack Current/Proposed, keep full text accessible, and place source/code views in an explicitly scrollable region. Mobile uses the existing full-screen proposal/provenance review pattern with 16px body text and 44px actions. Full mobile composition, template authoring, and inline writing assistance remain deferred; basic saved review/download stays available.

Use semantic buttons, real checkboxes, labeled forms/dialogs, keyboard-operated tabs/disclosures, visible focus, and focus restoration. Announce stages and failed acceptance without stealing focus. Action availability follows actual saved state and provider capabilities. A disabled acceptance must explain its blocking reason; color alone does not distinguish Pending, stale, warning, or failure.

The original Phase 2, source-generation, duplicate-comparison and manual-template sheets were screenshot-reviewed and finalized. The template candidate follow-up revised boards 62/63/68/85 and the library entry in place, then added saved-queue and narrow-review boards 89/90. The conversation follow-up adds boards 91/92 and updates the original studio, board 62 and board 89 entry labels in place. Review covered spacing, readable hierarchy, light/dark contrast, aligned actions and complete artboard fit. Existing references were preserved. No application code was edited or verified by this design task. Runtime profiles, compiler/model configuration, artifact protocols and focused implementation tests remain owned by the implementation agent.
