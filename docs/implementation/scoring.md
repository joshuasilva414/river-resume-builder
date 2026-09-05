# ATS scoring implementation

Phase 3 is in progress. Scoring persistence, bounded Workflows, atomic Save & score, finding decisions, comparisons and the Paper-based interface are deployed to staging. The approved ATS identity deployment and synthetic provider acceptance passed. The River staging adapter correction and provider configuration are ready for deployment; hosted River scoring remains to be verified. The design contract is `history-scoring-design.md`.

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

Paper boards 73–75 supply checkpoint preflight, six-platform results, five-dimensional details, full provider suggestions, identity inspection, retry/cancellation and finding review. Comparison selectors pin completed results from checkpoints on the selected draft, paginate older checkpoints/runs and suppress incompatible deltas. General history comparison adds independent completed-run selectors across exact chosen branches and checkpoints. Complete raw response JSON crosses server functions as serialized text alongside typed validated fields. Large raw responses are excluded from history lists.

The local browser reviewed the unavailable-provider and empty-history state in light and dark appearance, exact historical résumé/posting text, visible focus and preserved export access. The synthetic historical checkpoint reports 147/6,000 résumé and 80/4,000 job UTF-16 units after legacy report verification. No new provider call or Owner finding attestation was made. Success/failed-run/finding-review browser journeys and narrow viewport verification remain open.

Ten scoring persistence/runtime tests now cover the above, including capture/replay, concurrent decisions and legacy artifact compatibility. The focused scoring/checkpoint set passes 15 tests. The complete Workers suite passes 118 tests across 21 files, and workspace types/lint plus the staging bundle build pass. Canonical synthetic ATS fixture qualification is still required before any ATS Screener tested designation. Scoring code is deployed to staging; migrations are through 0025. The provider origin remains unset, so no new scoring request is enabled.

## Provider identity milestone — 2026-09-05

The authorized narrow change is committed in `/Users/joshuasilva/Dev/ats-screener` as `fdd17c3` (`feat: attach scoring identity and effective input coverage to API results`). The API's existing rubric, platform thresholds, provider order, request limits and prompt text behavior are preserved.

Successful `/api/analyze` responses add `_scoringIdentity` with schema version `ats-scoring-identity-v1`, mode, rubric version/digest, deployment build UUID/version/full commit when configured/environment, capability version, winning provider/vendor, requested and provider-reported model names, optional backend fingerprint, and request-configuration digest. Missing response metadata is `null`. Model-generated fields cannot override server-created metadata. A provider-reported alias is not a guarantee of immutable model weights; comparison policy must account for missing or insufficient identity.

The cache namespace includes the complete effective prompt, rubric, deployment, capabilities and configured provider request identities. Cached results retain the original winning identity. `_inputCoverage` is calculated for each request and records submitted/analyzed UTF-16 lengths and a complete flag, even when oversized requests share the same cached prompt. `/api/version` retains its existing fields and adds deployment and scoring capabilities; it must not replace result provenance.

The effective full-score limits remain 6,000 résumé and 4,000 job-description UTF-16 code units. The prompt and capability metadata now share those constants. The endpoint still accepts 50,000/20,000 and slices the prompt. River must block oversized full-input scoring, including required template fixtures, rather than send excerpts. It must validate exactly Workday, Taleo, iCIMS, Greenhouse, Lever and SuccessFactors with all five dimensions and preserve raw findings separately from Owner decisions.

Verification passed: 57 focused API/provider/cache tests, Svelte and TypeScript checks with zero errors/warnings, lint on all changed source files, and the complete application/documentation build. Tests cover actual fallback metadata, server identity overriding generated JSON, cache invalidation, preserved cached identity, per-request coverage and missing model metadata. No new hosted scoring request has been made.

## Approved provider deployment — 2026-09-05

The Owner explicitly approved deployment with the four existing Cloudflare setup files (`package.json`, `pnpm-lock.yaml`, `svelte.config.js`, `wrangler.jsonc`). Those files remain unchanged and uncommitted in the ATS checkout. The full application/documentation build and 57 focused identity/provider/cache tests passed again. Deployment preserved the existing Worker variables and secrets on personal account `a91c30d69981b341efe3b656a263f6da`; ACM UTSA was not accessed.

Worker `ats-screener` now runs version `a92d53b4-3159-4757-b2a3-0a85dfceb847` at `https://ats.jilva.dev`. Its scoring deployment identity has build ID `4035124d-7dab-48bb-ab4e-831cfc46d442`, version `0.5.1`, environment `production`, and commit `null` because no source commit variable is configured. The build UUID identifies this deployment; the dirty setup is not claimed to equal a committed tree.

Two real fictional full-score requests returned HTTP 200, six simulations, complete 538/240 UTF-16 input coverage and identical scoring identities. The winning provider and reported model are `gemini-3.5-flash-lite` (Google). Both reported `_cached: false`; hosted cache reuse is not established. Local cache tests pass. Private responses are retained under `test-results/ats-approved/`.

The first live response named one simulation `SAP SuccessFactors`, while the advertised capability and River use `SuccessFactors`. River's adapter now canonicalizes this exact alias in system names and suggestion references before strict domain validation. Unknown names, duplicate simulations and duplicate suggestion references still fail. Full raw JSON and returned scoring identity remain unchanged. The captured fictional input/version/response is a committed contract fixture. Seven focused Workers adapter tests, all 151 Workers tests across 26 files, workspace types/lint and the clean staging build pass. Staging deployment is next.

River staging configuration now names `https://ats.jilva.dev`; the provider is not enabled on the deployed River Worker until that tested build is deployed. Production configuration remains unset. This deployment approval does not authorize a source-refinement review attestation.

## Canonical qualification foundation

The separate `river-ats-fixtures-v1` set and strict all-fixture qualification rule are implemented locally. All three synthetic documents render with complete text integrity in all three fixed packs. All 32 template tests, 21 focused Workers tests, workspace types/lint, the staging build and offline Container fixtures pass. No real scoring request or badge is claimed. Durable qualification runs and Paper's fixture review remain to be implemented; see `template-scoring.md`.
