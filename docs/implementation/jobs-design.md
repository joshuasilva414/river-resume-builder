# Jobs implementation design handoff

Updated 2026-09-05. A dedicated Paper subagent designed these states before application implementation, following the Owner's Paper-first instruction.

Authoritative file: [River App UI](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/3-0). Existing `NG-0` (Job targets) and `SH-0` (Job brief and requirements) are preserved. New designs provide the manual workflow without advertising AI or composition before those capabilities work.

## Design map

| Surface | Paper node | Use |
| --- | --- | --- |
| Existing job list | `NG-0` | Header, search, active/archive tabs, fixed table lanes, job navigation |
| 29 · Manual job requirements & evidence / Light · Illustrative | `4P6-0` | Posting/requirements workspace, manual evidence search and selection, persistent selection status |
| 30 · Job intake, metadata & posting history · Implementation | `4P7-0` | New job, display metadata, immutable posting history, archive/restore |
| 31 · Manual requirement editor & snapshot change · Implementation | `4P8-0` | Requirement fields, supporting passages, new posting snapshot |
| 32 · Evidence selection, gaps & conflicts · Implementation | `4P9-0` | Global evidence view, provenance inspector, gaps, review warnings, concurrency and save failures |
| 33 · Mobile manual requirements / Dark · Illustrative | `4PA-0` | 390px single-column requirement review and evidence selection |
| 34 · Mobile requirement editor / Light · Implementation | `4PB-0` | Full-screen small-screen requirement dialog |

Exact subtrees:

- Manual workspace main: `4R9-0`; job header: `4RA-0`; tabs: `4RJ-0`.
- Posting/requirements split: `4RQ-0`; posting: `4RR-0`; requirements: `4RU-0`; selection footer: `4TF-0`.
- Requirement header/search: `4SI-0`; selected evidence row: `4SW-0`; requirement gap row: `4T8-0`.
- New target: `4TQ-0`; edit details: `4TS-0`; posting history: `4TU-0`; historical notice: `4W3-0`.
- Archive target: `50O-0`; restore target: `50W-0`.
- Requirement editor: `4U2-0`; category/priority: `4WH-0`; confidence: `4WX-0`; passages: `4X3-0`.
- New snapshot dialog: `4U4-0`; snapshot consequence: `4XU-0`.
- Global evidence search/selection: `4Y9-0`; target association selector: `4YK-0`; provenance: `4YB-0`.
- Selected unreviewed row: `4YX-0`; Needs clarification badge: `53R-0`.
- Gap notice: `4ZQ-0`; review warnings: `4ZU-0`; newer evidence revision: `4ZY-0`.
- Conflict: `504-0`; selection save failure: `50A-0`; remove requirement: `50G-0`.
- Mobile review body: `51B-0`; selected evidence: `524-0`; mobile selection footer: `52J-0`.
- Mobile editor header: `51K-0`; fields: `51O-0`; footer: `53L-0`.

Use Paper `get_jsx` and `get_computed_styles` when implementing. Screenshots confirm visual quality; they are not the source for guessed dimensions or colors.

## Architecture and domain clarifications

No architecture replacement is required. The six-package boundaries, Effect services, shared REST/MCP capabilities, D1 atomic command pattern, revision checks, and permanent idempotency all support this workflow.

The following clarify new Jobs contracts rather than change existing infrastructure:

1. A Job Target has stable identity, current display metadata, lifecycle state, and an explicit current-posting pointer. Captured snapshots retain their original metadata and complete posting text.
2. Each Requirement Map and its immutable revisions belong to one exact posting snapshot. Requirements need stable identities within that map so edits do not accidentally remap evidence by array position.
3. Evidence selection belongs to one posting snapshot. Each selected reference identifies an exact Evidence Revision, with an optional requirement association. A general job selection does not count as evidence selected for a particular requirement.
4. New posting capture becomes current and starts a fresh Requirement Map and selection. Earlier maps, passages, and selections stay with the earlier posting. There is no silent carry-forward of offsets or selections.
5. Manual confidence defaults to `null`/unspecified. It describes confidence that the posting supports the interpreted requirement, not candidate qualification or match score. The UI displays an optional 0–100% input; a normalized 0–1 domain value can be used with explicit conversion. Blank must never become zero or a guessed high-confidence value.
6. Supporting passages contain exact posting snapshot identity, quoted text, and stable start-inclusive/end-exclusive UTF-16 offsets with line locators when available. Plain posting text does not need an invented Source Processing Result identity.
7. A selection operation, requirement edit, new-current-posting change, archive/restore, and job metadata edit must reject stale state before dependent writes. A new current posting racing with a save must not attach that save to the wrong snapshot.

