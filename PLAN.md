# River build plan

Status: implementation authorized. The local Phase 0 path and initial access screens are implemented. The verified Owner completed the hosted PDF path; remaining authentication and recovery gates are tracked explicitly. See [implementation status](docs/implementation/status.md) and [runtime proof](docs/implementation/phase-0.md).

## Approved implementation decisions

- Before creating or updating a page design, have a subagent design it in Paper. Implement only screens and states already present in Paper; keep the design handoff node IDs with each milestone.
- Product name: River. Use the current logo, typography, colors, and interaction designs on Paper's App UI · Newsreader page when implementing each screen.
- Export permits Draft, Needs clarification, stale, archived, and unsupported content only after explicit acknowledgment of each issue for the exact checkpoint. Archived evidence is excluded from default search. Compilation, prohibited constructs, and text-integrity failures remain blocking.
- Returning to structured editing after accepted source refinement creates a new branch and regenerates LaTeX. The UI explains this consequence; the refined checkpoint and its artifacts remain immutable.
- The implementation includes a narrow, backward-compatible ATS Screener change to return scoring identity with results and preserve it through caching. Deltas require compatible rubric/model identity and the same Job Posting Snapshot.
- Transient previews expire after seven days. Daily database backups are retained for 30 days. Original sources and checkpoint artifacts are retained. Rejected proposal payloads are removed from live storage; backup copies expire through retention.
- Use PDF.js and Mammoth as the initial PDF and DOCX adapters, subject to Phase 0 fidelity checks. AI shows Operation-stage progress without token streaming initially.
- Requirement Maps retain categories, required/preferred/unspecified priority, terminology, confidence, and exact supporting passages. Owner changes create revisions; unsupported requirements remain explicit gaps.
- Use separate local, staging, and production resources. Domain, Owner identity, sender, credentials, and model profiles are validated deployment configuration.

The product contract is [SPEC.md](SPEC.md). Canonical terms are in [CONTEXT.md](CONTEXT.md), and durable architecture decisions are in [docs/adr](docs/adr). This plan sequences implementation and identifies remaining design questions. An unchecked milestone means work has not been verified.

## Delivery boundaries

- Phase 0 proves the selected runtime and document pipeline together.
- Phase 1 delivers the first usable MVP: evidence, jobs, requirement analysis, manual assembly, reusable compositions, preview, validation, and export.
- Phase 2 adds AI authoring, template generation, compatibility validation, and final-document refinement.
- Phase 3 adds scoring and the full checkpoint, comparison, restoration, and branching experience.

All three delivery phases constitute V1. Phase 1 includes checkpoint storage and limited conflict comparison/duplication even though the general history interface arrives in Phase 3.

## Selected stack

| Responsibility | Choice | Boundary |
| --- | --- | --- |
| Workspace and tasks | pnpm workspaces, Turborepo | Vite+ deferred; Biome is the formatter/linter, replacing the earlier Oxlint/Oxfmt suggestion |
| Language and builds | Strict TypeScript, Vite, Vitest | Pin compatible versions established by Phase 0 |
| Web application | React, TanStack Start, Cloudflare Vite plugin, Wrangler | Server functions for same-origin UI; server routes for external APIs |
| UI | Tailwind CSS, shadcn, TanStack Query and Form | Conventional React state; Zustand only if editor state warrants it |
| Application services | Exactly pinned Effect 4 RC and matching ecosystem packages | Typed failures, dependencies, configuration, scopes, bounded concurrency |
| Runtime validation | Effect Schema | Canonical contracts; Standard Schema integration for forms; isolated adapter exceptions only |
| Relational persistence | Cloudflare D1, Drizzle | Drizzle schema/migrations/queries; targeted SQL where necessary; no Drizzle types in domain contracts |
| Search | D1 FTS5 and structured filters | AI reranks a bounded candidate set; embeddings/Vectorize deferred |
| Object persistence | Private R2 | Immutable sources, processing results, render outputs, and backups |
| Durable execution | Cloudflare Workflows | Application-owned Operation records remain authoritative for status and history |
| Document processing | Separate Worker-backed Container | Typed extraction, compilation, and template-validation jobs |
| LaTeX engine | Pinned Tectonic, support bundle, fonts, and container image | Offline, bounded, untrusted execution; PDF preview is authoritative |
| Owner authentication | Better Auth, GitHub OAuth and allowlisted email/password | Verification/reset emails; revocable D1 sessions for 30 days; no KV or cookie session cache |
| Authentication email | Cloudflare Email Service binding | Restrict destinations to the Owner |
| Agent authentication | Named scoped bearer credentials | One-time secret display, stored hash, expiration/revocation; shared REST/MCP services |
| AI | OpenAI, server-side deployment secret | Reviewed proposals; exact SDK/model selection remains open |
| Diagnostics | Effect structured logs/spans into Workers Observability | Correlation identifiers without private document content |
| Tests | Vitest, matching @effect/vitest, cloudflare:test, Playwright | Pure rules, service behavior, platform integration, critical owner journeys |

