# Reusable content and manual composition design handoff

Updated 2026-09-05. A dedicated Paper subagent designed these states before implementation, following the Owner's Paper-first requirement. This handoff covers M4 design only. It does not report implementation verification.

Authoritative design: [River App UI](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0). Existing boards, logo and tokens are preserved. Use Paper `get_jsx` and `get_computed_styles` for implementation details; screenshots are for visual review.

## Design map

| Surface | Paper board | Purpose |
| --- | --- | --- |
| Existing content library | `1FD-0` | Application shell, library tabs, list and inspector |
| Existing composition | `Y3-0`, `2B2-0` | Light/dark composition and PDF split |
| Existing reusable section | `387-0` | Document tree, section editor and reuse inspector |
| Existing conflict dialog | `28Q-0` | Limited in-memory comparison and recovery |
| 35 · Manual content library & evidence / Light | `53V-0` | Shared item editor, exact evidence references, staleness |
| 36 · Seven content types | `53W-0` | Shared manual form and all seven type prompts |
| 37 · Block & section bindings | `53X-0` | Ordered typed bindings and reusable revision saves |
| 38 · Manual composition & fixed packs / Light | `53Y-0` | Manual editor, preview freshness, fixed pack choice |
| 39 · Placement copy & local wording | `53Z-0` | Copy destination and complete local override |
| 40 · Promotion & library update comparison | `540-0` | Explicit promotion modes and compare-before-apply |
| 41 · Save, preview & conflict recovery / Dark | `541-0` | Save failures, preview failures, conflict and duplicate branch |
| 42 · Mobile draft review / Dark | `542-0` | Saved-content review, evidence inspection and PDF access |
| 43 · Evidence links & nested promotion | `5ON-0` | All applicable evidence issues and explicit child promotion |
| 44 · Start a résumé & insert from library | `5RJ-0` | Draft creation, empty composition and contextual library picker |

Exact implementation subtrees:

- Library list: `548-0`; edit Content Item: `54A-0`; linked evidence: `56D-0`; stale-link notice: `56N-0`.
- Shared new Content Item: `54I-0`; type prompt patterns: `54K-0`; contact: `57Q-0`; summary: `581-0`; experience: `58C-0`; project: `58N-0`; education: `58Y-0`; skills: `599-0`; credentials: `59K-0`.
- Reusable Block editor: `54S-0`; title binding: `5AJ-0`; optional detail binding: `5AV-0`; ordered accomplishments: `5B8-0`.
- Reusable Section editor: `54U-0`; ordered Block references: `5BS-0`.
- Composition main: `5D2-0`; draft header: `5DP-0`; editor: `5E0-0`; toolbar: `5FX-0`; selected block: `5GE-0`; local evidence/reason: `5GS-0`, `5GX-0`.
- Preview pane: `5E3-0`; preview freshness: `5HI-0`; fixed pack controls: `5I8-0`.
- Copy placement: `5DA-0`; local Content Override: `5DC-0`; override reason: `5F5-0`; compare base: `5FR-0`.
- Promotion choices: `5DK-0`; update comparison: `5DM-0`; current composition: `5JG-0`; proposed composition: `5JR-0`; replacement acknowledgment: `5K9-0`; guarded Apply: `5KD-0`.
- Save/preview states: `5L2-0`; unsaved: `5LM-0`; saving: `5LS-0`; failed save: `5LY-0`; preview updating: `5M6-0`; failed preview: `5MC-0`.
- Conflict recovery: `5L4-0`; complete local/server comparison: `5MS-0`; duplicate branch action: `5NE-0`; explicit reload: `5NH-0`; branch retry: `5NN-0`.
- Mobile: header `5L7-0`; draft state `5LF-0`; saved project `5NU-0`; saved skills `5O7-0`; preview state `5OD-0`; desktop editing notice `5OJ-0`.
- Evidence picker: `5OT-0`; selected exact revision: `5P8-0`; issue rows: `5PP-0`, `5PV-0`, `5Q1-0`, `5Q7-0`, `5QD-0`.
- Nested promotion: `5OV-0`; unresolved wording: `5QO-0`; explicit binding of a saved child: `5R0-0`; paused parent action: `5RC-0`.
- New draft: `5RP-0`; empty composition: `5SE-0` onward; contextual library picker: `5RR-0`; selected revision: `5SZ-0`.

