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
- [ ] Fact bank, browser imports, nested content, REST/MCP replacement.
- [ ] Production template/résumé editor and Paper states.
- [ ] PDF preview/export, history, suggestions, both optional scorecards.
- [ ] Local archive cutover and retained artifact validation.
- [ ] Retired editor, LaTeX, Paged.js and container dependency removal.
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
