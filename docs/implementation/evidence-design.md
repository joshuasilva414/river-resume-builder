# Evidence implementation design handoff

Updated 2026-09-05. Design precedes implementation under the Owner's instruction to use a Paper subagent for each new or changed page design.

Authoritative file: [River App UI](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0). Existing boards are preserved. The seven boards below extend their visual language; they do not seed application data or imply implemented capabilities.

## Paper surfaces

| Board | Node | Implementation use |
| --- | --- | --- |
| 22 · Evidence bank / Implementation states · Illustrative | `47C-0` | Evidence page, search/filter/list, selected claim, citation inspector, review and archive actions |
| 23 · Manual claim editor & citation selection · Illustrative | `4CZ-0` | New/material-edit claim dialog and exact citation selector |
| 24 · Evidence decisions, metadata & contexts · Illustrative | `4D0-0` | Review decision, metadata edit, context edit, archive confirmation, restore, conflict recovery |
| 25 · Reviewed evidence merge · Illustrative | `4D1-0` | Side-by-side inputs, proposed new revision, citations/context, rationale, explicit merge consequence |
| 26 · Mobile evidence review / Dark · Illustrative | `4D2-0` | Single-column inspector and bottom actions at 390px |
| 27 · Mobile claim editor / Light · Illustrative | `4D3-0` | Full-screen small-screen dialog, blank Draft state, input sizes and action footer |
| 28 · Contexts, history & list states · Implementation | `4MH-0` | Context list, claim history, duplicate queue, empty/search-error states |

Useful subtrees:

- Evidence main: `49C-0`; search/list: `49V-0`; inspector: `4A4-0`.
- Claim edit dialog: `4D9-0`; citation dialog: `4DD-0`.
- Review decision: `4FB-0`; metadata: `4FD-0`; context: `4FF-0`.
- Archive confirmation: `4HR-0`; archived/restoration state: `4I0-0`; conflict notice: `4I7-0`.
- Merge inputs: `4IT-0`; source comparison: `4J5-0`; resulting assertion: `4JH-0`; citations/context/rationale: `4JO-0`; consequence/actions: `4JZ-0`.
- Context list: `4ML-0`; history inspector: `4MQ-0`; duplicates: `4OK-0`; empty/error states: `4OS-0`.

Use `get_jsx` and `get_computed_styles` for implementation values. Screenshots are review evidence, not a substitute for reading design values.

## Existing design authority

`14H-0` and `2GO-0` remain the original light/dark evidence bank references. `31Y-0` is Phase 2 AI extraction review; do not expose its AI controls in the manual milestone. `27A-0` remains the intake/recovery vocabulary reference.

Reuse the existing River logo, header, workspace label, and navigation implementation. Cloned navigation counts and later-phase links in Paper are illustrative. Show only real counts and functional destinations in the application.

Preserve Newsreader, Instrument Sans, IBM Plex Mono, the light/dark tokens, 64px desktop header, 204px sidebar, thin rules, and 4px control corners. Main headings are 36/40px Newsreader at desktop and 28/34px on mobile. Dialog headings are 28/34px. Body is 14/20–22px; assertion text is 22/31px in the desktop inspector and 20/28px mobile. Source quotations use 21/28px Newsreader. IDs, offsets, and parser identities may use 12px mono, but ordinary body copy remains sans-serif.

The new bank uses a 660px list and 576px inspector at 1440px including sidebar. The existing bank uses 680/556; retain the new board's 660/576 split for this milestone. Let both regions grow with content; do not clip long assertions or citations. At tablet widths, switch to one column before controls become cramped. At 390px, selecting a claim replaces the list with the inspector and a Back to claims action.

## Behavior contracts

### Evidence list and inspector

- Page-level tabs are Claims, Possible duplicates, and Contexts. The primary action is New claim. Sources opens the implemented source screen.
- Search assertion, label, tags, and context label. Status filter values are All, Draft, Needs clarification, Verified. Active is the default lifecycle filter; Archived and All are explicit alternatives.
- The extra Filters button in the bank specimen may collapse/expand the visible filter row. Do not render an inert filter button.
- Claim rows keep fixed trailing status lanes. Wrap assertion text rather than truncate the meaningful fact. Selected row uses the existing blue selection tint and edge.
- Inspector tabs are Citations, History, Metadata. Show the exact selected evidence revision and its latest attached review decision. Archive is a separate lifecycle indicator, not a fourth review state.
- A citation shows the literal quote, source title, immutable processing result, and page/line locator when available. A disclosure shows full identities and stable UTF-16 start-inclusive/end-exclusive offsets. Never resolve a citation against whichever extraction is currently newest.
- Display owner attestations explicitly. Do not make an attestation look like independent documentary evidence.
- Each history row shows the action, actor, time, and associated revision. Historical inspection renders its original assertion, citations, context snapshot, and decisions. Label historical views clearly and provide Return to current revision. Hide mutation controls while a historical revision is displayed.
- Metadata view uses labels, tags, and private notes. Metadata edits retain the current evidence revision and review state.

### Manual claim editor and citations