## Agreed domain clarifications

No architecture replacement is required. Shared application services, strict schema validation, D1 atomic command execution, expected revisions and permanent idempotency support this milestone. Owner-only resume/library commands must not accidentally extend the external Agent Credential mutation surface.

The implementation agent agreed to these clarifications during this handoff:

1. A reusable Content Item is a scalar wording unit with a type and private library label. Its immutable Content Revision contains complete wording and exact Evidence Revision references. Block types own the structured field bindings, rather than duplicating an entire project/experience object inside each Content Item.
2. All seven content types use the same wording editor with type-specific prompts. Contact lines, titles, details, date labels, paragraphs, bullets and individual skills can therefore be bound to declared fields.
3. Skill groups are ordered Block bindings of individual skill Content Revisions plus a heading. Grouping does not collapse individual skill provenance.
4. A placement's first edit retains the exact original child references and creates a draft-local Composition Override. A Content Override retains its base Content Revision, complete local wording, exact supporting Evidence Revisions and reason.
5. Copying a placement that already contains local overrides preserves its complete visible content/composition and original references in a new placement. Both placements can then change independently.
6. Promoting a Section must never implicitly promote or mutate its children. Each nested local wording change first chooses a new Content Item or new revision, is reviewed and saved, and is explicitly bound into a Block. Parent Block/Section promotion then operates on resolved immutable child references. Unchanged children keep their original references.
7. Fixed Classic/Minimal/Technical pack choice is appropriate. Read-only style details remain until a validated supported-options schema exists. Cross-pack mixing stays unavailable.

These are implementation clarifications of SPEC's content/composition model. They do not authorize unrelated features or later AI/history surfaces.

## Content editing and evidence

- Library labels organize the library and are not printed. Keep the wording itself explicit and editable.
- Creation requires a declared type and nonempty wording. A private label can be required by the final command schema; use matching UI validation. Do not imply that a missing evidence link prevents saving unsupported draft content.
- Save creates a new immutable Content Revision. Editing a reusable item does not update existing resume placements. Counts, timestamps, item titles and revision badges always come from real state.
- Existing `1FD-0` supplies Content items / Blocks / Sections tabs. Inactive template, general history and AI actions from older design boards must not appear before those workflows exist.
- The evidence picker searches active evidence by default, allows review-state filtering and makes Show archived explicit. Preserve selected archived links in the inspector even when they are outside default search results.
- Each link identifies an exact Evidence Revision. The inspector opens its assertion, verification decision/rationale, citations and pinned context values. Reuse the already-designed provenance inspector from the evidence milestone.
- Draft, Needs clarification, stale evidence, archived evidence and unsupported wording are independent issues. Display every applicable issue; one badge must not hide another. M4 keeps them visible. Exact-checkpoint acknowledgments belong to the later export workflow.
- A newer Evidence Revision does not silently relink existing wording. Compare old/new assertion, exact citations and context before replacing a link. A library relink creates a new Content Revision. A local relink changes only the local override.
- Staleness is derived from reference relationships. It is not a user-editable switch. Verified status applies to the exact Evidence Revision, not to every possible paraphrase of it.
- Contact/header values are pinned wording in the draft. Profile changes never silently rewrite saved draft or checkpoint values. The final contact/profile capture contract must state whether an explicit import copies profile values or stores a pinned profile revision; no automatic live binding is designed here.

## Seven content types and typed bindings

The following are wording prompts and conceptual field groups. They are not arbitrary new manifest slots. Register the actual field identifiers, multiplicities and allowed content types in the Block schemas before rendering those controls.

| Content type | Wording unit examples | Compatible structured grouping |
| --- | --- | --- |
| Contact/header | Name, location, contact line | Header/name plus ordered contact fields |
| Summary | Complete paragraph | Summary paragraph(s) |
| Experience | Role title, organization/detail, date label, accomplishment | Experience title/details plus ordered accomplishments |
| Projects | Project title, descriptor, accomplishment | Project title/detail plus ordered accomplishments |
| Education | Institution, qualification, date label, detail | Education title/details plus optional detail lines |
| Individual skills and skill groups | One skill name | Ordered skill bindings with a group heading |
| Credentials/certifications | Credential title, issuer, date label, detail | Credential title/details |

