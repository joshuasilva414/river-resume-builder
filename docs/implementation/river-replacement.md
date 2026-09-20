# River replacement implementation

Branch: `feature/river-editor-replacement`, based on `feature/river-visual-editor-demo`.

## Accepted boundary

Candidate facts → reusable content → tailored résumé → browser-generated PDF.
The visual editor replaces the old editor. Facts are candidate-supplied information;
there is no claim verification workflow. Reuse copies values. Templates own layout,
field meanings, labels, and punctuation. PDF generation and file extraction run in
an active browser; server agents submit extracted text.

## Milestones

- [x] Browser worker rendering proof and shared typed document resolver.
- [x] Records, owner-scoped persistence, revision/idempotency protection, archive.
- [x] Fact bank, browser imports, nested content, REST/MCP replacement.
- [x] Production template/résumé editor and Paper states.
- [x] PDF preview/export, history, suggestions, both optional scorecards.
- [x] Local archive cutover and retained artifact validation.
- [x] Retired editor, LaTeX, Paged.js and container dependency removal.
- [ ] Architecture/API/setup/runbook documentation and acceptance checks.

Commit each milestone. Preserve unrelated changes in
`ai-failure-diagnostics.md` and `../security-review-2026-09-07.md`.
Deployment, merge, and remote container decommission are separate actions.

## Rendering contract

The resolver owns field binding, rich text, date precision, labels and separators,
empty-value rules, and reading order. Zero and false are values. The editable
canvas includes placeholders; resolved print output excludes them. A résumé pins
its complete template definition. Layout changes require an explicit application.
Static font variants are bundled for identical font selection in DOM and PDF.

### Rendering proof validation

The authenticated development fixture is `/demo/pdf-proof`. It exercises static
Newsreader/Instrument Sans regular, bold, italic and bold-italic, clickable links,
accented Latin text, shared repeated layouts, one-page and multi-page output. The
worker returns PDF bytes; PDF.js checks ordered text before exposing a successful
result. PDF.js previews accept the in-memory Blob directly, avoiding an extra fetch.

Focused domain checks cover date precision and invalid dates, copy isolation,
shared entry layouts, missing separators, mapping retention and text loss/order.
The web production build includes a separate PDF worker. Vite excludes its React
document from DOM hot refresh, which cannot execute in a worker.

### Storage and archive boundary

Migration `0039_visual_workspace.sql` adds owner-scoped JSON records, immutable
record revisions, export manifests and archive records. Existing tables are left
intact while the replacement is built. The cutover operation snapshots historical
context, evidence, library and template revisions, drafts, checkpoints, and artifact
manifests. Counts distinguish archive categories; revision categories count retained
revisions. Repeated cutovers return the original manifest. No rendering is involved.

Writes use the existing atomic command receipts and revision guards. Agent scopes
are explicit for facts, content, templates and résumés. Bulk fact imports commit
contexts and facts together, check source/context ownership, and bind ID sets as
JSON to stay under D1's per-statement parameter limit. A context in use cannot be
deleted. Facts and content never update existing copies through their origin IDs.

Four worker/database checks currently cover ownership/scopes, idempotency and
conflicts, bulk import rollback, saved-version immutability, and archive isolation.

### Fact Bank, imports, and content

The `/facts`, `/facts/import`, and `/content` screens use versioned workspace records.
Browser parsing accepts text PDFs, DOCX, UTF-8 text and Markdown; empty PDFs offer
pasted text. Originals and extracted text are stored privately without scheduling
a container operation. The editable preview saves only included facts and their
used contexts in one transaction. AI extraction is explicit and optional; proposals
and provider metadata are retained separately from saved facts.

`/api/v2/{facts,contexts,content,templates,resumes,versions}` and their identity
routes share ownership, scopes, revision guards and command receipts with the UI.
`/api/v2/facts/import` accepts batches; `/api/v2/sources` requires extracted text.
MCP exposes equivalent typed record tools and `submit_source`; retired evidence and
file-extraction tools return a migration error. Legacy REST retirement happens at
the final cutover so partially built routes cannot become the active workspace.

Paper: River file `01M1PCGGJYH2EC4YRJNZSPRDZK`, page `p-9-0` (River · Facts and visual
workspace), Fact Bank `CXR-1`, editable import `D1L-1`. The designs preserve River's
Newsreader/Instrument Sans typography, white surfaces and blue selection.

Validation: seven focused worker/database checks pass for records, sources,
analysis retention, quota reservations and archive isolation. Domain tests pass.
TypeScript and production build pass. Browser checks confirmed manual context/fact
creation, save-as-content, independent copy edits, partial-date import, exclusion of
an empty proposed fact, and saving supplied source text. Local validation records
are clearly named and will be removed before delivery. Real-provider and file-format
failure checks remain part of final acceptance.