Effect SQL, HTTP, Workflow, and client-state layers are outside the accepted V1 architecture. Workflows owns durable retries; any Effect retry inside a step has a separate bounded budget. Revalidate exact dependency versions during Phase 0 instead of treating interview-time version research as a permanent compatibility guarantee.

The sole Owner is `joshuasilva414@gmail.com`. Deploy only to the personal Cloudflare account. Do not use the ACM UTSA workspace. Production will use `river.jilva.dev`; staging uses its isolated workers.dev address.

## Workspace layout and ownership

| Location | Owns |
| --- | --- |
| `apps/web` | Routes, UI, authentication wiring, application services, platform adapters, Workflow entrypoints, REST and MCP transports |
| `apps/documents` | Document Worker, Container image, typed job dispatch, extraction and compiler adapters, bounded process execution |
| `packages/domain` | Domain values, invariants, revision relationships, draft command behavior, typed failures; no platform bindings |
| `packages/contracts` | Effect Schema command/result contracts, transport-safe errors, document-job envelopes; imports domain definitions where needed |
| `packages/db` | Drizzle schema, migrations, D1 repository implementations, reference indexes and search SQL |
| `packages/templates` | Manifests, compositor, built-in packs, deterministic synthetic fixtures and template validation rules |

Application services initially remain inside `apps/web`; extract a shared service package only if a second consumer needs it. Shared packages cannot import either application. Keep server adapters out of browser imports. Do not add a shared UI package without a second UI consumer.

## Data and command contracts

The following are logical persistence groups, not a finalized table-per-row prescription:

| Group | Records and invariants |
| --- | --- |
| Identity | Owner account/session records and distinct Agent Credentials with action scopes |
| Sources | Source Artifacts, immutable blobs and SHA-256 identities, versioned Source Processing Results; deduplication never merges provenance |
| Evidence | Stable Claims, immutable Revisions, exact Citations, explicit Verification decisions, recoverable archival and merge history |
| Context | Owner Profile, Employment, Project, Education, Credential; historical resume values must remain pinned or snapshotted |
| Content | Resume Content Items and immutable Content Revisions referencing exact Evidence Revisions |
| Composition | Reusable Blocks/Sections and their revisions; presentation-neutral bindings; draft placements and local overrides |
| Jobs | Job Targets, immutable posting snapshots, one current posting pointer, Requirement Maps and immutable revisions |
| Drafts/history | One autosaved aggregate per branch, optimistic revision, transactional relational reference indexes, immutable checkpoints |
| Templates | Stable identities, immutable revision payloads, review/lifecycle records and exact assets |
| Execution | Operations, attempts/results/failures, AI Proposals and exact dependency references, artifact manifests |
| Audit | Actor, mutation identity, payload fingerprint, permanent idempotency outcome and restoration information |
| Scoring | Exact checkpoint submission, text fingerprint, job snapshot, provider/deploy/rubric identity, raw results and failure state |

Use UUIDv7 text identifiers with distinct TypeScript brands, epoch-millisecond storage timestamps, and ISO timestamps at API boundaries. Mutation handlers derive the actor from authentication, never from an untrusted caller field.

Every command validates authorization and input before domain work. Updates require the observed revision. The database write, corresponding audit entry, idempotency result, and reference-index updates must commit atomically. Implement the expected-revision condition in the write itself; a preliminary read alone does not prevent races.

Implementation requirements derived from the accepted concurrency contract:

- Scope an idempotency key to an actor and command identity. Store a request fingerprint and reject reuse with a different payload.
- Return the established result for a legitimate retry without repeating side effects. Recheck current authorization before returning private results.
- Translate expected failures to typed application errors and REST Problem Details. Keep infrastructure exceptions private.
- Serialize each browser draft's outgoing mutations against the last acknowledged revision. Retain later local edits while earlier autosaves are in flight.
- Define database-to-Workflow and D1-to-R2 recovery protocols explicitly; an Effect scope does not create a transaction spanning these systems.

## Phase 0: compatibility and rendering proof

- [x] Pin the workspace toolchain and prove TanStack Start development, production build, and deployed Worker behavior.
- [x] Execute one Effect application service through a server function and an external server route. Validate its Effect Schema input and typed error mapping.
- [x] Prove Drizzle/D1 migration, conditional revision update, and atomic persistence of aggregate, index, and audit data.
- [ ] Prove Better Auth GitHub login, allowlisted registration, verification/reset delivery, session revocation, and denial of non-owner access.
- [ ] Exercise cold starts, aborted requests, and subsequent requests on the deployed runtime to catch initialization lifetime issues.
- [x] Read/write private R2 content and execute an Effect program within a Workflow step; verify retry and Operation reporting.
- [x] Run one synthetic resume through the document Container: manifest composition, offline Tectonic compilation, PDF text extraction, and artifact return.
- [x] Select the PDF/DOCX parsing and PDF-viewer libraries after testing their actual extraction fidelity, licensing, and runtime compatibility.
- [x] Record cold/warm compile latency, bundle/image size, resource use, and integration failures. Establish concrete operational limits before extending the pipeline.

Exit: one authenticated, deployed vertical path produces a PDF from synthetic input with expected text. Exact versions and reproducible commands are documented. An incompatible selected component is reported for a design decision rather than silently replaced.

## Phase 1: core tailoring loop

### M1. Foundation and access

Depends on Phase 0.

- [x] Establish package boundaries, schema migrations, configuration validation, secret bindings, Effect Layers, and typed errors.
- [ ] Implement owner bootstrap and both login methods, verification/recovery, revocation, and protected routes/downloads.
- [x] Implement credential creation, one-time secret display, scopes, expiration, revocation, and credential activity.
- [x] Implement shared command execution, optimistic concurrency, permanent idempotency, and activity history.
- [ ] Add correlated diagnostics with redaction and CI checks for types, formatting/linting, focused tests, and builds.

Exit: owner and agent capabilities are distinct; duplicate requests do not duplicate mutations; conflicting requests cannot overwrite newer state.

### M2. Canonical sources and evidence

Depends on M1 and the document extraction proof.

- [x] Accept pasted text, Markdown, TXT, PDF, DOCX, and structured API sources. Retain URL metadata without fetching it.
- [x] Persist immutable originals and versioned parser outputs; preserve distinct provenance for identical blobs.
- [x] Implement context records, Claims, Revisions, Citations, verification rationale, and visible Owner attestations.
- [x] Implement material-edit invalidation, metadata edits, archive/restore, reviewed merges, and probable-duplicate review.
- [x] Add FTS5 search and structured filters with consistent index updates.
- [x] Expose evidence/source capabilities through versioned REST and a thin stateless MCP facade sharing application services.
- [x] Extend REST/MCP to job capabilities with M3.

Exit: an agent can populate evidence without silent duplicates; citations resolve to exact inputs; material edits preserve historical verification and make dependent content stale.

### M3. Job analysis and reviewed AI proposals

Depends on M2.

- [x] Implement Job Targets, immutable posting snapshots, current pointers, and Requirement Map revisions.
- [x] Provide manual requirement editing and evidence search before relying on AI availability.
- [x] Persist exact evidence selections per posting and requirement; preserve historical maps and provide explicit conflict recovery.
- [ ] Implement the OpenAI adapter, requirement extraction, bounded evidence ranking, and requirement/global views with explanations and citations.
- [x] Persist pending proposals for later review; retain accepted proposals; discard rejected proposal content. Do not add detailed trace retention in MVP.
- [x] Pin proposal inputs and targets. At acceptance, atomically reject changes to relevant revisions and require review of an updated proposal.
- [x] Keep Operation completion separate from proposal review. Preserve manual use when AI generation fails.

The adapter and review UI are implemented and tested with synthetic responses. Live requirement extraction and ranking remain unverified until the Owner supplies `OPENAI_API_KEY`; see `docs/implementation/job-analysis.md` for profile pins and bounds.