The supplied project Block pattern has a required title, optional detail and ordered accomplishment bindings. Other Block editors use this pattern with only their declared compatible fields. Do not add star ratings, skill meters, assumed validity, hidden keyword fields, custom scripts or arbitrary layout controls.

Dates remain explicit display wording until the domain schema defines a structured date contract. Do not infer dates, durations, qualifications or current credential validity from strings. Links, if supported by a declared field type, need typed URL validation and safe rendering; the design does not authorize arbitrary rich HTML or LaTeX.

Reusable Section editing separates the private library label from the printed heading. Ordered exact Block Revision references establish reading order. Add actions filter by destination compatibility. Saving an empty or incomplete required structure uses field-level validation from the schema.

## Starting and composing a draft

- Create résumé draft opens from the selected Job Target and shows the exact posting snapshot association. Collect a draft name and a fixed template pack. A stale posting selection must be rejected or explicitly refreshed before creating the draft.
- An empty draft shows Add your first section, Choose library section and Create section. Starting a resume does not transform selected Claims into authored wording automatically.
- Inserting a reusable Section or Block creates a fresh placement referencing an exact immutable revision. A Section picker targets the document; a Block picker targets a compatible Section; a Content picker targets a declared Block field.
- Picker rows show the chosen revision and allow inspecting wording/evidence before insertion. Failed reads have Retry; they must not masquerade as an empty library.
- Desktop uses the existing 64px app header and 204px navigation. The new manual editor uses a 660px edit pane and 576px preview pane at 1440px. Keep each pane scrollable within a usable viewport. Long wording wraps instead of enlarging fixed action lanes.
- The editor updates immediately. Local wording and local composition are visible labels with their base revisions discoverable in the reuse inspector. Reorder operations have labeled move controls in addition to optional drag handles.
- Editing a title, detail or accomplishment affects the selected placement. Open in library is a separate intentional action. Do not turn an inline text edit into an implicit library mutation.
- Undo/redo is session-local. Disable each control when no corresponding operation exists. Session undo history is not represented as durable checkpoint history.
- Review draft can expose the functional saved-content/PDF/evidence review surface. Do not show scoring, AI suggestions, template studio, source refinement or general history controls yet.

## Copying, overrides, promotion and updates

- Copy Section collects a destination resume and insert position. Copy Block additionally targets a compatible destination Section. The source and destination revisions must be checked before committing.
- The destination uses its own fixed compatible pack. Copy does not replace either resume's pack or alter the original reusable revision.
- A local Content Override form shows complete wording, exact evidence links and an override reason. Changes remain local to that placement. Reverting to base wording opens a comparison and explicitly replaces the complete local wording/evidence set.
- Promotion choices are New revision of the same reusable item and New reusable item for a distinct alternative. New identity mode requires an identifying label. The complete wording, references, composition and rationale are reviewed before saving.
- Promoting does not automatically apply the new library revision to other drafts. This design also keeps the current draft local until an explicit apply/bind step, avoiding an invisible ownership change.
- Nested local children are resolved using `5OV-0`. The Owner separately chooses revision versus new item for each local child, then explicitly binds the resulting immutable revision. The parent promotion remains paused while required local bindings are unresolved.
- If a child was already separately saved before the parent promotion is canceled, its library revision remains. Do not imply a rollback of independently completed commands.
- Library update comparison shows complete current and proposed wording, ordering, evidence references and affected child bindings. Changed-category badges help navigation but do not substitute for the full comparison.
- Keep current placement is always available. Applying an update that replaces local changes requires explicit review of that replacement. The unchecked state shows a disabled Apply button.
- Apply includes the expected draft/placement revision and the exact reviewed library revision. If either relevant state changed, pause and refresh the comparison. Never apply an unreviewed latest revision by resolving a moving pointer after confirmation.
- Existing checkpoints and other placements retain their original composition, contact/context values and template revisions.

## Saving, conflicts and preview freshness

