# ADR 0016: Facts, visual documents, and browser PDF

Status: accepted and implemented locally on the replacement branch. Hosted cutover is separate.

Supersedes the active document/evidence decisions in ADRs 0003, 0009, 0011, 0012,
0014, and 0015. Authentication, ownership, optimistic concurrency, permanent
idempotency, immutable sources, personal AI connections, and database backups remain.

## Decision

The active model is candidate facts, reusable content, visual templates, and
résumés. A fact is a typed candidate value with an optional context and source.
Saving a fact accepts it as factual; River has no claim verification workflow.
Reusable content can be a field or nested collection. Each layer owns its copied
values. Origin IDs are provenance, never live bindings.

Templates define stable semantic field keys, simple types, reusable entry layouts,
literal labels, formatting, and visibility. Repeating collections reference a
definition and receive their count from the résumé. Templates and content are
versioned JSON aggregates rather than schema bundles, LaTeX fragments, or a library
placement graph. Résumés capture the complete template and job description.

`packages/domain/src/workspace` owns the Zod contracts, copy/mapping commands,
validation, and document resolver. Zod is used at the new JSON boundary; Effect
remains the server orchestration layer. D1 command receipts, atomic guards, and
owner-scoped repositories serve UI, REST, and MCP together.

The visual editor uses Tiptap custom nodes and React node views. Its controller owns
selection, editing, commands, and undo. Field edits retain stable identities;
structural changes rebuild the projection. Drafts autosave with observed revisions
and recoverable browser copies. Explicit mapping preserves unused values.

The resolver emits ordered printable content and supported point-based styles.
The DOM projection and `@react-pdf/renderer` consume that result. Browser font and
PDF font variants match. PDF generation runs serially in a dedicated worker and
coalesces pending work. Results are debounced and stale work is discarded. The
canvas approximates layout; PDF.js shows exact generated pagination.

PDF.js also checks expected visible text and order. A successful export requires
the frozen snapshot, checked text, exact PDF bytes, renderer/font identities,
SHA-256/size verification, and completed private R2 archival. The server validates
the supplied bytes and metadata against the snapshot; it does not independently
parse or attest the visual appearance of client-generated PDFs. Failed uploads
retain their blob and identity in the active tab for retry.

PDF.js and Mammoth extract files in the active browser. Server and agent source
submissions require extracted text, with optional originals. No headless extraction,
URL retrieval, OCR, LaTeX compilation, or document container remains active.

AI stays on the server and runs only on explicit requests. Optional scorecards
assess rendered text and captured postings through the existing provider and quota
adapter. Template scoring uses three fictional pairs with custom-field review.
Neither AI nor scoring gates manual saves or exports.

## Persistence and historical data

Migration 0039 adds workspace records, immutable revisions, exports, and legacy
archive manifests. Migration 0040 adds retained analysis runs. Migration 0041 adds
job selections using fact IDs. Historical SQL migration history is retained for
restores. The read-only archive copies old payloads without conversion or rendering.
Available historical PDFs download as their original bytes; expired transient
previews remain unavailable.

Private objects use retained historical prefixes, `sources/<owner>/...`, and
`workspace/<owner>/exports/...`. Backup inventories include completed browser PDFs
and source originals/extracted text with hashes. Prepared uploads are not treated
as retained exports. No lifecycle expiry may apply to these new retained prefixes.

Accounts, settings, sources, and job targets survive. Old evidence selections must
be rebuilt. New facts and content start empty. Old mutations return an explicit
replacement error. Legacy scopes are decoded for existing credentials without
silently granting new fact/content/template/résumé permissions.

## Consequences and limits

- Rendering and parsing require an active client; agents submit extracted text.
- The style vocabulary is intentionally smaller than CSS or LaTeX. Static font
  coverage must be tested; glyph/text loss prevents a successful export.
- PDF pagination is exact only in generated previews. Canvas zoom improves desktop
  editing without altering document measurements.
- Browser recovery is per owner/document. Undo is session-local. The pending export
  blob is lost when its tab closes; completed exports remain privately downloadable.
- There is one editor after cutover. Rollback must preserve new records and use a
  maintenance/read-only state, not silently reopen old writes.

See the [API contract](../implementation/workspace-api.md),
[cutover runbook](../implementation/workspace-cutover.md), and
[validation record](../implementation/river-replacement.md).