Exit: a posting can be analyzed and evidence selected with or without AI. Reloads preserve pending proposals, and accepting a stale proposal cannot change current data.

### M4. Reusable content and composition editor

Depends on M2; integration with job tailoring depends on M3.

- [x] Implement seven initial content types, Content Revisions, citations, derived staleness, and local Content Overrides.
- [x] Implement reusable Block and Section revisions with exact content/child bindings and presentation-neutral semantics.
- [x] Implement placements, copy on write, local Composition Overrides, explicit promotion/fork, and optional application of newer library revisions.
- [x] Persist schema-validated draft aggregates and transactional reference indexes.
- [x] Implement domain commands, immediate local editing, debounced autosave, and session-local undo/redo.
- [x] Add visible saving/saved/conflict states and limited conflict comparison, reload, and duplication into a separate branch.
- [x] Keep pending commands only in memory. Full offline synchronization remains deferred.

Exit: copy a section between two resumes, edit the copy, and prove the original and both pinned histories are unchanged. Concurrent tabs preserve conflicting work through the recovery flow.

### M5. Templates, authoritative preview, and export

Depends on M4 and the document pipeline proof.

- [ ] Implement typed manifests and LaTeX fragments, typed scalar escaping, explicit child slots, inherited tokens, and validated overrides.
- [x] Ship Classic, Minimal, and Technical packs with fixed compatible compositions.
- [x] Compile only typed document jobs using bounded input/output, fresh job environments, offline resources, and explicit process limits.
- [x] Debounce/coalesce previews, retain the last successful PDF with stale/compiling status, and ignore obsolete results when updating the current preview.
- [ ] Cache by complete render inputs. Exact revision/template coalescing and separate transient/retained keys are implemented; cross-revision cache reuse remains open.
- [x] Validate required text completeness, intended multiplicity, and reading order against a canonical expected-text representation with documented normalization.
- [x] Block compilation/integrity failures and prohibited constructs; expose layout warnings and required evidence acknowledgments.
- [x] On export, capture the exact draft revision as a checkpoint and export artifacts from that snapshot. Concurrent edits must not change the export payload.
- [x] Retain PDF, `.tex`, extracted text, and validation reports associated with exported checkpoints.

Exit: all three packs render representative fixtures and real owner content with correct extraction. A displayed or exported PDF is associated with its exact input revision, and stale renders cannot masquerade as current ones.

### M6. MVP release and recovery

Depends on M1–M5.

- [ ] Verify critical journeys with Playwright: sign in, add sources/evidence, review a job, compose, resolve a conflict, inspect warnings, and export.
- [ ] Verify authorization, stale proposal rejection, idempotent retry, partial background failure, and immutable historical outputs with focused integration tests.
- [ ] Configure D1 Time Travel and daily D1 exports to a private R2 backup location; preserve immutable source objects.
- [x] Perform a restore drill into isolated resources and verify source/provenance links and retained exports.
- [ ] Document deployment, migrations, secrets, rollback constraints, background-job diagnosis, backup and restore procedures.
- [ ] Complete one real job-tailoring session within 15 minutes and record delays that need correction before MVP release.

Exit: the Owner can complete the core loop; failures are diagnosable; data can be restored; AI and scoring availability do not determine whether manual export works.

## Phase 2: AI authoring and template refinement

- [x] Extract candidate evidence into reviewable drafts with exact citations; never auto-verify generated claims.
- [x] Preserve clarification questions and record source-backed answers against new Evidence Revisions without automatic verification.
- [x] Add bounded AI duplicate comparisons to the existing manual comparison and disposition workflow.
Duplicate comparison services, Paper review/history UI, and atomic optional disposition attribution are implemented and locally verified. Live provider generation remains credential-dependent. See `docs/implementation/duplicate-comparison.md`.

Source proposal services, Paper UI, and clarification tracking are deployed with synthetic acceptance checks; live generation remains credential-dependent. See `docs/implementation/source-proposals.md`.
- [x] Add the keyword rewrite queue with original/proposed wording, supporting evidence, meaning-change explanation, individual acceptance, and stale-input checks.
Wording assistance is implemented and deployed with synthetic service/browser checks; live generation remains a separate credential-dependent acceptance gate. See `docs/implementation/wording.md`.