- Distinguish Unsaved changes, Saving, Saved with acknowledged revision, Save failed and Conflict. Do not label the draft saved while any newer visible edits remain pending.
- Debounce typing and serialize commands. A successful response establishes the next expected revision. Preserve the in-flight payload/idempotency identity for retry; do not attach different content to a previous idempotency key.
- On save failure retain pending edits in memory, identify the last acknowledged revision and offer Retry save. Show an honest tab-lifetime warning where work is at risk. There is no persistent browser recovery or offline-sync claim.
- On conflict pause dependent autosaves, retain the complete local composition and load the current server draft for comparison. Compare changed wording, order, evidence and template choices. Both complete versions must remain inspectable.
- Keep my edits as a new branch copies the complete local composition into a separate draft. It does not overwrite the current server draft. Retry branch creation retains its stable command identity and local payload.
- Reload saved draft explicitly discards the local unsaved edits shown in the comparison. Require the loss to be clear at the final action. Canceling/closing comparison must keep autosave paused until resolution.
- Unsaved data and undo/redo exist only in memory. A tab crash, close or reload may lose pending work. Do not claim recovery from IndexedDB or a saved browser buffer.
- The preview always shows its saved draft revision and freshness. Coalesce render requests; only the latest relevant successful operation may become current. A late obsolete result cannot replace the current preview.
- Keep the last successful PDF visible while updating or after a compile failure. Report whether the draft itself saved successfully. The initial empty preview is a different state from a failed update with an existing PDF.
- View compile report and Retry preview operate on the document workflow. Save failure and compile failure use distinct actions and explanations.

## Pack contract and remaining implementation choices

The current proof manifest in `packages/templates/src/index.ts` exposes document-level fixed values, not a supported-options schema. At handoff time its Classic values are Latin Modern Roman, 10pt, 0.65in margin; Minimal is Latin Modern Sans, 10pt, 0.70in; Technical is Latin Modern Sans, 10pt, 0.60in. These are displayed as pack-owned facts, never hard-coded user controls.

- Read actual manifest values/revisions at runtime. The fixture values in Paper are not production pins.
- No font picker, spacing slider, margin slider, column setting, page target or freeform LaTeX control is designed for M4. Add these only after a typed manifest declares valid supported options and a Paper subagent designs the controls.
- Switching a fixed pack changes exact compatible template bindings for the placement tree. It does not rewrite wording or evidence references. Page count follows content.
- Implementation still owns exact Block/Section field identifiers, required/optional cardinalities, compatibility registries, field-length bounds, safe link/date representation and explicit profile-to-contact capture. Use the shared patterns above; do not invent unsupported fields to fill a screenshot.
- Preview resource limits, debounce duration and actual Operation states come from the Phase 0/runtime contract. The interface does not promise arbitrary timing.

## Responsive and accessible behavior

- Preserve Newsreader for editorial headings, Instrument Sans for UI text and IBM Plex Mono for technical locators. Preserve the current River logo rather than retyping or redrawing it.
- Light: white surface, ink `#111318`, muted `#5B6270`, rule `#D9DDE3`, editor blue `#1E5EFF`, verified green `#16794A`. Use pale yellow for review issues with readable dark text.
- Dark: ground `#0B0D12`, surface `#141821`, text `#F4F6FA`, muted `#A8AFBD`, rule `#303746`, editor blue `#5B8CFF`, verified green `#45C58A`, warning `#FFC857`. Dark dialogs use explicit theme text tokens on every child; do not rely on black text inheritance.
- Desktop dialogs have bounded widths, readable scrolling bodies and persistent primary/cancel actions. The design sheets show alternative states together for reference; do not render all alternatives simultaneously in a product dialog.
- On narrower desktop/tablet widths, stack comparison panes with persistent Local/Saved or Current/Proposed labels. Preserve full text access. Action lanes wrap without truncating important labels.
- Full mobile composition is explicitly deferred by SPEC/PLAN. At 390px the new mobile board reviews acknowledged saved content, exact evidence and the PDF. Do not make its read-only wording look like disabled input fields.
- Mobile evidence/provenance opens the existing accessible full-screen inspector. Use 16px body text, at least 44px targets, safe-area-aware footer spacing and visible focus.
- Implement semantic forms, real buttons, labels, accessible radio/checkbox/select behavior and keyboard order. Up/down reorder controls need descriptive names such as Move project up; decorative arrows alone are insufficient.
- Focus enters a dialog at a useful heading/control, remains contained, and returns to its opener. Escape/cancel retains local work; destructive reload still states its loss. Save-state announcements use a polite live region without moving focus on each acknowledgment.

