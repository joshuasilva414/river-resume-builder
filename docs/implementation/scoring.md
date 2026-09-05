# ATS scoring implementation

Phase 3 is in progress. River's scoring domain and bounded HTTP adapter are implemented locally. Persistence, Workflow, application services and the Paper interface remain in progress. No scoring controls are exposed. The design contract is `history-scoring-design.md`.

## River adapter foundation

`packages/domain/src/scoring.ts` validates exactly six unique simulations, all five dimensions, bounded scores, boolean filter outcomes, complete suggestion structures and consistent bullet counts. It rejects provider/identity mismatches and contradictory input coverage. Missing legacy metadata remains absent; valid historical results can still be inspected. Preflight counts the exact UTF-16 strings and never trims or truncates submitted content.

Comparison policy `river-reported-scoring-identity-v1` requires the same provider origin, adapter, immutable job snapshot, complete returned input coverage and exactly equal reported scoring identities, including rubric, build, model and request configuration. Missing provider-reported model identity suppresses deltas. This policy compares reported identities; it does not certify immutable weights behind a provider alias. Raw scores and provider pass outcomes remain distinct, with no cross-platform average.

`apps/web/src/server/scoring-provider.ts` captures `/api/version` capabilities before any résumé submission. New submissions require the supported effective-limit metadata. It sends exact saved strings to `/api/analyze`, does not follow redirects or attach browser credentials, and limits the actual response stream to 256 KiB. Capability responses are limited to 16 KiB. Requests have 10-second discovery and 65-second scoring deadlines. The adapter performs no automatic retries. Rate limits retain a parsed retry time; cancellation, outages, incompatible capabilities and malformed output have safe typed failures without provider body contents.

`ATS_SCREENER_ORIGIN` is an optional validated HTTPS origin. It is not configured or enabled yet. Result identity always comes from the scoring response; the separate version observation never supplies or replaces it. Full raw JSON remains available to the future persistence boundary alongside validated fields.

Verification: four domain tests, five Workers adapter tests, workspace type checks and lint pass. The adapter tests use synthetic mocked responses only. Persistent operations, captured artifact/text/job fingerprints, reviewable findings and hosted tests are still required.

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
