# Canonical template ATS qualification

Canonical qualification, durable fixture runs, Owner application services, a bounded Workflow, protected artifact inspection and Paper’s review interface are deployed to personal staging on 2026-09-05. The Paper contract is board 75 in `history-scoring-design.md`. Live provider qualification remains unverified; no live template has an `ATS Screener tested` designation from this work.

## Exact synthetic inputs

`packages/templates/src/ats-fixtures.ts` defines the separate scoring set `river-ats-fixtures-v1`. Its digest is `40f60e80ba854e4686ec6a4b307cdc8984df2731976d203d3c0551d4f2e1f9ba`. Capture retains every complete resolved document and fictional job description, plus their individual digests. A contract test pins the set version and complete digest. Input changes require a reviewed new version and qualification.

| Required fixture | Coverage | Extracted résumé units | Job units | Rendered pages |
| --- | --- | --- | --- | --- |
| `graduate-web` | All seven types, internship and project | 1,772 | 598 | 1 |
| `experienced-platform` | Multiple roles and longer page flow | 3,123–3,124 | 678 | 2 |
| `unicode-application` | Accents, C#, C++, currency and escaped characters | 1,555 | 571 | 1 |

These names, employers, qualifications and achievements are fictional test data. The fixture module never queries Owner evidence, sources, profiles, jobs or resumes. Normal rendering fixtures and negative validation cases remain separate; their successes do not grant this designation.

## Qualification rule

`qualifyAtsTemplate` evaluates completed evidence for one exact graph under `river-template-ats-qualification-v1`. It requires exactly one selected completed run for every required fixture, unique run identities, the current canonical-set digest, exact document/job inputs, the pinned graph and renderer, complete local validation, report-byte integrity and compatible resource identities. Input preflight uses actual extracted strings. It never submits an excerpt to fit the adapter limits.

Every provider response is schema-validated for all six unique simulations. Each must report `passesFilter: true`. Missing coverage or reported model identity, differing endpoints/adapters, and incompatible rubric/model/deployment/request identities withhold qualification. Canonical fixtures intentionally use different jobs; their exact job text is validated independently. This is separate from checkpoint score comparison, which requires the same posting snapshot.

Full validated findings and per-fixture failures remain inspectable. The rule retains the digest of the exact raw response string and never calculates a cross-platform average. The runtime verifies all four retained artifact files and their hashes before provider submission and final qualification. A designation comes only from a complete committed report for its captured exact graph. The report, report digest, selected result identities and completion date remain accessible in history.

## Verification and remaining delivery

All 32 template tests pass, including four qualification cases for complete sets, substituted/missing/duplicate evidence, graph/resource/identity changes, malformed/failed simulations, incomplete reports and oversized text. The 21 focused Workers template/scoring tests pass. Workspace types/lint and the staging build pass.

The offline Container suite rendered all nine fixture/pack combinations with complete text integrity. The longer fixture spans two pages in Classic, Minimal and Technical. All actual strings fit the 6,000/4,000 UTF-16 scoring limits. Existing fixed/custom packs, source refinement, repeatability, extraction, prohibited constructs and resource limits also passed. Peak memory was 412,729,344 bytes. This is rendering proof, not a live scoring result.

The fixture generator is now a checked TypeScript entry point instead of inline build-script source. Runtime artifacts remain private ignored test outputs. Logs: `/tmp/river-ats-qualification-tests.log`, `/tmp/river-ats-qualification-workers.log`, `/tmp/river-ats-qualification-types.log`, `/tmp/river-ats-qualification-lint.log`, `/tmp/river-ats-qualification-build.log`, `/tmp/river-ats-canonical-documents.log`.

## Durable execution and review

Migration `0026_template_scoring.sql` adds independent qualification runs, root attempts, fixture records and fixture attempts. It does not create synthetic Owner jobs, resumes or checkpoints. Starting a run captures the complete graph, graph digest, canonical fixture set and exact adapter profile in the same transaction as its Operation, dispatch, audit entry and permanent idempotency receipt. Custom templates require the exact current Validated or Approved review revision. Fixed packs use their pinned complete graphs.

