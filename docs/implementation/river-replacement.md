# River replacement implementation

Branch: `feature/river-editor-replacement`, based on `feature/river-visual-editor-demo`.
Implemented and validated locally on September 20, 2026. No hosted deployment,
merge, or remote container decommission has been performed.

## Completed scope

Candidate facts → reusable content → tailored résumé → browser-generated PDF.

- [x] Shared typed document model and browser-worker React PDF rendering.
- [x] Versioned records, owner-scoped storage, revision/idempotency guards, archive.
- [x] Fact Bank, browser imports, nested content, replacement REST/MCP operations.
- [x] Production template and résumé editors, with extended Paper designs.
- [x] Exact-byte PDF exports, named versions, suggestions, and both scorecards.
- [x] Local owner archive cutover and retained artifact validation.
- [x] Legacy editor, LaTeX, Paged.js, and document-container dependency removal.
- [x] Architecture/API/setup/runbook documentation and local acceptance checks.

Each implementation milestone has its own commit. The two pre-existing edits in
`ai-failure-diagnostics.md` and `../security-review-2026-09-07.md` are unchanged and
excluded from replacement commits. The unrelated `pnpm-lock 2.yaml` is untouched.

## Implementation boundaries

Facts use typed candidate-supplied values and optional context/source associations.
There are no verification states or evidence-review export gates. Content and
résumé insertion copy values; origin references never propagate later edits.
Templates own field meanings, reusable entry definitions, typography, labels,
prefixes/suffixes, conditional separators, and layout. Résumés capture the complete
template version and selected posting. Applying changes or switching templates is
explicit, preserves counts/values, and maps unmatched fields without discarding them.

Tiptap custom nodes and React node views project stable field identities. Central
commands own selection, editing, structural operations, and session-local undo.
Ordinary field edits update attributes instead of replacing the whole document.
Drafts autosave to D1 and retain browser recovery data. Conflict recovery can reload
the server version or save a separate copy. Explicit reload bypasses the ordinary
unsaved-navigation guard.

The shared resolver controls dates, populated values, literals, visibility, and
printable reading order. Zero and false are populated. Empty editor placeholders
are excluded from PDF output. Measurements are points; the editable canvas supports
fit-width and explicit zoom. It approximates layout, while PDF.js displays actual
PDF pagination. Static regular/bold/italic/bold-italic font files are shared.

PDF generation runs in a dedicated worker. Requests are debounced and coalesced;
obsolete results cannot replace a current preview. PDF.js checks ordered extracted
text before export. Missing-field warnings are non-blocking; rendering failure and
text loss retain the last good preview and prevent a successful export. Exports
freeze inputs and retain their exact blob through upload retries. A private download
appears only after archival succeeds. Saved versions and export bytes are immutable.

Browser imports accept text PDFs, DOCX, TXT/Markdown, and pasted text. The editable
preview saves included facts and used contexts atomically. Original files and
extracted text are private Sources. File-only headless extraction is retired;
agents submit extracted text with optional original bytes. OCR is excluded.

AI import, wording, library alternatives, and job-fact matching are explicit actions.
Suggestions are bound to unchanged targets and postings. Applying a replacement
changes only its target and creates one undo step. Template design is manual.
Optional résumé and template scorecards retain provider/input metadata and reuse
quotas. Template scoring uses three editable fictional pairs, isolated from facts.
Scorecards assess submitted text, not appearance or factual verification.

Migrations 0039–0041 add the active records, operation history, artifact manifests,
and job-fact selections. Historical SQL/data stays available for read-only archival.
Old payloads never enter the new model. Retired mutations return migration errors;
old evidence scopes gain no fact permissions. The only active Workflow binding is
`BACKUP_WORKFLOW`. Web, browser import/export, CI, and deployment scripts no longer
call or build the document container. Recovery inventories include new source and
complete browser-PDF object keys as well as retained historical objects.

## Paper and local entry points

