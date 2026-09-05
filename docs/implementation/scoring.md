# ATS scoring implementation

Phase 3 is in progress. River's scoring domain and bounded HTTP adapter are implemented locally. Durable scoring persistence and its bounded Workflow are also implemented locally. Authenticated application services, atomic Save & score, exact finding decisions and the Paper-based scoring interface are implemented locally. Provider configuration and hosted verification remain open. New submissions stay unavailable without a configured provider. The design contract is `history-scoring-design.md`.

## River adapter foundation

`packages/domain/src/scoring.ts` validates exactly six unique simulations, all five dimensions, bounded scores, boolean filter outcomes, complete suggestion structures and consistent bullet counts. It rejects provider/identity mismatches and contradictory input coverage. Missing legacy metadata remains absent; valid historical results can still be inspected. Preflight counts the exact UTF-16 strings and never trims or truncates submitted content.

Comparison policy `river-reported-scoring-identity-v1` requires the same provider origin, adapter, immutable job snapshot, complete returned input coverage and exactly equal reported scoring identities, including rubric, build, model and request configuration. Missing provider-reported model identity suppresses deltas. This policy compares reported identities; it does not certify immutable weights behind a provider alias. Raw scores and provider pass outcomes remain distinct, with no cross-platform average.

`apps/web/src/server/scoring-provider.ts` captures `/api/version` capabilities before any résumé submission. New submissions require the supported effective-limit metadata. It sends exact saved strings to `/api/analyze`, does not follow redirects or attach browser credentials, and limits the actual response stream to 256 KiB. Capability responses are limited to 16 KiB. Requests have 10-second discovery and 65-second scoring deadlines. The adapter performs no automatic retries. Rate limits retain a parsed retry time; cancellation, outages, incompatible capabilities and malformed output have safe typed failures without provider body contents.

`ATS_SCREENER_ORIGIN` is an optional validated HTTPS origin. It is not configured or enabled yet. Result identity always comes from the scoring response; the separate version observation never supplies or replaces it. Full raw JSON is retained in D1 alongside validated fields.

Verification: four domain tests, five Workers adapter tests, workspace type checks and lint pass. The adapter tests use synthetic mocked responses only. Persistent operations and captured artifact/text/job fingerprints are now implemented below; finding decisions are implemented below; hosted tests remain open.

## Durable runs and recovery — 2026-09-05

Migration `0023_scoring_runs.sql` adds Owner-scoped runs and chronological attempts. Start and retry commands commit the Operation, dispatch, audit and permanent receipt together. A stale checkpoint revision prevents every dependent write. Two scoring runs may be active per Owner; each run permits three attempts. External Agent Credentials cannot start, inspect or retry these runs.

Each run pins its checkpoint, immutable posting snapshot, document Operation and server-selected adapter profile. The background Workflow waits up to two minutes for that compilation. Preparation requires a successful retained artifact set with passing validation and matching renderer/template identities. Actual text and report bytes are checked against available manifest/R2 digests and the complete passing validation report. Legacy manifests without per-file hashes can be read without rewriting history; scoring captures their actual text and report SHA-256 digests. Preparation saves the exact résumé and job strings, source keys, digests, document fingerprint and submission fingerprint in D1. Input never gets trimmed or shortened. Effective limits remain 6,000/4,000 UTF-16 code units.

The HTTP adapter observes provider capabilities before submission and retains that observation separately from the actual result identity. Each attempt reserves its submission once; an uncertain network outcome requires an explicit new attempt instead of silent resubmission. Requests have bounded deadlines, redirects are refused, response streams are bounded, and rate limits retain Retry-After. Only a complete validated six-platform result is retained. Missing or incompatible identities suppress comparisons; they do not invent a zero score.

The provider response is retained before completion. Interrupted finalization can reuse that response without another provider request. Publication updates run completion, Operation state and audit atomically. Cancelled, superseded and completed attempts reject late writes. Workflow history contains stage names and completion only; exact private input and raw results remain in D1. Scheduled reconciliation records interrupted scoring attempts without changing checkpoint review or export state.

The domain comparison policy requires the same immutable job snapshot, adapter endpoint/version, complete coverage and identical reported scoring identities. It does not certify immutable model weights behind a provider alias. There is no average across platforms.

### Persistence verification

Seven focused Workers persistence/runtime tests cover Owner restrictions, stale-revision rollback, identical concurrent commands, capacity races, exact text and artifact checks, saved-result recovery, cancellation, Retry-After, bounded retries and uncertain submission outcomes. Five HTTP adapter tests cover exact request bodies, complete validation, redirects, limits and cancellation. Four domain tests cover scoring input and identity compatibility. The complete Workers suite passes 115 tests across 21 files; workspace type checks, lint and the staging bundle build also pass. No live scoring provider request was made.

## Atomic capture and Paper review — 2026-09-05