At most one template qualification is active per Owner. It occupies one of the two shared checkpoint/template scoring slots. Each run has at most three Owner-requested attempts. Each required fixture renders at most once and submits at most once in each attempt, sequentially. A render step is bounded to two minutes; submission to 90 seconds, including the adapter’s 10-second discovery and 65-second request limits. Workflow retries only storage/finalization steps. Unknown submission outcomes require an explicit new attempt.

Fixture documents are immutable four-file R2 sets under `retained/template-scoring/`. D1 retains the exact verified text/report and complete serialized provider response. Successful fixtures and retained responses survive retries. A response captured before an interrupted finalization is published without a new provider request. Cancellation and replacement operations reject late writes. Provider retry times and the three-attempt limit are enforced inside the guarded command transaction.

Every finished attempt retains its own immutable qualification report, including missing/failing fixtures. Complete provider results can finish successfully while withholding the designation. Operational failures remain retryable within the original budget. Retried fixtures may report different identities; the gate withholds a designation for incompatible sets rather than combining them. New qualification runs remain an explicit action.

The existing fixed-pack inspector and exact saved-template page link to the Paper-designed review. It shows each canonical input, all six independent results and dimensional findings, exact text, actual PDFs, downloadable artifacts, complete raw responses, report identities and attempt history. Selecting a past attempt stays pinned during polling. Current list badges require the current fixture set and policy; older passing reports are labeled historical qualifications. Local validation and export remain available during scoring outages. External agents have no template scoring commands; artifact downloads require an Owner session.

Restore discovery now includes the four hashed files of every retained scoring fixture. No scoring-provider configuration is changed by this milestone.

## Current verification

All **132 Workers tests in 24 files pass**, including nine new template scoring cases: atomic capture/idempotency, Owner and revision restrictions, retained artifact proof, full qualification, partial-result recovery, once-only submission, cancellation/budget enforcement, corruption and artifact loss, shared capacity/rate limits, withheld failing or unidentified results, and finalization recovery without resubmission. Test scores are explicitly synthetic and are isolated from the application database.

All six workspace type and lint checks pass. The staging build passes. Migration 0026 is applied locally and to personal staging. Browser inspection covers the fixed Classic inspector’s unavailable/empty state in both light and dark themes at desktop size. Real-provider success, populated review browser journeys, mobile review and hosted qualification remain open. Logs: `/tmp/river-template-score-all-workers.log`, `/tmp/river-template-score-types.log`, `/tmp/river-template-score-lint.log`, `/tmp/river-template-score-build.log`, `/tmp/river-template-score-migrate.log`.

## Staging delivery

Commit `570278e` is deployed as web version `5239f176-6901-48b4-997e-ca4d62a0fb23`, including `river-staging-template-scoring` (11 Workflows total). Startup measured 62 ms. The document Worker remains `6459e815-8f14-4772-827d-5aff881a30ca`; its existing validate-template contract supports the canonical documents sent by the web Workflow.

Before migration, a private 67-table backup was retained and locally validated. After deployment, a 71-table snapshot was retained and restored into a fresh unpublished local SQLite database. FTS equality, foreign keys, one exact citation, all 50 retained objects and one exported checkpoint passed. The new scoring tables are empty on staging, so this drill does not establish recovery of a populated live qualification. Exact keys and digests are in `deployment.json`. Hosted authenticated Classic inspection resolves the current fixture set and its empty history. No qualification badge or submission control appears while the provider is unconfigured. The new artifact route returns 401 anonymously. Installed secret names were verified without reading values. Deployment and recovery logs: `/tmp/river-template-score-staging-deploy.log`, `/tmp/river-template-score-staging-migrate.log`, `/tmp/river-template-score-predeploy-backup.log`, `/tmp/river-template-score-postdeploy-backup.log`, `/tmp/river-template-score-restore.log`.

The Owner subsequently approved ATS deployment. The live identity endpoint, River checkpoint scoring and cached identity preservation now pass; staging scoring is enabled. Next: complete actual canonical fixture qualification and its populated browser review. No template qualification or production designation is claimed.