- Create uses the same field arrangement as Edit claim, headed New claim. Start as Draft. Empty assertion disables Create claim. Supporting citations and context can be added later; a Draft without citations is allowed.
- Editing the assertion, selected context revision, or citation list creates a new Draft evidence revision. Show the material-change notice before saving. The primary button reads Save new revision.
- Keep a separate context selector and Manage contexts action. Context choices name both the stable context and selected revision. A newer context revision is never silently applied to the claim.
- Add citation opens a focused selector with source, processing result, selectable preserved extraction text, and exact quote. An exact-quote textarea may use the existing assertion-input styling. Do not normalize the stored quote before checking offsets.
- Match the quote against the selected extraction. A single occurrence can be selected directly. Multiple matches show their page/line location and surrounding text for explicit selection. Zero matches shows: “This text is not in this extraction. Select a passage from the source.” Add citation remains disabled until one exact occurrence is selected.
- Preserve the claim form while the citation selector is open. Back to claim restores focus to Add citation and retains unsaved assertion/context values. Removing a citation affects only the proposed new revision.
- Saving does not verify. The review decision is a separate action after saving.

### Review, metadata, and contexts

- Review is a radio group with Verified, Needs clarification, and Draft. Attach the decision to the displayed evidence revision. Require a rationale; Verified additionally requires at least one citation. Show the validation at its field and retain entered text after a failed request.
- Material editing invalidates the new revision's verification; older revision decisions remain visible in history. Metadata-only changes do not invalidate verification.
- Context kinds are Owner Profile, Employment, Project, Education, and Credential. The context dialog uses kind, label, organization, role/qualification, start, end, and details. Owner Profile substitutes name, email, phone, location, and website fields. Use the same labeled field stack from the context specimen; skip irrelevant fields rather than showing unexplained blanks.
- A context save creates its next immutable revision. Existing claim references remain pinned. Creating a context from a claim dialog returns to that dialog with the new revision available for selection.

### Archival, conflict, and duplicates

- Archive confirmation states the item leaves default search while original sources, revisions, and decisions remain. Archived inspector offers Restore claim. Restoration preserves the current evidence revision/review state and records the lifecycle action.
- Keep unsaved form state on a revision conflict. The conflict notice offers Keep editing and Compare versions. Comparison presents local form values and latest server values using the same two-column comparison grammar as the merge board; stack on mobile. Reload/discard is explicit. Never automatically retry against the newer revision.
- Possible duplicates are suggestions, not automatic edits. The queue links to Compare claims. Keep separate records a decision about the compared revisions; a later material change may become a new candidate.
- Merge explicitly identifies the kept claim and the source claim to archive. Show both assertions, exact citations, contexts, and review states. Review the resulting assertion, combined citations, chosen context revision, and merge rationale before submission.
- Merge creates a new Draft revision on the kept claim and archives the other claim. Both stable identities, sources, prior revisions, and historical references remain. No existing checkpoint is rewritten. The button reads Merge into kept claim. If either input changes during review, preserve entered work and show the revision conflict.

## Responsive and accessible behavior

- Desktop dialogs use the widths represented in the state sheets: roughly 616px for claim editing, up to 736px for citation selection, and 440–480px for focused maintenance dialogs. These boards display independent dialogs next to each other for documentation; do not render the state-sheet grid as an application page.
- On small screens, dialogs become full-screen, one-column surfaces like `4D3-0`. Keep the title and close action at top, scrollable form content, and action footer above the safe area. Footers must not obscure content or the software keyboard.
- Show only one active dialog at a time. Preserve the prior dialog's form state when opening citation or context selection. Escape returns to the prior surface; explicit discard confirmation is needed if closing would lose changed values.
- Interactive controls target at least 44px on mobile. Mobile text inputs use 16px to avoid browser zoom. Tab and filter rows may wrap or scroll horizontally; the page itself must not overflow horizontally.
- Use real labels, fieldsets/radio groups, buttons, dialog titles/descriptions, keyboard focus rings, focus trapping, and focus restoration. Status is conveyed with text as well as color. Live errors and save/review outcomes are announced without stealing focus.
- Use the existing semantic light/dark variables in application code. Dark specimens use `--color-dark-*`; do not directly copy black inherited text from Paper. The mobile review's initial inherited text issue was corrected before handoff.
- Loading disables only the relevant mutation and labels the in-progress action. Failed reads preserve prior loaded content if available. Empty, filtered-empty, and request failure are distinct states in `4MH-0`.

## Design review and limits

All seven boards were inspected with Paper screenshots. Reviews covered spacing, type, contrast, alignment, artboard fit, and repeated-row lanes. Fit-content heights prevent clipping. A mobile dark foreground issue and the empty-form primary-button state were corrected, then checked again.

All claims, counts, quotations, dates, IDs, and offsets in Paper are illustrative design material. Some were reused directly from existing Paper specimens. They must never be imported into the Owner's evidence bank. Merge and chronology specimens use descriptive placeholders intentionally.

Automatic approval review rejected three writes that it classified as potentially private excerpts/claim identifiers. Read-only inspection confirmed the original quote already existed in this same Paper file. Reusing that existing design node with descriptive provenance placeholders was accepted. Merge content was reduced to neutral placeholders. No private source file was exported, no pending approval remains, and this did not block the design handoff.

These are static designs. Browser behavior, live persistence, citation fidelity, responsive execution, and accessibility must be validated in the implementation milestone.
