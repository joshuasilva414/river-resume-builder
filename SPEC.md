# River product specification

River is the product name. Resume Builder remains the descriptive project name. The approved Paper App UI designs define the interface, including the current River logo.

## Product goal

Build a private, Joshua-first web app that turns a job description and verified personal evidence into a reviewed, tailored resume within 15 minutes.

V1 includes all three delivery phases. Phase 1 is the first usable MVP. The hosted application is internet-reachable, but its UI is available only to the owner; external agents authenticate through separate scoped credentials.

The sole Owner is `joshuasilva414@gmail.com`. The production hostname is `river.jilva.dev`. Deployment belongs to the personal Cloudflare account; the ACM UTSA workspace is excluded.

The product remains user-directed:

- AI recommends, extracts, ranks, and proposes changes.
- Users choose evidence and approve wording.
- Unsupported claims are never added silently.
- ATS scores are diagnostics, not definitions of candidate quality.

The main experience is a desktop-first guided workspace. Mobile initially supports review and history. Keep the core domain portable for a possible Electron app.

## Core information model

The content hierarchy is:

**Source Artifact -> Evidence Claim -> Resume Content Item -> Block -> Section -> Resume Draft -> Resume Checkpoint**

Supporting concepts:

- **Context entities:** Owner Profile, Employment, Project, Education, and Credential records.
- **Source artifacts:** Immutable original files or captured content, provenance metadata, and versioned processing results such as parsed text.
- **Evidence citations:** Links from evidence revisions to exact supporting excerpts or locations within source artifacts.
- **Evidence claims:** Atomic factual statements linked to sources and context entities.
- **Resume Content Items:** Reusable bullets, summaries, skills, employment entries, projects, education entries, and credentials without presentation-specific layout.
- **Resume Blocks:** Reusable, versioned compositions of content for one block type.
- **Resume Sections:** Reusable, versioned ordered compositions of Resume Blocks.
- **Job targets:** One opening with one or more immutable job-posting snapshots. One snapshot is current for new work, while every resume checkpoint preserves the exact snapshot it used.
- **Requirement maps:** Versioned, editable AI-extracted requirements, priorities, keywords, confidence, and source passages associated with an exact Job Posting Snapshot.

Evidence Revisions use three review states: `Draft`, `Needs clarification`, and `Verified`. `Archived` is a lifecycle state of the stable Evidence Claim rather than one of its revisions.

Verification is an explicit decision about one Evidence Revision. It requires at least one Evidence Citation and a recorded rationale from the Owner or an Agent Credential with verification scope. Owner attestations may support verified revisions, but remain visibly identified as attestations.

Changing an assertion, date, quantity, associated context entity, citation, or verification-relevant wording is material. A material edit creates a new Evidence Revision and removes its verified status. Display labels, organizational tags, and private notes are metadata edits. Linked Resume Content Items become stale after a material edit. Existing Resume Checkpoints never change.

Source-to-claim assistance captures one complete current Ready extraction and explicitly selected current context revisions. Candidates are reviewed independently. Acceptance checks the exact candidate digest and all captured source/context dependencies, then atomically creates a Draft Claim with its citations, review attribution, and any clarification questions. Manual edits create an independent Draft with origin attribution and leave the proposal Pending. Rejection removes the candidate's live generated payload and creates no separate question copies. A clarification answer links an immutable source or Owner attestation to a new cited Evidence Revision; recording that link does not verify the claim.

AI duplicate comparison is limited to one current Pending pair and its exact evidence, citations, context, and review inputs. Mark reviewed acknowledges the saved explanation without resolving the pair or verifying either claim. A separate manual disposition may explicitly link that reviewed comparison; the entire command fails if its captured dependencies are stale. Stale Pending comparisons permit inspection or rejection only. Saved comparison history remains accessible through both Claims after disposition, and rejection removes the live generated payload.

Draft, `Needs clarification`, stale, archived, and unsupported content remain selectable, but receive prominent warnings and require explicit acknowledgment of each applicable issue for the exact exported checkpoint. Archived evidence is excluded from default search. Acknowledgments never override compilation or text-integrity failures.

## Evidence management and agent access

