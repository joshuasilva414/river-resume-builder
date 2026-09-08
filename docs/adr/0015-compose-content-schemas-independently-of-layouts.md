# Compose content schemas independently of layouts

River v1.2 separates a named, versioned content schema from the layouts that render it. A schema can contain scalar values, scalar lists, and references to single or repeated nested records. An Experience section owns its inline Experience Entry records; a Summary owns its text directly. Users save the complete section once, without creating intermediary wording records or blocks.

Stable field identities preserve values across compatible layout changes and retain unused values across schema changes. Each saved definition captures its complete dependency set and validates missing definitions, duplicate identities, cycles, and incompatible layouts. Schemas and layout fragments remain declarative; the isolated compiler escapes values and enforces its closed LaTeX grammar.

Legacy library graphs and immutable saved résumés remain readable. Editing adapts recognizable fields conservatively, preserving ambiguous dates and contact text. Draft placements retain independent values; saving reusable content never silently changes other résumés. This extends ADRs 0011 and 0012 while removing their fixed-field and mandatory-wrapper limitations for new content.