## Design completion

All ten new boards were reviewed through Paper screenshots. Targeted corrections resolved clipped content, dark text inheritance, badge semantics and disabled actions. The existing boards are unchanged. Illustrative placeholders and the existing synthetic PDF fixture must not seed application data. Implementation verification, browser journeys and runtime tests belong to the implementation milestone, outside this design-only assignment.

## Job-to-draft entry and cross-job copy addition

The focused continuation adds two screenshot-reviewed boards without changing the original shell or earlier designs:

| Surface | Paper node | Exact subtrees |
| --- | --- | --- |
| 60 · Job résumé draft entry · Current and earlier postings | `6SM-0` | Inline area `6UT-0`; Create action `6VA-0`; draft rows `6W3-0`, `6WJ-0`, `6WZ-0`; pagination `6Y0-0`; empty `6ZI-0`; failed read `6ZN-0` |
| 61 · Cross-job placement copy · Explicit draft and Section | `6SN-0` | Block copy `6V1-0`; destination résumé `6XF-0`; compatible Section `6XL-0`; position `6YH-0`; destination picker `6V3-0`; job filter `6VU-0`; options `6XR-0` / `6YU-0`; pagination `6Z0-0`; no compatible Section `6Z7-0` onward |

- Place the résumé draft area below the selected Job Target header, before its existing posting/requirements tabs. The board reuses the existing header/navigation. Its bottom empty/error panels are alternative states, not extra content below the real job tabs.
- List saved drafts for this exact job across its posting snapshots. Show the saved composition name, acknowledged draft revision, actual pack, and branch origin. Compare each draft's immutable `snapshotId` against the explicitly identified posting in view. Use This posting or Earlier posting when that relationship is true; a different/newer snapshot in a historical view needs the neutral Other posting label and its exact identity. Opening a draft retains its association.
- The branch label derives from `branchOf`. Show Original draft when absent, or Branch of [resolved saved draft name] when available. If the parent name is unavailable, show Branch with its identity discoverable. Do not invent user-assigned branch names, Main labels, or a branch-switching feature.
- Open draft navigates by stable draft ID. Create résumé draft opens the existing `5RP-0` form with exact job/posting context. Recheck that association on creation and preserve the entered name/pack if stale context requires refresh. Creating a draft does not turn selected evidence into authored content.
- Render pagination from the actual service page size and `hasMore`. The inspected service returns up to 50 drafts ordered by saved update time and stable ID; Paper's three rows are a compact illustrative subset. Previous is disabled on the first page; Next is disabled without more results. Do not invent a total count. Preserve the current page after a failed read and expose Retry rather than replacing it with an empty list.
- At narrow widths, stack each row's name, posting, pack/revision, and branch metadata, followed by Open draft. Keep full labels readable, 44px action targets, and pagination reachable. Open draft uses the already-designed mobile saved-content review surface; mobile composition remains deferred.
- The original `5DA-0` supports a destination résumé and states that Block copies need a destination Section, but does not explicitly show cross-job context or the compatible-Section picker. The new `6V1-0` companion makes both explicit while preserving `5DA-0` for Section copy.
- Destination job defaults to All jobs and may narrow the paginated draft list to another job. Each option shows its actual draft name, job/company, posting identity, acknowledged revision, pack, and branch label. Do not restrict destination choices to the source job or infer them from labels. A typed job filter avoids inventing an unsupported free-text cross-job search contract.
- After choosing a destination draft, reload its exact saved composition and clear any Section/position selected for a different draft. Block copy requires a destination Section whose declared content type is compatible with the source Block. If none exists, disable Copy block and offer Choose another draft or Open destination draft. The latter does not implicitly create a Section or copy the Block.
- Section copy inserts in the destination document and has no destination-Section field. Block copy inserts at an explicit position inside the selected compatible Section. Both commands carry exact source/destination revisions, use new placement identities, and preserve the complete local overrides and original reference graph. Cross-job copying does not alter either draft's posting association, pack, source placement, reusable library, or checkpoints.
- No architecture replacement is required. The paginated destination read must be Owner-scoped and allow the chosen job or all Owner drafts. Existing copy guards still validate both observed revisions and destination compatibility atomically. This addition includes no application edits or implementation verification.