Resume Builder becomes the canonical evidence system. There will be no dedicated Notion importer; an agent will transfer the existing records through the application API or MCP server.

External access uses named, scoped credentials. V1 exposes:

- Full evidence read, create, update, verify, merge, archive, restore, and delete-equivalent capabilities.
- Creation of new job targets and job-description snapshots.
- No external resume or template mutation.

Agent Credential permissions are action-oriented and may expire. V1 scopes include `source:read`, `source:write`, `evidence:read`, `evidence:write`, `evidence:verify`, `evidence:merge`, `evidence:archive`, `jobs:read`, and `jobs:write`.

All mutations require an idempotency key, actor identity, and the revision observed by the caller when updating existing state. A stale update produces a conflict instead of overwriting newer work. Repeated submissions resolve to one operation, and idempotency records remain part of the permanent activity history. Probable duplicates enter a review queue rather than merging automatically.

Each external credential secret is shown once. Only its hash, identity, scopes, lifecycle state, and activity metadata are retained. REST and MCP calls use the same application capabilities and authorization rules.

Phase 1 accepts pasted text, Markdown, TXT, PDF, DOCX, and structured API-created source artifacts. A URL may be retained as provenance metadata, but the application does not automatically fetch it. OCR, image ingestion, email import, and repository crawling are deferred.

Deletion is implemented as recoverable archival. Merges preserve source records and provenance. The activity history records before-and-after state for restoration.

## Tailoring experience

The primary workflow is:

1. Add or select a job target.
2. Review its immutable job-description snapshot.
3. Review and edit the AI-generated requirement map.
4. Inspect evidence in two views:
   - Ranked beneath each requirement.
   - Ranked globally across the posting.
5. Select evidence manually.
6. Choose or create Resume Content Items.
7. Assemble blocks and sections.
8. Review the live rendered resume.
9. Inspect warnings and extracted text.
10. Export PDF and `.tex`.

A plain-text extraction preview accompanies every export. DOCX is deferred.

The authoritative live preview is a Tectonic-generated PDF. Draft changes are debounced and obsolete compilation requests are coalesced. While compilation is pending, the editor continues to show the last successful PDF with an explicit stale or compiling state. A later research spike may evaluate an HTML approximation for faster feedback, but it must remain visibly approximate and cannot become an export dependency or source of truth.

The application does not enforce a page target initially. Templates paginate adaptively. Explicit one- or two-page targets may be added later.

## Resume content library

The initial content types are:

- Contact/header
- Summary
- Experience
- Projects
- Education
- Individual skills and skill groups
- Credentials and certifications

A Resume Content Item has a stable identity and immutable Content Revisions. Each Content Revision cites exact Evidence Revisions. Staleness is derived from those links rather than set manually. Job-specific rewrites remain local to that resume unless deliberately promoted into the reusable library.

A job-specific Content Override retains its base Content Revision, complete local wording, exact supporting Evidence Revisions, and the reason for the override. Promotion is explicit. An override that supersedes the same reusable idea becomes a new Content Revision; a distinct useful alternative becomes a new Resume Content Item.

Resume Blocks and Resume Sections have stable identities and immutable revisions. A Block Revision owns its block type, ordered typed field bindings to exact Content Revisions, semantic options, and composition rules. A Section Revision owns its section type, heading semantics, ordered bindings to exact Block Revisions, and section-level composition options. Both remain presentation-neutral; their placements in a Resume Draft bind exact Template Revisions compatible with the selected theme.

Copying a Block or Section creates a new placement referencing the same exact revision. Its first edit creates a draft-local composition override. The Owner may explicitly promote the result as a new reusable revision or fork it into a separate reusable identity. New library revisions never automatically change existing drafts; the editor offers a comparison and an explicit Apply action. Checkpoints retain their original composition and presentation.

## Editor persistence and recovery

Editor mutations use domain commands such as `insertBlock`, `moveBlock`, `applyContentOverride`, and `changeTemplate`. Each command carries an idempotency key and expected draft revision. The browser applies edits immediately and debounces autosave; successful server responses establish the next acknowledged base revision. Undo and redo remain local to the current editing session, while checkpoints provide persistent history.

