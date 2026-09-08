# Compose content schemas independently of layouts

River v1.2 separates a named, versioned content schema from the layouts that render it. A schema can contain scalar values, scalar lists, and references to single or repeated nested records. An Experience section owns its inline Experience Entry records; a Summary owns its text directly. Users save the complete section once, without creating intermediary wording records or blocks.

Stable field identities preserve values across compatible layout changes and retain unused values across schema changes. Each saved definition captures its complete dependency set and validates missing definitions, duplicate identities, cycles, and incompatible layouts. Schemas and layout fragments remain declarative; the isolated compiler escapes values and enforces its closed LaTeX grammar.

Legacy library graphs and immutable saved résumés remain readable. Editing adapts recognizable fields conservatively, preserving ambiguous dates and contact text. Draft placements retain independent values; saving reusable content never silently changes other résumés. This extends ADRs 0011 and 0012 while removing their fixed-field and mandatory-wrapper limitations for new content.


## v1.2.1 extension

Built-in schema/layout revision 2 introduces compact headings, dates, bullets and single-rendered links. Editable drafts adopt these definitions only when the captured revision-1 identity, field definitions and layout source exactly match the frozen original bundle. The upgrade is an ordinary guarded revision commit. It retains the previous draft, content and evidence, skips customized bundles, and has no effect when repeated. Editing and insertion adapt historical library values without rewriting saved library revisions.

Built-in document template revision 2 uses renderer `river-tectonic-0.4.0`; current custom graphs use `river-tectonic-0.5.0` and composition renderer v3. Captured v1 document/custom renderers remain available for historical checkpoint retries and exports. No database migration is required.

The editor uses approximate HTML/CSS and local Paged.js pagination. Valid content insertion and autosave depend on schema/structural validation, not PDF preparation. Exact saved-version rendering and export remain LaTeX/Tectonic. This supersedes the v1.2 PDF-before-insertion interaction; it does not change the export contract in ADR 0009.
