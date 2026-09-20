> Superseded for active workflows by [ADR 0016](0016-use-facts-visual-documents-and-browser-pdf.md). Retained as historical context.

# Separate reusable compositions from draft placements

Blocks and Sections have reusable identities and immutable, presentation-neutral revisions, while each draft placement pins a revision and binds its presentation. Copying shares the pinned base; editing creates a local override that can later be promoted or forked explicitly. This supports copying compositions between resumes without silently propagating tailoring edits or coupling reusable content to one theme.