Concurrent edits from another tab or device cause a revision conflict instead of overwriting newer work. Phase 1 includes a limited recovery dialog that retains unsaved edits in memory, compares them with the current server draft, and offers Reload or Duplicate as a separate draft branch. Duplication preserves the local composition without overwriting the current server draft. A reload that discards unsaved edits must make that consequence explicit. The complete history and branching interface remains in Phase 3.

Phase 1 keeps pending edits and undo history only in browser memory. D1 remains authoritative for acknowledged saves; there is no IndexedDB or other persistent browser recovery buffer. Unsaved changes do not survive a tab crash or reload. Full offline editing with a synchronization engine and reconciliation is a later feature.

Keyword optimization uses a review queue. Each suggestion shows:

- Original and proposed wording.
- The relevant job terminology.
- Supporting evidence.
- Why the change improves alignment.
- Whether the change affects meaning.

Users accept or reject suggestions individually. A wording task targets one saved Content placement and its exact selected evidence, review decisions, pinned context values, and bound posting snapshot. Its target digest excludes unrelated draft names and sibling placements. Acceptance verifies that target and support against current state, then atomically applies a local override against the currently observed draft revision. Unrelated edits survive; changed target or support requires a new reviewed proposal. Each decision identifies the exact proposal digest. Rejection removes the generated payload from live storage without retaining copies in permanent receipts or audit entries. Inline assistance follows later.

## Template system

Templates have three compositional levels:

- **Document templates** control page structure and shared styles.
- **Section templates** render headings and arrange collections.
- **Block templates** own the layout for individual content units.

Block types define their fields, compatible content, composition rules, editor behavior, LaTeX renderer, and validation requirements.

Each Template Revision contains an Effect-Schema-validated manifest and LaTeX fragments. The manifest declares its compositional level, compatible content and child types, style contract, tokens, assets, typed slots, and validation metadata. A typed compositor escapes scalar content according to its slot type. Only declared child-output slots accept already-rendered LaTeX. Templates cannot evaluate scripts, arbitrary functions, or application data. A general-purpose sandboxed template engine remains a possible later extension rather than a V1 dependency.

Parent templates provide inherited typography, spacing, colors, and heading styles. Child templates inherit these values by default but may declare validated overrides.

Theme packs bundle compatible document, section, and block templates. Components from different packs can mix when their declared style contracts are compatible.

Phase 1 uses fixed combinations within each pack. Cross-pack mixing remains disabled until Phase 2 introduces style-contract compatibility validation.

V1 includes three packs:

- Classic
- Minimal
- Technical

## AI-generated templates

Template creation starts with a guided design brief covering structure, density, visual character, and constraints. An AI chat supports iterative refinement.

Templates have stable identities and immutable Template Revisions. Editing an approved revision creates a new draft revision. Resume Checkpoints pin exact Template Revisions.

AI-generated Template Revisions enter the library as drafts:

**Draft -> Validated -> Approved -> Retired**

Retired revisions remain renderable for existing Resume Checkpoints but cannot be selected for new Resume Drafts.

Reusable template generation and preview always use synthetic fixture content. Real evidence or resume data is not used.

Validation includes:

- LaTeX compilation.
- Required block compatibility.
- Page and overflow behavior.
- Prohibited ATS-risk constructs.
- Extracted-text completeness and reading order.
- Deterministic rendering against standard fixtures.
- Visual user approval.

Compilation failure, prohibited constructs, and missing, duplicated, or incorrectly ordered required extracted text block export. Page-count and layout-risk findings remain warnings. `Needs clarification` evidence may be exported only after explicit acknowledgment. ATS results never gate export.

Templates receive two separate designations:

- **ATS-safe:** Passed local structural and extraction validation.
- **ATS Screener tested:** Every canonical fixture passed all six `passesFilter` simulations.

## Final-document refinement

After generating the complete LaTeX document, AI may propose direct edits to the source. Its instruction should favor minimal layout corrections, but the proposal's technical scope is unrestricted. The proposal has no authority over accepted content until the owner explicitly accepts it.

Before acceptance, the app:

- Shows the complete source diff.
- Classifies layout changes separately from wording or factual changes.
- Highlights every extracted-text change.
- Renders a new preview.
- Repeats compilation and extraction validation.

