# Final-document refinement

Implementation in progress. Product behavior is defined in SPEC.md's Final-document refinement section. Paper boards 65/67/68 and the complete review contract in `template-ai-design.md` are the interface handoff. No refinement controls are exposed until the complete review and acceptance workflow works.

## Document boundary

The internal document service accepts `compile-source` with complete proposed LaTeX, an independently captured ordered intended-text manifest, and the original template identity. This job has no public endpoint. The manifest contains unique stable locators and full required text. It is bounded to 2,000 fields and 100,000 total UTF-16 units; source is bounded to 250,000 UTF-16 units and 1,000,000 UTF-8 bytes.

The source renderer uses `river-source-tectonic-0.1.0`. Its identity pins source bytes, the complete manifest including locator identity, and the original template identity. Artifact fingerprints additionally include compiler/cache/font and extraction identities. The existing structured renderer and its text normalization contract remain unchanged.

The complete source can change wording and layout. A closed command grammar rejects file access, shell execution, dynamic macros, encoded control sequences, unpinned classes/packages/fonts and unbalanced groups/environments before compilation. Comments and escaped scalar characters remain supported. Tectonic runs offline and untrusted within the existing bounded, isolated child process. Output is checked against the intended manifest using the same completeness, multiplicity, reading-order and normalization rules as structured documents. A successfully compiled PDF with incorrect text remains a failed validation result.

This internal manifest is the compiler contract. The upcoming proposal service must separately enforce the base checkpoint's required fields, assign identities for source-only additions, retain support for changed fields, and classify all intended/extracted text changes. A model-supplied manifest cannot grant verification or erase required-field obligations.

## Review and persistence foundation

`diff@9.0.0` produces complete source and extracted-text comparisons, including unchanged context and exact whitespace. A bounded line diff falls back to a clearly identified complete replacement comparison. Stable field comparisons separately record additions, removals, wording, evidence links and ordering. A layout-only summary requires identical complete intended fields and extracted bytes. Meaning classifications remain model assessments; they cannot verify evidence or hide a change.

River assigns source-only addition locators. Existing required fields retain their obligations, and normalized-empty fields cannot bypass them. The model can select only captured evidence identities. Changed wording/support and additions receive a fresh clarification issue even if the model calls the meaning preserved. Those issues remain attached through repeated source refinement.

Migration 0019 adds captured refinement tasks, proposals and immutable checkpoint source overrides. Commands capture the exact source/artifact identities and mutable evidence/context revisions, preserve an Operation and dispatch record, and bound generation, preview and publication attempts separately. Acceptance records exact review coverage before publication. Finalization atomically saves the new checkpoint, its source override and fresh issue report, the accepted proposal, audit history and permanent receipt. It preserves the preceding source checkpoint, original structured base, newer working drafts and prior acknowledgments. Export uses the source renderer identity and requires the new checkpoint's own acknowledgments.

The D1 foundation passed focused race tests: changed evidence during final publication rolls back every dependent write; expired previews cannot enqueue acceptance; cancellation prevents finalization; retries preserve the saved candidate; rejection removes its D1 payload and comparison. All 96 Workers tests and 25 template/compiler/review tests pass, as do workspace type/lint checks and the staging bundle build. Complete R2 retention/cleanup, Workflow execution and UI integration remain in progress. Migration 0019 is applied locally and exercised in isolated tests; staging remains on 0018.

## Remaining workflow

Capture the exact checkpoint source/artifact/report digests, structured base, evidence/contact/context/template values and dependency revisions before dispatch. Generate a schema-validated complete candidate and intended manifest with a bounded server task profile. Store the candidate separately from its execution Operation. Derive complete source, intended-text and extracted-text diffs; classifications never suppress underlying changes.

Review must include before/after source, complete manifest and extracted text changes, exact PDF previews and validation reports. Acceptance requires current passing artifacts and explicit coverage acknowledgment. Preserve retained artifacts through recoverable D1/R2 publication, then atomically create a new immutable source-override checkpoint and accept the proposal. Old checkpoint acknowledgments do not transfer. Returning to structured editing creates a new named draft from the original structured base after explaining which source-only changes regeneration excludes. Source-to-template promotion passes only an allowlisted generic layout delta and synthetic fixtures.

The comparison and database contracts are implemented; artifact publication/recovery, AI execution, browser review, structured return and generic promotion remain. No source-refinement controls or database migration have been deployed.

## Compiler proof — 2026-09-05

`pnpm --filter @river/templates test` passed all 20 tests. Workspace type and lint checks passed. `pnpm test:documents` built image `sha256:a888699a0c4e2e97a732acae6cae0fec28312ae2568cb19414b9f16bf099a1c2` and passed the complete offline fixture suite. The source candidate compiled twice with the same artifact fingerprint; a missing required manifest field failed text integrity. File access and external font options were rejected before compilation. Source compilation took about 1.05 seconds; peak container memory across the full suite was 416,231,424 bytes. Existing fixed/custom templates, all body sizes, extraction/citation and resource-limit fixtures also passed.
