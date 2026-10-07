# River product specification

The visual workspace replaces the previous editor and evidence model. Historical release specifications remain in Git and dated implementation records. The current architecture is [ADR 0016](docs/adr/0016-use-facts-visual-documents-and-browser-pdf.md).

## Product workflow

Candidate facts → reusable content → tailored résumé → browser-generated PDF.

Each account owns a private workspace. Facts are candidate-supplied information treated as factual. Source associations are optional provenance. There are no verification states, review decisions, required citations, unsupported-claim flags, or evidence-review export gates.

A fact has a stable identity, semantic key, label, typed value, optional context, and optional source. Contexts group information under employment, projects, education, profile, or custom categories. Supported values are text, bullet, skill, date, number, link, and boolean. Dates preserve year/month/day precision or Present. Prose supports bold, italic, and links.

Content items are independent fields or nested collections. Creating content from facts and inserting content into a résumé copies values and generates appropriate identities. Origin references never propagate later edits. Direct résumé authoring is supported, with explicit save-to-facts and save-to-library actions.

## Templates and documents

Visual templates define typed fields, reusable entry structures, hierarchy, rows, columns, widths, spacing, alignment, typography, literal labels, prefixes, suffixes, separators, and visibility. Zero and false are populated values. Missing values omit their punctuation. Repeating layouts are defined once; documents supply entry counts. Standard starters and entirely custom sections are supported.

Résumés capture a template version and optional job description. Applying template changes or switching templates requires explicit mapping. Compatible keys/types match automatically; unused values remain stored. Changes retain entry counts and values. Template controls are locked during résumé editing.

The desktop editor uses single-click selection, double-click/Enter/F2 editing, Escape to finish, scoped sibling dragging, a drag preview and blue insertion marker, keyboard move controls, breadcrumbs, template area selection, blank-entry plus buttons, Delete/Backspace, and Command/Control undo/redo. Removing a template container unwraps its contents.

Autosave accepts incomplete drafts, detects revision conflicts, and retains recoverable browser edits. Undo is session-local. Named versions and export snapshots are immutable. Restoring a version creates a draft revision. Smaller screens browse saved material and download retained PDFs.

## Sources, AI, and scoring

PDF.js, Mammoth, and text parsing run in the browser. Supported imports are text PDFs, DOCX, UTF-8 TXT/Markdown, and pasted text. An editable preview lets users correct, add, or exclude proposed facts before one bulk save. Empty or scanned PDFs offer pasted text; River does not perform OCR. Agents provide extracted text and optional originals.

Content AI runs on explicit click for imports, fact matching, or wording. Hover reveals controls, never starts a request. Suggestions show explanations and before/after previews. Applying one requires unchanged target and job context and creates one undo step. Template design remains manual.

Optional résumé and template scorecards reuse the scoring provider, quotas, limits, and retained metadata. Résumé scoring uses rendered text and the captured posting. Template scoring uses three editable fictional pairs, including explicit custom-field mapping. Fictional data never becomes candidate facts. Scorecards assess submitted text, not appearance or factual verification. Provider failures never gate export.

## Rendering and retention

One resolver controls binding, formatting, missing values, labels, and reading order for the editable projection and React PDF. Measurements use points and supported styles. Matching static font variants are bundled. A browser worker generates PDFs; stale results are discarded and the last successful preview is retained. The PDF preview shows actual pagination; the canvas is an approximation.

PDF.js checks rendered text completeness and order. Missing-field/layout warnings permit export. Rendering failures or detected text loss prevent reporting success. Export freezes inputs, retains exact PDF bytes and metadata in private storage, and completes only after archival succeeds. Failed uploads retain the blob for retry in the active tab.

## Cutover and boundaries

The old editor, evidence bank, library graph, schema bundles, LaTeX rendering/refinement, and document container are retired. Previous records and retained PDFs remain owner-only and read-only; expired previews are unavailable. Old mutation contracts return explicit migration errors. Accounts, settings, sources, and job targets remain. Old evidence selections must be rebuilt from facts.

The first release excludes OCR, mobile editing, collaboration, automatic propagation, template-design AI, and conversion or re-rendering of old templates. Authentication, persistence, AI, scoring, ownership, scoped agent access, optimistic concurrency, and idempotency remain server responsibilities.