[River · Facts and visual workspace](https://app.paper.design/file/01M1PCGGJYH2EC4YRJNZSPRDZK/p-9-0)
contains Fact Bank, editable import, content mapping, history/export, and read-only
archive states. Existing River pages and the original demo designs are preserved.

Browser screenshots were compared with Paper for the Fact Bank, import preview,
history, and archive. River's Newsreader/Instrument Sans typography, white surfaces,
blue selections, and list/detail hierarchy carry through. History is implemented as
an editor dialog. The import comparison identified squeezed label/context inputs;
these now use readable columns and stack on smaller screens.

| URL | Purpose |
| --- | --- |
| `http://127.0.0.1:3000/facts` | Fresh candidate Fact Bank |
| `http://127.0.0.1:3000/templates` | Standard starter or fully custom visual template |
| `http://127.0.0.1:3000/resumes` | Saved résumés and retained downloads |
| `http://127.0.0.1:3000/archive` | Owner-scoped previous workspace |
| `http://127.0.0.1:3000/demo/pdf-proof` | Authenticated development-only rendering/import fixtures |

The proof fixture never saves fictional records. Its code and interface explicitly
mark the development boundary. Active product routes use real scoped persistence,
providers, and commands rather than the removed demo state or scripted suggestions.

## Validation results

| Check | Result |
| --- | --- |
| `pnpm check` | All four packages pass TypeScript |
| `pnpm lint` | All four packages pass |
| Domain tests | 18 pass |
| Web/Workers/D1/API/MCP tests | 92 pass across 21 files |
| Backup/recovery tests | 5 pass |
| Deployment guard tests | 4 pass |
| Staging bundle and Wrangler dry run | Pass; no deployment |
| Production bundle and Wrangler dry run | Pass; no deployment |
| Browser parser/PDF link checks | 10 pass |

Focused tests cover owner/agent isolation, revision conflicts, idempotent retries,
atomic imports, saved-version immutability, exact archived byte identity, incomplete
uploads, historical artifact access, quota accounting, provider failure release,
stale scoring inputs, template unwrapping, copy isolation, mapping/count retention,
date precision, conditional empty groups, zero/false, and PDF text order/loss.

Manual browser acceptance covered:

- Context/fact creation and edits; independent copies in content; partial-date
  imports and exclusion of empty proposals; saved source text.
- Nested library field/group insertion, sibling moves, removal, cancel, and deletion.
  These controls explicitly avoid form submission; deletion retries retain their
  command identity. Only Save content submits the content form.
- A custom Publications collection, repeated layouts, nested selection, explicit
  layout application, unmatched-content mapping, and retained values/counts.
- Single-click selection, double-click/F2 editing, Escape, rich-text copy/paste,
  sibling bullet dragging/reordering, area selection, blank-entry controls,
  Delete/Backspace, and Command/Control undo/redo.
- Library suggestion preview/apply/undo against the selected stable target.
  Canonical fingerprints prevent false stale failures caused by JSON key order.
- Refresh recovery, named-version restoration, and a two-tab save conflict. The
  stale tab could not overwrite the newer revision; reload restored revision 10.
- Saving a named version and archiving a generated one-page PDF. The retained file
  downloads independently of later draft edits and without a rendering service.
- One-page and dense three-page PDFs with 18 repeated entries, font variants,
  accented Latin text, web/email link annotations, text completeness/reading order,
  and actual page navigation. Unsupported CJK glyphs produced an explicit text-loss
  failure while retaining the prior preview.
- PDF/DOCX/TXT/Markdown extraction, DOCX table/Unicode text, empty/scanned-equivalent
  PDF fallback, malformed PDF/DOCX, empty files, and invalid UTF-8 rejection.
- Three fictional scorecard samples passing PDF text checks. Unconfigured local
  providers returned visible errors without preventing manual work or export.

Successful live AI/scoring requests remain unvalidated locally because the provider
connections were unconfigured. Provider contract fixtures cover successful responses,
quotas, failures, and stale-input behavior. The cutover runbook requires live staging
acceptance before releasing those paths. The bundled fonts currently support Latin
text; additional scripts need suitable bundled fonts before they can export.

## Local cutover and cleanup

The signed-in local owner's manifest matches retained archive rows:

| Category | Count |
| --- | ---: |
| Contexts | 1 |
| Evidence revisions | 8 |
| Content revisions | 8 |
| Template revisions | 6 |
| Résumés | 4 |
| Saved versions | 3 |
| Artifact manifests | 29 |
| Scorecards | 0 |

A retained historical PDF opens without a container call. An expired preview shows
an unavailable state and no download action. Other owners were not included in
this local cutover. Accounts, settings, pre-existing sources, and jobs are preserved.
The local database contains two accounts, six sources including the clearly named
import validation source, and two job targets.

Validation facts, contexts, content, templates, and résumés were removed from the
active workspace through the normal recoverable deletion controls. Their immutable
versions and one retained PDF remain available if the test résumé is restored from
Trash. No historical artifacts or other owners' records were deleted.

See [architecture decision](../adr/0016-use-facts-visual-documents-and-browser-pdf.md),
[REST/MCP contracts](workspace-api.md), and the [cutover/decommission runbook](workspace-cutover.md).
Hosted cutover is owner-scoped; track outstanding archive manifests rather than
claiming one owner's cutover covers all accounts. Production deployment, merge,
and remote container deletion remain separate actions.