Accepting edits creates a new checkpoint with a resume-specific override. Existing checkpoints remain unchanged. Accepted edits never mutate library templates automatically. Users may promote a useful change into a new template draft, which must pass the normal approval process.

Returning to structured editing creates a new branch from the structured base and regenerates LaTeX. The Owner sees an explanation before proceeding. The accepted source override, PDF, and original checkpoint remain preserved.

## AI access

V1 uses OpenAI through a user-provided API key. Internal product concepts remain task-oriented so additional providers can be added without changing the domain model.

The single owner's OpenAI key is configured as a server-side deployment secret. It is not stored in application data or exposed to the browser.

AI may access the complete workspace for authorized evidence, job-analysis, ranking, and resume-refinement tasks. Template generation is the exception and always uses synthetic content.

An AI task Operation ends when generation succeeds or fails. Any resulting AI Proposal has an independent review state: `Pending`, `Accepted`, or `Rejected`. Waiting for human review never keeps execution infrastructure active.

Each AI Proposal pins the exact input revisions and target revision used to generate it. Acceptance rechecks those dependencies and fails if relevant evidence, content, or the target has changed. The Owner must review an updated proposal before acceptance; the application cannot silently rebase or apply a stale suggestion. Staleness is separate from the proposal's review state.

Requirement extraction proposes a complete map with explicit retained, added, and removed identities. New identities are assigned when the proposal is saved. Acceptance applies the whole reviewed map atomically and requires acknowledgment of removed requirement-specific evidence associations. General selections and associations for retained identities remain. Ranking reviews a bounded set of exact evidence revisions and records gaps and explanations. Accepting a ranking records the review only; choosing evidence remains a separate explicit action after inspecting its current provenance.

The product remains usable without AI for evidence editing, manual assembly, approved template use, preview, and export.

During Phase 1, pending AI Proposals are persisted on the server until the Owner accepts or rejects them, so review can resume after a reload or in a later session. Accepted proposals and their resulting domain changes remain in history. Rejection discards the proposal content. Detailed AI execution traces are ephemeral. A later phase will add structured trace retention covering the task type, referenced records, model, prompt-contract version, structured output, token usage, and timestamps.

## Technical quality constraints

The server application core uses Effect for typed failures, service composition, configuration, resource safety, concurrency, and bounded retry behavior. Effect Schema is the canonical runtime schema system for domain values and application contracts. React components continue to use conventional React and TanStack patterns rather than an Effect-specific client-state layer.

The mutable Resume Draft is stored in D1 as one Effect-Schema-validated aggregate document with an optimistic-concurrency revision. Small relational reference indexes are updated in the same transaction to support staleness and reverse lookups. Resume Checkpoints preserve immutable aggregate snapshots.

TanStack Start server functions serve same-origin application calls. Versioned server routes expose `/api/v1` and `/mcp` to external clients. Every transport invokes the same Effect application services and authorization capabilities.

External REST errors use typed Problem Details responses. They include a stable application error code, trace identifier, validation issues when relevant, and expected-versus-observed revision information for concurrency conflicts.

Cloudflare Workflows owns durable, cross-request execution and retry behavior. Effect retries are permitted only for bounded transient operations within one request or Workflow step, with explicit attempt and elapsed-time budgets.

Production diagnostics use structured Effect logs and spans collected by Cloudflare Workers Observability. Request, actor, Operation, and Workflow identifiers provide correlation. Sensitive source, evidence, job, and resume content must not appear in logs.

Tests are divided by responsibility:

- Vitest covers pure domain behavior.
- Matching `@effect/vitest` packages cover Effect programs, test Layers, clocks, retries, and typed failures.
- `cloudflare:test` covers D1, R2, bindings, and Workflow integration.
- Playwright covers a small set of critical owner journeys.

Rendered outputs are content-addressed by the document fingerprint, exact Template Revisions, renderer version, font and asset bundle, and compiler version. Draft preview artifacts expire through an R2 lifecycle policy. Checkpoint and exported PDF, `.tex`, extracted text, and validation reports are retained as historical outputs.

## Version history

Each job target owns a resume workspace with:

- One autosaved working draft per branch, with one initial branch.
- Immutable checkpoints.
- Alternative branches for different content or template experiments.
- Side-by-side comparison between any checkpoints.

Phase 1 implements checkpoint persistence, automatically checkpoints a dirty draft before export, and provides basic checkpoint visibility. It also includes conflict-specific comparison and duplication into a separate draft branch so concurrent edits can be preserved. Phase 3 adds explicit checkpoint creation, general-purpose branching, restoration, checkpoint comparison, and the complete history interface.

Primary actions are:

- **Save checkpoint**
- **Save & score**
- **Export**, which first checkpoints a dirty draft

Restoring an older checkpoint creates a new working branch instead of deleting later history.

The default history view is chronological. Branch relationships appear when alternatives exist.

## ATS scoring

`ats.jilva.dev` remains a separate, replaceable score provider.

`Save & score` sends the exact checkpoint's extracted resume text and job description to `POST /api/analyze`. The stored scoring record includes:

- Submitted text fingerprint.
- Job snapshot.
- ATS Screener deploy identity from `/api/version`.
- Six raw platform-specific results.
- Provider and fallback metadata.
- Score, dimensional breakdown, suggestions, and `passesFilter`.
- Request time and failure state.

Scores from different providers or scoring versions are never normalized. Progress comparisons are valid only for the same provider and rubric version.

Application validation and vendor scorecards remain separate. Findings can be marked `Addressed`, `Accepted`, or `Not applicable`.

ATS Screener consumes extracted text rather than the original document and describes its platform results as simulations. The UI must preserve that distinction. See the [API reference](https://ats.jilva.dev/docs/api/endpoints/) and [scoring methodology](https://ats.jilva.dev/docs/scoring/methodology/).

Rate limits, outages, and malformed responses produce retryable failed scoring runs. They never prevent export. The public service currently documents limits of 10 requests per minute and 200 per day per IP. See the [rate-limit documentation](https://ats.jilva.dev/docs/api/rate-limits/).

## Delivery sequence

### Phase 1 - Core tailoring loop

- Private hosted web app with one owner account.
- Canonical evidence bank, source artifacts, provenance, and revision behavior.
- Evidence and job API/MCP access.
- Job snapshots and AI-assisted requirement analysis, with manual requirement editing when AI is unavailable.
- Requirement-centered and global evidence ranking, with manual evidence search, filtering, and selection as the fallback.
- Manual resume assembly.
- Autosave and limited conflict recovery, including comparison with the server draft and preservation as a separate draft branch.
- Seven built-in content types.
- Three fixed, internally compatible theme packs.
- Live preview, local validation, PDF, `.tex`, and extracted-text export.
- Validate the 15-minute tailoring target with a real job application.

### Phase 2 - AI-assisted authoring and templates

- Evidence extraction into reviewable drafts.
- Keyword rewrite queue.
- Guided AI template generation and chat refinement.
- Theme-pack compatibility validation.
- Final-document AI refinement and classified diff review.
- Template promotion and approval workflow.

### Phase 3 - Scoring and version exploration

- User-facing checkpoints, branching, restoration, and comparisons.
- `Save & score`.
- ATS Screener scorecards and same-rubric deltas.
- Template fixture scoring and `ATS Screener tested` badges.
- Inline writing assistance after the review-queue workflow is proven.

## Acceptance criteria

The build is ready when:

- An agent can populate evidence and jobs without duplicates or unaudited mutations.
- Editing verified evidence preserves the old revision and marks derived content stale.
- A user can inspect AI-extracted requirements and understand every recommendation.
- Unresolved evidence is never exported without acknowledgment.
- Each starter theme produces compilable PDF and `.tex` output with correct extracted-text order.
- A real tailored resume can be completed and exported within 15 minutes.
- AI template previews contain synthetic data only.
- Final AI refinement cannot hide wording changes inside layout edits.
- Restored checkpoints do not destroy later work.
- ATS failures do not block export or corrupt scoring history.

Deferred work includes multi-user collaboration, public template sharing or a marketplace, DOCX export, automatic Notion synchronization, mobile composition, Electron packaging, inline AI writing, explicit page-count targets, a sandboxed general-purpose template engine, and an optional HTML preview approximation.
