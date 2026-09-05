# Synthetic template generation

Template proposal execution and review are implemented and deployed to staging. Paper's brief, candidate preview, saved queue, and recovery designs were finalized before UI implementation (`template-ai-design.md`, boards 62, 68, 85, 89, 90). Staging version: `49c5362a-8d29-4125-b8e1-e17e1e0f8cfa`, migration 0016.

The Owner selects a complete immutable base graph, one of fourteen component scopes, density, visual character, and generic constraints. Preflight shows the exact complete input and SHA-256 digest. A reserved design identity keeps preflight and launch identical. Launch rejects changes to that reviewed input. The provider receives only this brief, template graph, destination identity, and four canonical synthetic fixtures. The template service never queries evidence, jobs, or résumé content.

New tasks use profile `river-template-generation-v2`, model `gpt-5.4-mini-2026-03-17`, input limit 160,000 UTF-16 units, output limit 12,000 tokens, and 60-second provider timeout. Existing v1 tasks retain their original prompt contract on retry when the configured model and limits still match. Responses use strict JSON Schema, disabled truncation/storage/streaming, and no SDK retries. River validates the complete selected source and typed overrides against the closed grammar, assigns identity, and preserves the other thirteen components. Generated explanations are advisory.

## Persistence and recovery

Migration 0016 adds generation tasks and independently removable candidate proposals. Launch atomically stores exact input/profile, Operation, dispatch, audit metadata, and a permanent idempotency outcome. Shared AI capacity is two active tasks per Owner. Generation has three explicit attempts.

The Workflow persists a schema-valid candidate and digest before rendering. Its steps return only void/identities, so rejecting a candidate does not leave generated payloads in Workflow results. The preview renders the complete candidate graph once with the canonical all-types fixture and pinned Container resources. D1 publication requires exact graph/runtime identities and a complete private R2 artifact manifest. Failed text integrity cannot authorize acceptance.

Preview retries use the same saved candidate without invoking the provider, including when its key becomes unavailable. Each preview cycle has three attempts. A successful preview expires after seven days; an explicit refresh starts a fresh three-attempt cycle for that candidate. The old preview is cleared atomically, and its identity is recorded in audit metadata, so a failed replacement cycle cannot repeatedly reset itself from the same expired success. Late cancelled/rejected results cannot republish the proposal.

`river-template-preview-seven-days` expires only `transient/template-proposals/` objects in River's personal staging bucket. Rejection removes generated D1 payloads immediately and hides private artifact routes. Cleanup repeatedly scans rejected task prefixes, including orphaned partial uploads, and deletes live objects. Scheduled cleanup and lifecycle expiry recover interrupted deletion. Original base graphs and user-authored briefs remain retained. Backup copies expire under normal backup retention.

## Exact review

The saved queue supports design/history filtering, Pending/Accepted/Rejected states, real counts, and pagination. Inspection includes exact original input, all fourteen component references, full before/after graph and component manifest/source, inherited styles, real PDF, complete text/report, and candidate/graph/preview identities. The current preview remains pinned while reviewing. A replacement requires explicit review; polling cannot transfer acceptance to a new preview.

Acceptance checks the proposal revision/digest, exact preview Operation/report digest, required passing runtime and graph identities, unexpired artifacts, fixture identity, and captured base/destination revisions. A D1 guard checks expiry again inside the same batch as creating the immutable Draft and recording acceptance/audit/idempotency. An expired or stale review produces no dependent writes. Accepted proposals link to their resulting Draft and do not become falsely stale because of their own save.

A candidate preview never qualifies the Draft as Validated or Approved. It still runs all four fixtures twice, followed by separate Owner visual approval. External Agent Credentials cannot generate, review, or mutate templates.

## Verification

Six focused Workers tests pass, including competing acceptance, exact input changes, a preview expiring between preparation and commit, independent retry budgets, stale base, rejection cleanup, late callbacks, Owner-only access, and a strict provider request fixture. The complete Workers suite passes 83 tests across 17 files. All six workspace type checks, lint, and staging build pass.

Local browser fixtures are explicitly synthetic, not live model responses. The saved candidate rendered a real all-types PDF through the Workflow/Container without an AI key. Complete extracted text, multiplicity and reading order passed. The browser compared all fourteen components and accepted exactly one Draft; it still showed no full validation runs. A separate candidate rejection removed its payload from live review. Desktop light/dark layouts and the real PDF were inspected. At 621 px, the queue and dark review have no horizontal overflow; 390 px remains unverified.

Local accepted candidate task: `01a07188-ec68-7456-8f4a-1a14db80139e`; preview Operation: `01a07189-9feb-7187-ac49-a87c419b6439`; resulting Draft revision: `01a0718c-8007-70ce-a6f2-38f5d81ec3e6`. Test receipt: `test-results/template-ai-browser-fixture.json`.

## Conversational iteration

Paper boards 91/92 are implemented locally. Migration 0017 indexes existing tasks into stable design-scoped conversations without changing their immutable captured inputs. New turns atomically commit the ordered turn, original instruction, exact input, Operation, dispatch, audit and idempotency outcome. A competing turn makes preflight stale and prevents all dependent writes.

The composer pins an explicit full-graph base and selected component scope. Continuing from an accepted result selects that exact Draft; acceptance itself does not move the composer. Selecting a different component scope creates a separate scoped design in the same conversation. Prior Accepted instructions for the same exact scope default on; explicit selections survive background refresh. Only selected original instruction texts and identities enter the immutable next input, ordered chronologically. Rejected generated explanations are never copied into conversation records. History uses a stable position cursor with 20 turns per page. The composer permits an 8,000-character instruction and up to 100 selected prior instructions; the complete 160,000-unit preflight still blocks overflow without omission.

Three conversation tests cover ordered input snapshots, rejected-input selection, owner isolation, concurrent turns, permanent replay, cursor pagination and overflow. All 86 Workers tests, workspace type checks/lint and the staging build pass. Local browser review confirms explicit continuation, original-instruction preflight and a real model response. Live task `01a071c2-93f5-7e18-a94e-51bb3235671f` produced a valid 11-point candidate and exposed a missing offline `size11.clo` resource. The image now warms every supported article body size (9, 10, 11, 12 points). The complete offline container suite passes, including each size. The preserved candidate's final preview retry `01a071d6-b52d-7b48-bff2-8d152d789937` passed graph, text integrity, and runtime checks. Its one-page PDF, full text and report were reviewed and accepted into an immutable Draft without another model call. Full Draft fixture validation and Owner approval remain separate.

The Owner supplied both credentials and explicitly approved installing them on the personal staging Worker. Token access to the pinned D1 database and OpenAI model was verified without exposing values. Staging secrets are installed; hosted AI and backup acceptance checks remain open.