The parent implementation agent agreed to snapshot-bound maps/selections and nullable manual confidence during this handoff. General-versus-requirement selection is an implementation clarification of the approved global and requirement-centered evidence views; it must not mutate any resume or reusable evidence record.

## Job list, intake, and metadata

- Use `NG-0` for the list layout. Replace fixture names, counts, timestamps, and stages with real state. The continuation panel exists only when there is actual resumable work. Do not show Compose/Ready to export or continue-to-compose actions before composition works.
- Search role title/company/location. Active and Archived are lifecycle views. Never infer that an external job is open or closed from River archival alone.
- Add job target collects role title, company, optional location, complete pasted posting text, and optional provenance URL. Role, company, and posting text are required. The empty form has a disabled Create job target action.
- Saving creates the Job Target and its first immutable snapshot atomically. Open the resulting job with an empty manual map and Add requirement as the next action.
- Store the URL as provenance. The interface must not imply automatic fetching. The approved behavior remains manual paste or structured agent input.
- Edit job details changes the stable target's current role/company/location labels. It does not rewrite metadata on prior snapshots.
- Archive is recoverable. The target leaves the active list, but its snapshots, requirement history, selections, and future resume history remain. Restore returns it to the active list without resetting that work.
- First-use empty copy: “No job targets yet. Add a role and its posting to start reviewing requirements.” Use the existing empty-state styling from the evidence handoff. Filtered-empty and failed-read states remain distinct; do not show a failed request as an empty database.

## Posting and requirement workspace

- The manual page uses Job brief, Requirements & evidence, and Posting history tabs. The manual view does not show the four-step compose/export navigation from `SH-0` until those steps work.
- Desktop keeps the posting visible beside the requirement map. Highlight the exact supporting passage for the selected requirement. A source URL is an explicit external link, not evidence of current posting availability.
- Current snapshot and capture date are always discoverable. View posting presents the complete preserved text, original capture metadata, and exact snapshot identity in a disclosure.
- Posting history is chronological and identifies the current snapshot. Earlier snapshots open in a labeled historical view with their associated saved map and selection. Return to current snapshot is explicit. Historical browsing does not change the current pointer or discard newer work.
- Add posting snapshot collects complete updated text and optional URL. Its consequence notice states that earlier requirements/selections remain with the earlier snapshot and the new snapshot starts a fresh map.
- The By requirement view groups selected evidence under each requirement. All evidence offers manual search/filtering across the bank. Selected shows the exact selected revisions and associations for the posting. None of these tabs should pretend to rank results while ranking is unavailable.
- Empty map: “No requirements yet. Add a requirement from the posting.” Keep the posting readable and the Add requirement action available. AI absence does not produce an error banner or block this flow.

## Manual requirement editing

The same dialog handles Add requirement and Edit requirement. It collects:

| Field | Behavior |
| --- | --- |
| Requirement text | Required; one qualification or responsibility |
| Category | Choose or enter a concise category; examples include Skills, Experience, Education, Credentials, Responsibilities, and Other |
| Priority | Required, Preferred, or Unspecified; default Unspecified |
| Keywords | Explicit terms; normalize list separators and trim whitespace without inventing terms |
| Confidence | Optional interpretation percentage; blank means unspecified |
| Supporting passages | Zero or more exact anchors in this posting snapshot |

- Do not infer Required from the category or from a keyword. An explicitly unspecified priority remains visible as such.
- Saving creates an immutable map revision and retains stable requirement identities. Preserve existing selection associations for unchanged requirements. Do not advertise search matches as proof that the Owner satisfies a requirement.
- A manually entered requirement without a supporting passage remains editable and shows No supporting passage. It must not acquire a fabricated quote.
- Select from posting uses the citation-selector grammar already designed at `4DD-0`: preserved source text, exact quote selection, unambiguous occurrence choice, and explicit location. Here the source is the active immutable posting snapshot, so omit the evidence Source/Extraction dropdowns.
- Multiple occurrences require choosing the location with surrounding text. A pasted quote not present in the selected posting shows an inline error. It cannot be stored with arbitrary offsets. Leaving the passage collection empty is a separate valid state.
- Editing source text itself is never part of requirement editing. A changed posting is captured as a new snapshot.
- Remove requirement asks for confirmation when current associations exist. Its requirement-specific links leave the current map. General job selections and historical map/selection records remain. Never cascade into deletion of evidence claims.

## Evidence selection and provenance