### Production visual editor

Templates and résumés now use the authenticated visual editor at `/templates/:id`
and `/resumes/:id`. Commands own session history, selection, editing and stable IDs.
Tiptap updates field attributes during typing; structural commands rebuild only the
projection. Repeating layouts belong to reusable definitions. Containers unwrap on
removal; explicit reparenting is separate from sibling dragging. Incomplete drafts
save to the server with browser recovery, conflict recovery and separate-copy actions.

Template switches and content insertion expose nested field mapping and retain
unused values. Direct authoring, blank-entry controls, and explicit save-back to the
Fact Bank or library use independent copies. The canvas fits the available desktop
width, while measurements remain points. PDF preview shows the actual generated file.

Paper adds content mapping `D2W-1` and saved versions/exports `D4L-1`. Browser checks
covered template creation, custom Publications with repeated entries, typed fields,
blank résumé creation, double-click editing, Escape, add-entry, Control undo/redo,
Backspace deletion and a one-page PDF text-completeness check. Focused domain tests
cover unwrapping, movement cycle protection and layout application retaining IDs,
values and entry counts. Broader browser interaction checks remain in final acceptance.

### Exports, versions, suggestions, and scorecards

Exports capture a saved immutable version, retain the exact browser PDF blob for
upload retries, verify its SHA-256/size and resolved text, and publish a private
Download action only after R2 archival succeeds. Restoring a named version edits
the current draft without changing the captured version or older exported bytes.
The server verifies snapshot content against the observed saved draft revision.

Suggestions run on explicit requests. Library alternatives and AI wording return
before/after replacements scoped to one stable target. Target/job fingerprints use
canonical JSON so serialization order cannot create false stale-input failures.
AI may change values within the target, never schema, layout, or field identities.

Both scorecards submit checked PDF text and captured job descriptions to the
existing provider adapter. Template scorecards use three editable fictional pairs;
custom fields are filled in the fixture editor and reviewed before submission.
Fixture edits use separate browser storage and never create candidate facts.
Input/provider/rendering metadata and raw responses are retained. Reservation
consumption precedes terminal operation updates because their trigger releases
unused slots. Scoring failures leave saving and export available.

Validation: domain tests pass (42 checks), web TypeScript and production build pass.
Worker checks cover archive byte identity, owner isolation, incomplete uploads,
immutable snapshots, three-result quota accounting, replay without extra provider
calls, stale text rejection and failed-provider release. The browser saved a named
version and successfully archived a generated one-page PDF. All three fictional
samples passed PDF text checks. A live score request correctly reported that the
local scoring provider is unconfigured; successful provider behavior is covered
with the existing contract fixtures. Live-provider scoring remains unvalidated.

### Local archive cutover

The signed-in local owner's cutover completed on September 20, 2026. Manifest
counts match the retained rows: 1 context, 8 evidence revisions, 8 content revisions,
6 template revisions, 4 résumés, 3 saved versions, 29 artifact manifests, and 0
scorecards. Accounts (2), sources (6 including the clearly named import test), and
job targets (2) are unchanged. Other owners are not included in this cutover.

The read-only archive at `/archive` follows Paper artboard `D5K-1`. A retained PDF
opened through the owner-scoped archive endpoint without a container call. An
expired preview correctly shows an unavailable message and no download action.
Historical preview metadata can contain a draft/revision object rather than a
boolean; both forms are recognized. Archive tests cover that form, missing files,
private access, and idempotent snapshots. Old Evidence Bank URLs redirect to facts;
retired evidence mutations return an explicit migration error.

This was a local cutover only. Production cutover, deployment, merge, and remote
container decommission have not been performed.

### Retired runtime and active adapters

The old composition editor, evidence/review machinery, LaTeX template package,
source-refinement and template-generation AI, Paged.js projection, and document
container application are removed. Web bindings retain only the database-backup
workflow. CI and deployment scripts no longer build or deploy the document service.
Legacy SQL migration history remains; only the table declarations used by active
services or read-only archival remain in the repository. Historical payloads are
opaque JSON and never enter new editing commands.

Job targets use preserved posting records and a new fact-selection table. Existing
job descriptions remain readable; legacy evidence selections are not transferred.
Sources use browser parsing, text submission, private original downloads, and
retained text inspection. REST v1 evidence/job mutations and server-extraction
requests return migration errors. MCP publishes typed fact/content/template/résumé,
job and source operations; retired credentials remain readable without gaining new
permissions. New record Trash supports explicit restoration with revision guards.

The authenticated local application loads without the document service. The full
web suite passes 88 checks, including accounts, credentials, MCP, administrative
quotas, private archive access, exact-byte exports and optional scorecards. The two
unrelated documentation diffs retain their original hash. Remaining acceptance work
covers job matching, browser interaction edge cases and operational documentation.
