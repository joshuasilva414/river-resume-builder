# Canonical template ATS qualification

Canonical qualification, durable fixture runs, Owner application services, a bounded Workflow, protected artifact inspection and Paper’s review interface are deployed to personal staging on 2026-09-05. The Paper contract is board 75 in `history-scoring-design.md`. All three fixed packs have hosted qualification history. After the Oracle Taleo alias correction, Minimal’s final bounded retry completed all three six-platform responses. Its failing simulations correctly withhold the designation. No live template has an `ATS Screener tested` designation from this work. See the latest result below.

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

The Owner subsequently approved ATS deployment. The live identity endpoint, River checkpoint scoring and cached identity preservation now pass; staging scoring is enabled. No template qualification or production designation is claimed.

## First hosted qualification and failure classification

Classic run `01a073fd-5509-7616-a7ac-563f1046094e` rendered and retained all three canonical documents. Attempt one retained a complete `experienced-platform` response with at least one failing simulation. The provider returned invalid responses for `graduate-web` and `unicode-application`; their raw bodies were rejected, and the qualification report correctly withheld the designation. Successful artifacts and the complete response remain available for bounded retries.

Cloudflare's Workflow boundary converted the adapter's typed `ScoringProviderError` exceptions into plain errors. The outer handler consequently recorded these two failures as `Interrupted`, losing the specific `InvalidResponse` classification. External render/submission callbacks now return a serialized safe failure inside the step boundary. Both checkpoint and template scoring preserve the code and retry time without retaining private exception text. Persistence and publication steps retain their existing retry behavior. This corrects failure reporting; it does not make invalid provider output acceptable.

The focused 28 scoring tests and all 153 Workers tests pass, as do workspace types/lint and the clean staging build. The added test checks JSON round-trip preservation of rate-limit identity and retry timing, successful completion, and sanitization of unknown failures. Logs: `/tmp/river-workflow-failures-{tests,full,types,lint,build}.log`.


## Hosted results for all fixed packs

All nine canonical documents rendered successfully and remain retained with their LaTeX, complete extracted text and validation reports. Every fixed pack was inspected through its populated canonical-fixture review. No designation was awarded.

| Pack | Run | Attempts | Complete valid provider results | Latest report SHA-256 |
| --- | --- | ---: | ---: | --- |
| Classic | `01a073fd-5509-7616-a7ac-563f1046094e` | 2 of 3 | 1 of 3 | `455cf5ec72b49334fa78e9cd6120e3e6bd9b526f213497b869b750b5572305d9` |
| Minimal | `01a07420-24a3-77f3-8f7e-27c01fb6040f` | 1 of 3 | 0 of 3 | `e835a7ca35935c65653511f000ddf7cc73a9447877cd701cc750aedf4c6ab05a` |
| Technical | `01a07423-7ac2-7097-b939-5dd14903407d` | 1 of 3 | 0 of 3 | `f109d62a4fb1c8a8fb7b437bcf8919f9665dcc4a9ee0dfba1f9e08a945d707de` |

The eight missing results failed strict validation with `InvalidResponse`. Their rejected raw bodies were not retained, so the precise provider-schema defect remains undiagnosed. The Workflow failure correction now preserves this classification. The Classic retry reused its successful fixture documents and complete `experienced-platform` response without resubmission; its response digest remained `b940629d344453d2a36772d836df5473a82d5221832445b24604abaccc77cab1`.

That one valid response reports Workday 79, Taleo 68, iCIMS 84, Greenhouse 82, Lever 80 and SuccessFactors 83. Taleo reports a failed filter. These are provider simulations, not measured behavior of those vendors' systems. The qualification gate correctly rejects both this failed simulation and incomplete fixture coverage.

Latest Operations: Classic `01a0740c-0005-7d83-9253-40e99146d94c`, Minimal `01a07420-24a3-7526-93ca-c269a7cee2f4`, Technical `01a07423-7ac2-74e1-b960-a7c6a954a701`. All finished Failed with retained reports. This verifies live failure handling, populated review and partial-result preservation on retry. Successful scoring retry, passing canonical qualification and phone inspection of populated qualification remain open. Export remains available throughout.

## Response diagnosis and completed phone review — 2026-09-05

Classic's third and final attempt used Operation `01a0744e-3a4f-74da-aca0-9d761d380e6e`. Graduate-web failed Unavailable and unicode-application failed InvalidResponse. The prior experienced-platform result remained unchanged, and the qualification report retained the same `455cf5ec72b49334fa78e9cd6120e3e6bd9b526f213497b869b750b5572305d9` digest. The original budget is exhausted; no attempts were reset.

After safe diagnostics deployed, Minimal's second attempt (`01a07457-fb5b-74a1-9c11-88e602ecaa5c`) failed schema validation at `results.1.system` for every fixture. An isolated Cloudflare preview of the exact fictional graduate input confirmed the returned `Oracle Taleo` alias in results and suggestions. Direct Node requests returned canonical `Taleo`; they did not reproduce that hosted response. The exact-alias correction, privacy boundary, tests and deployment are recorded in `scoring.md`. Earlier rejected bodies were not retained, so this does not retroactively prove the cause of every historical failure.

Populated Classic review at 390 × 844 passes in light/dark themes: actual retained PDF, complete text, all six simulation outcomes, expanded dimensional findings, pinned earlier attempts and the exhausted-retry state. No horizontal overflow or application console error was observed; the temporary viewport override was reset. See `mobile-review.md`. No template qualifies solely by completing a run: every required simulation must pass before a badge can be awarded.

## Successful bounded retry after the alias correction

Minimal run `01a07420-24a3-77f3-8f7e-27c01fb6040f` completed its third attempt through Operation `01a0745f-780a-718d-a492-605eccb18cd4`. All three fixture responses are valid and retained, with report SHA-256 `4c2c32facb1b8ed95a706b953da7ec5eb9f4781d8826b7955a14703f9f8b31aa`. The two earlier failed reports remain immutable. The UI displays Succeeded for execution and Designation withheld for qualification.

| Fixture | Workday | Taleo | iCIMS | Greenhouse | Lever | SuccessFactors | Raw response SHA-256 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| graduate-web | 72 | 58 | 78 | 82 | 75 | 80 | `25eff91558d03628a9c7f006f7548f2a3b4686a6fdaff8c1c662d7a747343362` |
| experienced-platform | 79 | 64 | 82 | 86 | 75 | 80 | `ceddf89982e6cc287c5613815dcf6a415018cb05c56b178a366655f0d7d05817` |
| unicode-application | 72 | 58 | 82 | 80 | 77 | 78 | `0e4af7acd1b70a105d908658b5e9f9e4bae370d10462f8aaa754a0c8089fae3e` |

Taleo reports a failed filter in every fixture; the other simulations report passing filters. These are raw provider simulations, not verified vendor behavior. No scores were adjusted and no fixtures were changed to earn a badge. All responses report uncached results and deployment identity `4035124d-7dab-48bb-ab4e-831cfc46d442`. The complete retained raw experienced-platform and Unicode responses contain `Oracle Taleo`; River’s normalized view uses `Taleo`.

This proves successful live bounded retry, complete canonical result retention and correct withholding on real failed simulations. Classic remains exhausted at three attempts and Technical retains its earlier failed attempt; their budgets and history were not reset.
