# Implementation ledger

Updated 2026-09-05 (America/Chicago).

## Current state

The repository began as product and architecture documents. The approved V1 plan remains the delivery scope. The main Phase 0 hosted exit criterion is met; some authentication/recovery checks remain open. M2 source intake/evidence and the manual M3 job-tailoring workflow are implemented; no MVP or V1 release is claimed.

Implemented and checked locally:

- Six-package pnpm/Turborepo workspace, strict TypeScript, Biome, exact dependency pins, focused Vitest/Workers tests, and CI configuration.
- Request-scoped Better Auth with sole-Owner registration, email verification/recovery adapters, revocable D1 sessions, conditional GitHub OAuth, and protected artifact downloads.
- Effect application services called by TanStack server functions, plus authenticated identity inspection at `GET /api/v1/me`.
- D1 atomic aggregate/reference/audit/idempotency writes. Stale revisions abort the whole batch. Concurrent identical creates resolve to one Operation.
- Durable Workflow dispatch, private R2 artifact storage, cancellation, late-result suppression, and scheduled recovery of interrupted executions.
- Private Container RPC, pinned offline Tectonic compilation, Classic/Minimal/Technical proof composition, PDF.js preview/extraction, and Mammoth extraction.
- Paper logo, fonts, palette, responsive shell, sign-in/recovery, runtime inspector, agent access, account/session, appearance, and activity views.
- Immutable source originals, recoverable uploads, bounded Workflow extraction, versioned parser outputs, protected original downloads, source inspection/history, and scoped REST source endpoints. See `source-intake.md`.
- Manual Claims with exact citations, pinned contexts, immutable material revisions, review rationale, metadata, archive/restore, reviewed merges, bounded duplicate suggestions, FTS5 search, and REST/MCP access. See `evidence.md`.
- Manual Job Targets, immutable posting snapshots, versioned requirements, exact posting passages, persistent evidence associations, historical inspection, and scoped job REST/MCP services. See `jobs.md`.
- Seven reusable wording types and immutable Content/Block/Section revisions, typed ordered bindings, exact evidence links, library browsing/editing, and history. See `library.md`.
- Individual session revocation and current-session identification.
- Named Agent Credentials with nine scopes, expiry, hash-only storage, revision-checked revocation, permanent idempotency, and activity. Default Owner application services reject agent credentials.

The local browser completed sign-in, verification, compile, PDF/text/report inspection, cancellation and subsequent compile, settings navigation, credential creation and revocation, and mobile layout checks. After the final document-service refresh, another authenticated compile succeeded with text integrity passing (approximately 1.15 seconds for document processing). The local test credential is revoked. The approval system initially rejected the combined credential cleanup step; read-only inspection confirmed the fixture existed, then closing its dialog and revoking it individually succeeded. No approval remains pending for that cleanup.

## Staging

Personal Cloudflare resources exist: `river-staging` Worker and D1, `river-staging-artifacts` private R2, `river-staging-documents` Workflow, and `river-documents-staging` private Worker/Container. Sender `hello@river.jilva.dev` has signing, return-path SPF, and DMARC records.

The sole Owner is created and verified. Two authenticated hosted Classic compilations passed text integrity, PDF.js rendering, and protected artifact delivery. The real PDF URL returns 401 without authentication. First/subsequent end-to-end durations were 13.495 and 18.553 seconds; document processing took 3.773 and 8.812 seconds. No warm-start performance improvement is established. Exact identities are in `deployment.json`.

The source migration and source UI/services are deployed to staging. Hosted source intake passed: a clearly labeled synthetic fixture was uploaded, extracted with repeated text and Unicode, inspected, and downloaded. Both the source listing and concrete original return 401 without authentication. The local browser created a synthetic source containing repeated text and Unicode, reprocessed it, and inspected its preserved first extraction. Local synthetic fixtures are explicitly labeled and are not Owner evidence.

GitHub OAuth and OpenAI credentials are not configured. Their controls are hidden or absent. Hosted password-reset completion and deliberately interrupted hosted-request recovery remain unverified.

## Next acceptance work