- [x] Implement guided template briefs and iterative generation using synthetic fixtures exclusively.
- [x] Implement Draft → Validated → Approved → Retired lifecycle behavior; editing approved payloads creates new revisions.
- [x] Validate cross-pack style contracts before enabling component mixing.
Manual template editing, full-graph validation, explicit donor combinations, and exact custom résumé bindings are deployed. Synthetic-only AI generation and scoped conversations are deployed through migration 0017. A hosted model candidate was reviewed, accepted into a Draft, and passed all four fixtures twice; visual approval remains a separate Owner action. See `docs/implementation/template-studio.md` and `docs/implementation/template-generation.md`.
- [ ] Support final-document source proposals with full diffs, extracted-text changes, rendered preview, validation, and explicit acceptance into a new checkpoint.
- [ ] Support promotion of final-document changes into new template drafts subject to normal validation and approval.

Exit: every generated change is reviewable and attributable; content changes cannot be hidden behind a layout-only label; reusable template generation never receives private resume content.

## Phase 3: scoring and history

- [ ] Add explicit checkpoint creation, chronological history, branching, non-destructive restoration, and side-by-side comparisons.
- [ ] Integrate ATS Screener behind a replaceable provider adapter using the exact checkpoint text and job snapshot.
- [ ] Persist provider/deploy/rubric identity, submission fingerprint, raw six-platform simulations, fallback information, suggestions, and failures.
- [ ] Compare scores only within the same provider/rubric identity. Label simulations separately from local document validation.
- [ ] Implement retryable scoring failures and provider limits without blocking export.
- [ ] Score canonical template fixtures and assign the separate ATS Screener tested designation only when its stated criteria pass.
- [ ] Add inline writing assistance after review-queue behavior is proven.

Exit: restoring history never destroys newer work, score comparisons preserve their meaning, and scoring outages leave export usable.

## Review items still open

These choices are not settled by Q77. Resolve product behavior before the affected milestone; resolve replaceable adapter details through focused technical evaluation.

| Item | Needed by | What remains to decide |
| --- | --- | --- |
| Requirement Map contract | M3 | Requirement categories, priorities, confidence representation, source anchors, manual overrides, and unsupported/unknown evidence treatment |
| AI execution | M3 | SDK/API, model profiles, task/output budgets, cancellation, retry limits, and whether long tasks expose streamed progress |
| Evidence export policy | M4/M5 | Exact behavior for Draft, archived, stale, or unattested content; agreed warnings cover Needs clarification and unsupported skills but do not specify every state |
| Provenance details | M2 | Parser-specific citation anchors and historical contact/context values; avoid mutable context records changing checkpoint output |
| Review metadata | M2/Phase 2 | How verification and template lifecycle transitions are recorded while revision payloads remain immutable |
| Document adapters and limits | Phase 0/M5 | Parser/viewer choices, file/page/output limits, timeouts, warm-container strategy, resource/cost envelope, preview latency target |
| Raw document overrides | Phase 2 | What happens when structured draft content changes after a final-source override has been accepted |
| Deployment configuration | M1/M6 | App hostname, Owner bootstrap identity, sender domain/address, environment separation and deployment automation |
| Retention | M5/M6 | Exact preview lifetime, backup retention, and how rejected proposal content removal relates to backups and provider retention |
| Recovery protocols | M1/M2 | Durable dispatch after a D1 commit, retry ownership, orphaned objects, and document-job idempotency |

## Deferred ideas

Full offline synchronization; full event sourcing; Vite+ adoption; semantic vector search if measured retrieval needs it; a sandboxed general-purpose template engine; optional HTML approximation if an existing tool proves useful; TeX Live adapter if needed; detailed AI trace retention; multi-user collaboration; public template sharing; DOCX export; automatic Notion synchronization; mobile composition; Electron packaging; explicit page-count targets.

## Reference baseline

Consult the current official documentation during each compatibility evaluation. The selections above reflect accepted decisions, not a claim that all integrations have already been built or tested.

- [TanStack Start on Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [TanStack server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes)
- [Effect repository and release lines](https://github.com/Effect-TS/effect)
- [TanStack Form validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation)
- [Better Auth TanStack integration](https://better-auth.com/docs/integrations/tanstack)
- [Cloudflare Workflow rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [Tectonic compile command](https://tectonic-typesetting.github.io/book/latest/v2cli/compile.html)
- [Cloudflare Email Service](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