Save & score uses the same checkpoint-capture transaction to commit the exact acknowledged draft, its review report, document Operation, scoring run, both dispatches, audit and permanent receipt. Stale draft revisions prevent every dependent write. A successful replay still resolves the original checkpoint when scoring configuration is later unavailable. Browser navigation opens that checkpoint's scoring inspector while both background stages can continue without the browser.

Migration `0024_scoring_finding_decisions.sql` stores explicit Addressed, Accepted and Not applicable decisions with Owner/time, rationale, expected revision and exact run/result/suggestion identity. A suggestion digest includes the run ID, so even byte-identical provider results do not share decisions. Concurrent reviews use one atomic revision guard; audit history preserves earlier decisions. Changing wording does not modify a finding or a prior provider result.

Paper boards 73–75 supply checkpoint preflight, six-platform results, five-dimensional details, full provider suggestions, identity inspection, retry/cancellation and finding review. Comparison selectors pin completed results from checkpoints on the selected draft, paginate older checkpoints/runs and suppress incompatible deltas. General branch navigation will extend checkpoint selection later. Complete raw response JSON crosses server functions as serialized text alongside typed validated fields. Large raw responses are excluded from history lists.

The local browser reviewed the unavailable-provider and empty-history state in light and dark appearance, exact historical résumé/posting text, visible focus and preserved export access. The synthetic historical checkpoint reports 147/6,000 résumé and 80/4,000 job UTF-16 units after legacy report verification. No new provider call or Owner finding attestation was made. Success/failed-run/finding-review browser journeys and narrow viewport verification remain open.

Ten scoring persistence/runtime tests now cover the above, including capture/replay, concurrent decisions and legacy artifact compatibility. The focused scoring/checkpoint set passes 15 tests. The complete Workers suite passes 118 tests across 21 files, and workspace types/lint plus the staging bundle build pass. Canonical synthetic ATS fixture qualification is still required before any ATS Screener tested designation. No scoring code has been deployed to staging; local migrations are through 0024, staging remains through 0018.

## Provider identity milestone — 2026-09-05

The authorized narrow change is committed in `/Users/joshuasilva/Dev/ats-screener` as `fdd17c3` (`feat: attach scoring identity and effective input coverage to API results`). The API's existing rubric, platform thresholds, provider order, request limits and prompt text behavior are preserved.

Successful `/api/analyze` responses add `_scoringIdentity` with schema version `ats-scoring-identity-v1`, mode, rubric version/digest, deployment build UUID/version/full commit when configured/environment, capability version, winning provider/vendor, requested and provider-reported model names, optional backend fingerprint, and request-configuration digest. Missing response metadata is `null`. Model-generated fields cannot override server-created metadata. A provider-reported alias is not a guarantee of immutable model weights; comparison policy must account for missing or insufficient identity.

The cache namespace includes the complete effective prompt, rubric, deployment, capabilities and configured provider request identities. Cached results retain the original winning identity. `_inputCoverage` is calculated for each request and records submitted/analyzed UTF-16 lengths and a complete flag, even when oversized requests share the same cached prompt. `/api/version` retains its existing fields and adds deployment and scoring capabilities; it must not replace result provenance.

The effective full-score limits remain 6,000 résumé and 4,000 job-description UTF-16 code units. The prompt and capability metadata now share those constants. The endpoint still accepts 50,000/20,000 and slices the prompt. River must block oversized full-input scoring, including required template fixtures, rather than send excerpts. It must validate exactly Workday, Taleo, iCIMS, Greenhouse, Lever and SuccessFactors with all five dimensions and preserve raw findings separately from Owner decisions.

Verification passed: 57 focused API/provider/cache tests, Svelte and TypeScript checks with zero errors/warnings, lint on all changed source files, and the complete application/documentation build. Tests cover actual fallback metadata, server identity overriding generated JSON, cache invalidation, preserved cached identity, per-request coverage and missing model metadata. No new hosted scoring request has been made.

## Deployment approval pending

The existing personal-account Worker is `ats-screener`, with `ats.jilva.dev` attached. Its current version remains `b6253198-0716-4cdf-81c2-9a0bb7d4fde1`. The account is `a91c30d69981b341efe3b656a263f6da`; ACM UTSA was not accessed. A read-only secret listing confirms a Gemini binding; no values were read or changed.

Automatic approval review rejected deployment because the ATS checkout also contains four pre-existing, uncommitted Cloudflare migration files: `package.json`, `pnpm-lock.yaml`, `svelte.config.js` and `wrangler.jsonc`. They replace the Vercel adapter with the Cloudflare adapter and add Wrangler/deployment scripts. Read-only inspection found their compatibility date, flags, assets and production variable consistent with the running Worker, but it does not establish byte-for-byte build equivalence. Those files remain unchanged and uncommitted. Explicit user approval to deploy the tested build with that existing setup is pending. Do not bypass the rejected deployment through another tool or artifact path.

The latest build is available locally. After approval, deploy with the explicit personal account and preserve existing variables, inspect `/api/version`, then run one synthetic full-score request and its cache retry. Record real returned model/identity/coverage before connecting hosted River scoring. No source-refinement attestation is authorized by this separate deployment approval.