1. M2 evidence is deployed. Nineteen service tests, all workspace type checks/lint, and the staging build pass. Local browser checks cover exact citations, review/material invalidation, metadata, context recovery, concurrent tabs, history, merge, and restoration. The hosted Owner saved and reviewed a cited synthetic claim, then archived it outside default search. Evidence API and MCP deny anonymous requests. Hosted MCP with a real credential remains untested; no additional Owner credential was created.
2. Manual M3 jobs are deployed. Twenty-five Workers tests, all workspace type checks, focused lint, and the staging build pass. Local browser checks cover repeated posting passages, exact selections, concurrent-tab comparison/reload, new snapshots, and preserved old work. Hosted checks cover creation, manual requirements, persistent selections, citation/decision inspection, archival, and narrow light/dark views. The synthetic hosted job is archived. The remaining M3 review workflow is deployed: complete-map proposals, bounded ranking, exact-input guards, persistent decisions, and explicit post-review selection. Forty-seven Workers tests and local synthetic browser journeys pass; live OpenAI generation remains unverified without a key. See `job-analysis.md`.
3. M4 library and structured editing are deployed. Thirty-four Workers tests, workspace type checks/lint, and the staging build passed. Local checks cover nested creation, independent copying, local wording, conflict comparison and branch preservation, explicit Content promotion/binding, undo/redo, and real PDF previews. Hosted checks cover nested header creation, autosave, authenticated PDF generation, and narrow saved review. See `composition.md`. M5 typed fixed packs, PDF page/zoom controls, exact checkpoints, evidence acknowledgments, retained exports, and basic history are deployed and hosted-tested. Thirty-nine Workers tests pass. The document fixtures cover all seven types in all three packs. See `checkpoints.md`. M3, Phase 2, and Phase 3 designs are complete in Paper. Phase 2 wording review is now deployed: exact target/support guards, one-placement acceptance, persistent review, bounded retries/cancellation, and payload removal. Synthetic browser checks preserve a concurrent name edit and advance the real PDF preview. Six wording tests pass; together with the existing service files and corrected backup migration-list check, 57 service tests pass. See `wording.md`. Source proposals and clarification tracking are now deployed through migration 0012. The complete 64-test service suite passes; local browser review proves individual acceptance/rejection, independent manual origin, source-backed answers, and stale-source blocking. See `source-proposals.md`. Bounded duplicate comparison and its Paper-designed review/history flow are deployed through migration 0013. All 70 Workers tests pass; synthetic browser review proves independent acknowledgment, explicit disposition attribution, retained history through both claims, and stale rejection. See `duplicate-comparison.md`.
4. Complete hosted password recovery, GitHub OAuth setup, operational diagnostics, upload cleanup, and deployment recovery gates before release. Supply model profiles and credentials before enabling AI execution.
5. Continue the remaining V1 milestones in PLAN.md. No MVP release is claimed.

## Not implemented

Live AI provider acceptance, activation and live verification of daily backups, conversational template iteration, final-document source refinement, general resume history/branching, and ATS integration remain incomplete. Daily backup dispatch, bounded export/streaming, private manifests, and status/receipt commands are implemented and deployed. The dedicated D1 export token is still absent, so automatic runs remain disabled. The complete 83-test Workers suite passes. Isolated restore drills passed for both compressed and streamed formats; the latter recreated 42 base tables and checked 14 retained objects. See `recovery.md`. The real Owner tailoring session and remaining release checks are still open.

The current synthetic proof document and acceptance fixtures are not candidate evidence. Fixed packs now have typed document, section, and block manifests. Manual template lifecycle, full-graph validation, explicit mixing, and exact custom résumé bindings are deployed through migration 0015. Local synthetic browser journeys include repeated Container fixtures, approval, concurrent recovery, new bindings, retirement, and retained checkpoint export. See `template-studio.md`. Template proposal generation, preview recovery and exact review are deployed through migration 0016; the complete service suite passes 83 tests. Conversational iteration and live provider validation remain in progress. See `template-generation.md`. No later-phase controls are exposed as if those workflows existed. The ATS Screener repository has not been changed.
