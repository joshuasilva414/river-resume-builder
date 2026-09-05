# Structured résumé composition

Implemented 2026-09-05. Paper references and presentation contracts are in `content-design.md`.

Seven registered types use immutable Content, Block and Section bases. Draft placements contain their full visible composition and exact base references. Local wording carries complete evidence references and a reason. Copy recursively creates new placement identities while retaining all visible wording and provenance. Editing a copied placement cannot mutate the source draft or reusable library.

The Owner creates drafts from exact job/posting snapshots. Draft saves use revision checks, permanent command identities, and atomic reference/audit writes. The browser serializes 600 ms debounced saves against its last acknowledged revision. Undo/redo is limited to 100 session-local snapshots. Dirty navigation is explicit; unsaved work is not persisted in browser storage. Idle tabs may refresh saved data, while dirty or conflicted tabs retain their local version.

Conflicts show local and current server compositions. Reload is explicit. Preserve as a branch stores local work with fresh placement identities and the acknowledged branch base, leaving the current source draft intact.

Promotion first creates a reusable revision. Applying that revision is a separate reviewed command. Parent promotions pause until changed children have separately saved revisions and explicit bindings. Applying a library update checks both draft and library aggregate revisions atomically and requires acknowledgment before replacing local overrides.

Preview requests pin the exact saved draft, coalesce repeated requests for that revision, and share the two-active-document-job limit. An operation and dispatch record commit before Workflow dispatch. Successful publication only changes the preview pointer when the draft revision and latest request still match. Earlier successful PDFs remain visible while a newer request runs or fails. Preview keys use `transient/previews`; seven-day expiration still needs operational configuration.

## Validation

- 34 Workers tests passed across nine files, including immutable copy, stale writes, ownership, branch preservation, library-update races, coalescing and obsolete publication.
- All six workspace type checks and lint tasks passed; staging build and migration through `0007_ancient_archangel.sql` succeeded.
- Local browser checks: nested Content/Block/Section creation, independent copied wording, manual contact values, autosave, undo/redo, conflicting tabs, preserved local branch, explicit Content promotion and binding, failed preview/retry, and real PDF output.
- Hosted browser: synthetic job and draft, nested header revisions, saved revision 1, authenticated PDF output, desktop and narrow saved review. Exact deployment/fixture IDs are in `deployment.json`.
- Desktop light/dark layouts were reviewed at 1280 px. Hosted narrow review used 621 px; the available viewport override did not produce a 390 px acceptance run.

Full nested parent-promotion browser acceptance and cross-job copying remain additional coverage opportunities; services validate those paths. Export checkpoints and general checkpoint history are separate milestones and are not claimed here. Synthetic fixtures are explicitly labeled and are not candidate evidence.
