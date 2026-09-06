# Implementation status

Updated 2026-09-05 (America/Chicago). V1 is implemented on personal staging and remains unreleased. This page describes current state; milestone documents retain earlier deployment and verification history. [Release gates](release-gates.md) tracks unfinished acceptance.

## Application and persistence

The six-package pnpm/Turborepo workspace uses strict TypeScript, Effect application services, Effect Schema contracts, Drizzle/D1, private R2, bounded Cloudflare Workflows and a separate document Worker/Container. UI server functions, REST and MCP share application services. Atomic revision guards, reference indexes, permanent idempotency, audit history and recoverable dispatch are implemented and tested.

The sole Owner is created and verified on staging. Email/password and GitHub sign-in work for the same account. Sessions are revocable and protected artifact routes reject anonymous requests. The password-reset adapter now revokes existing sessions; the isolated Better Auth/D1 journey passes. Hosted password entry remains unfinished. Named Agent Credentials have scoped access, hash-only storage, expiry and revision-checked revocation. The approved hosted REST/MCP journey passed; its temporary credential is revoked. See [authentication](authentication.md) and [agent access](agent-access.md).

Only personal Cloudflare account `a91c30d69981b341efe3b656a263f6da` is used. ACM UTSA is excluded. Staging has all 28 migrations through `0027_source_upload_checks.sql`, 72 base tables and 11 Workflows. Exact active code and resource identities are recorded in [deployment.json](deployment.json).

## Tailoring and documents

Source intake preserves immutable originals, recoverable uploads, exact parser versions, processing results, repeated text and Unicode locators. Claims have immutable material revisions, citations, context, explicit verification, archive/restore and reviewed merges. Search and probable-duplicate review are implemented. Job Targets retain immutable posting snapshots, editable Requirement Map revisions and exact evidence selections. Manual use works without AI. See [source intake](source-intake.md), [evidence](evidence.md) and [jobs](jobs.md).

All seven content types have reusable Content, Block and Section revisions. The editor supports independent placements, local wording/composition overrides, explicit promotions and reviewed library updates. Immediate editing, serialized autosaves, session undo/redo, concurrent-tab comparison and preservation in a separate branch are implemented. Copying and changing a section preserves its original library revision and other drafts. See [library](library.md) and [composition](composition.md).

Classic, Minimal and Technical use typed manifests, escaped scalar slots and pinned offline Tectonic resources. The bounded document pipeline retains the latest successful authoritative PDF, rejects obsolete previews, validates text completeness/multiplicity/order, and separates transient previews from immutable checkpoint artifacts. Export captures an exact revision and requires checkpoint-specific evidence acknowledgments. All four output formats remain together. Warm render reuse, interruption recovery and redacted diagnostics are verified. See [checkpoints](checkpoints.md), [render cache](render-cache.md) and [diagnostics](diagnostics.md).

The real USAA workflow now completes intake, manual requirements/evidence selection, composition, review and export. Its checkpoint has 29 explicitly approved Draft acknowledgments, a passing one-page PDF and four downloaded files whose hashes match storage. The original résumé is unchanged. The Notion input is a saved application brief, not a verbatim employer posting. The first development-assisted run exceeded 15 minutes. A fresh prepared-workspace session then completed in 4 minutes 23 seconds, including local wording/order changes, review, export and four hash-verified downloads. This measures agent-assisted use of populated job/evidence/library records, not first-use intake or unaided Owner speed. See [Owner tailoring](owner-tailoring.md).

## Reviewed AI, templates and history

Hosted synthetic source proposals, exact citation inspection, individual Draft acceptance, rejection/payload removal and source-backed clarification answers pass. The v2 source adapter resolves model-selected preserved passage indexes into exact offsets; its bounded retry preserves repeated occurrences and Unicode. Requirement extraction, complete-map review, bounded ranking with explicit gaps and separate evidence selection pass. Duplicate explanations remain reviewable, including a recorded model inconsistency. No synthetic check verifies real Owner evidence. See [source proposals](source-proposals.md), [job analysis](job-analysis.md) and [duplicate comparison](duplicate-comparison.md).

The wording queue and inline assistance support exact original/proposed comparison, evidence inspection, stale-target rejection, one-placement acceptance and session undo/redo. Real PDFs refresh without losing unrelated edits. Actual phone review and keyboard focus return pass. See [wording](wording.md).

Template generation uses synthetic inputs exclusively. Guided briefs, scoped conversations, component differences, cross-pack compatibility and Draft → Validated → Approved → Retired lifecycle are implemented. The hosted 11-point graph passed all four fixtures twice and received explicit staging test visual approval. Approved graph bytes remain unchanged. See [template studio](template-studio.md) and [template generation](template-generation.md).

Final-source review now passes the complete staging test journey: full source/field/text/PDF/report inspection, explicit acceptance into a new retained checkpoint, independent export acknowledgment, structured return in a new branch and generic-only promotion into a separate template Draft. Original and newer work remain unchanged. Promotion excludes expanded private document source. The Paper-designed responsive tab correction passes at 390, 610 and 1280 pixels in both themes. See [source refinement](source-refinement.md).

Explicit checkpoints, chronology, independent restoration branches, pinned full-content comparisons and retained PDF comparisons pass, including actual phone inspection in both themes. Restoration preserves newer work. See [history](history.md) and [mobile review](mobile-review.md).

## Scoring and recovery

The narrow ATS identity change is deployed. River retains exact checkpoint inputs, six independent simulations, dimensional findings, raw responses and rubric/model/deployment identity. Two hosted synthetic checkpoint runs pass; the cached response preserves its identity and compatible comparisons show zero deltas. Oversized real job text is blocked before submission and export remains available. See [scoring](scoring.md).

All nine canonical template documents rendered and remain retained. The Oracle Taleo product-name mismatch is fixed. Minimal’s final bounded retry completes all three six-platform responses, retaining raw identity and earlier failures. Every fixture reports a failing Taleo filter. Classic has exhausted its three attempts with one complete fixture response; Technical retains its earlier failed attempt. No template receives an ATS Screener tested designation. Populated Classic phone review now passes in light/dark themes, including PDF/text, pinned older reports and the exhausted retry limit. See [template scoring](template-scoring.md).

The latest isolated restore passes 72 table counts, FTS equality, foreign keys, 148 retained objects, 24 exact citations and four exports. It preserves the successful complete Minimal scoring retry, timed USAA export, source-refinement decisions, independent branches, generic template promotion and approval. Exact comparison also preserves all 45 original library items/revisions, 23 evidence revisions, four original drafts/checkpoints and four earlier qualification reports. No live database was overwritten or Workflow redispatched. Daily backups retain their actual attempt history. See [recovery](recovery.md).

The latest complete suite passes 158 Workers tests in 26 files. Five domain tests, all workspace types/lint and the staging build pass. Tests use isolated resources and synthetic provider responses; they do not establish live provider reliability. [Release gates](release-gates.md) maps the contract checks to their test files.

## Remaining release work

- Complete hosted password recovery with the Owner's new password.
- Obtain separate production credential/publication approval and complete final-domain acceptance. Current production build/dry-run proof passes; scoring is configured for the verified provider origin.

Production has isolated, empty D1/R2 resources and a passing empty-schema restore. It has no published application, installed secrets, Owner account or active custom domain. See [production preparation](production.md).

The Owner authorizes overriding staging UI decisions for testing. Test acknowledgments and lifecycle approvals must remain identified as tests. This does not establish evidence verification or production approval. The optional complete-Owner-résumé AI rerun remains pending explicit transfer permission; synthetic v2 verification is complete and the optional rerun is not a release gate.