- By-requirement selection associates an exact Evidence Revision with that requirement. All evidence includes a Select for control: This job (general selection) or a current requirement.
- A single claim can support more than one requirement. Count distinct selected claims separately from requirement associations. Do not inflate the claim count from multiple links to the same revision.
- Unchecking removes only the association represented by that control. Do not silently clear another requirement's association. The Selected view exposes associations so each can be removed deliberately.
- A requirement with no associated evidence displays Gap · no evidence selected, even if keyword search returns candidates or the claim is selected generally for the job.
- Selection is an Owner/authorized job command, not a verification decision. Draft, Needs clarification, archived, stale, and unsupported evidence stay selectable with visible issues. Export acknowledgment remains a later checkpoint-specific step.
- Archived evidence is absent from default search. An explicitly selected archived revision remains visible in Selected, with its archive warning. Filtering cannot silently remove a stored selection.
- A newer Evidence Revision never replaces a selected earlier revision automatically. Compare revisions opens the preserved selected revision and current revision. Applying a newer revision requires an explicit selection update; earlier historical selection records stay unchanged.
- Inspect provenance shows the literal quote, original source, exact processing result/offsets, context revision, review decision/rationale, and actor/date. Reuse the existing evidence inspector and protected source download behavior rather than duplicating a second citation implementation.
- Review warnings describe the actual referenced revision. An unrelated newer revision's Verified state must not make an older selected revision appear verified.
- Save selection changes through the shared command layer. Show Saving until acknowledged and Saved only after persistence. Reload must retain acknowledged selections. A failed save must preserve the pending user choice and offer retry with the same logical mutation identity.

## Concurrency, errors, and recovery

- A revision conflict preserves the user's local form/selection. Show The job changed with Compare changes and Keep editing. Never automatically rebase and overwrite another tab's work.
- Comparison uses the existing two-column comparison grammar: local entered values on one side, latest server values on the other. Stack on mobile. A discard/reload action explicitly names the local work it discards.
- A change to the current posting while editing a requirement is a conflict, not permission to migrate old passage offsets into the new posting.
- Network failure shows Selection not saved and Retry save. Reload saved selection explicitly discards the pending local selection and requires the same discard behavior as other dirty forms.
- Preserve previously loaded data when a read refresh fails. Provide retry and a stale-data indication. Do not zero out counts or hide selections while reporting failure.
- Server-provided authorization failures remain typed and user-readable. External agents use `jobs:read`/`jobs:write` through the same services; selecting evidence for a job does not grant resume or template mutation.

## Layout and accessibility

- Preserve the existing logo, Personal workspace label, Newsreader/Instrument Sans/IBM Plex Mono, and semantic light/dark tokens. Do not introduce a second shell.
- Desktop shell is 64px header plus 204px navigation. The manual workspace is 1236px, split 380px posting and 856px requirement/evidence area. Posting padding is 28px. Main content padding is 24px 28px with 18px group gaps.
- New target/edit/history dialogs are about 440–448px wide. Requirement editor is 736px; new-snapshot dialog is 616px. State sheets display independent dialogs side by side for documentation; do not implement them as a grid page.
- Main desktop job title is 32/38px Newsreader; section/dialog titles are 28/34px. Body is 14/20–22px. Requirement text is 18/26px. Mobile inputs use 16/24px and targets at least 44px.
- On narrow screens, the posting moves to a separate tab instead of shrinking beside the requirement list. Mobile review is single-column with a bottom selection-status/action area. Fields stack as in `4PB-0`.
- Mobile dialogs are full-screen, with a titled header, scrollable body, and bottom action footer respecting the safe area and keyboard. Preserve the requirement form when opening the passage selector, then return focus to Select from posting.
- Use semantic labels, real fieldsets/radio groups or accessible selects, native checkboxes, buttons, dialog titles/descriptions, visible focus, and focus restoration. Checkbox names include the claim and association they change.
- Status labels are textual as well as colored. Saved/failed selection updates are announced without moving focus. Disabled actions match missing required fields or an active mutation; they do not gate manual work on AI.
- Overflow uses wrapping/scrollable text regions. Never clip long posting text, source quotes, role titles, or requirement assertions at a fixed artboard height.

## Review evidence and limits

All six new boards were screenshot-reviewed in Paper at desktop and 390px mobile sizes. Checks covered type, contrast, spacing, aligned action/status lanes, wrapping, and artboard fit. Fit-content heights prevent footer clipping. The Needs clarification specimen was wrapped in a proper badge frame after inspection showed that Paper does not apply background fills to text nodes. Empty requirement and snapshot forms have disabled primary actions.

Neutral placeholder text and existing illustrative Paper excerpts are design material only. Do not seed company names, claims, posting text, IDs, counts, dates, or scores from Paper into the Owner's workspace. Existing fixture navigation counts and future capability links must become real state or be omitted.

The designs do not verify application behavior. The implementation agent owns service tests, browser journeys, persistence, revision handling, visual comparison, and deployment checks. No app code was changed by this design subtask.
