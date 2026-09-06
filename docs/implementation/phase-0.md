# Phase 0 runtime proof

Status: local integration and the authenticated hosted PDF exit criterion passed. Later authentication and recovery acceptance is complete; see `production.md` and `release-gates.md`. The measurements below retain their original scope.

## Compatibility decisions

The prescribed architecture remains intact. No selected component was replaced.

- Node 24.20.0 and pnpm 10.33.0.
- TanStack Start 1.168.49, Router 1.170.32, React 19.2.8, Vite 8.2.2, Cloudflare Vite plugin 1.54.4.
- Effect and `@effect/vitest` 4.0.0-rc.112, Drizzle 0.45.2, Better Auth 1.7.2.
- TypeScript 7.0.2, Biome 2.5.12, Turborepo 2.10.12, Vitest 4.1.11, Workers test pool 0.22.0, Wrangler 4.129.0, Containers SDK 0.3.7.
- All Workers use compatibility date `2026-08-22`, the date supported by the installed Workers test runtime. Vitest 5 was not selected because the current integration peer requirements use Vitest 4.
- Better Auth 1.7 requires the account `issuer` column and uniqueness over issuer/account identity. Migration 0001 supplies them.
- Owner auth mutations use the Better Auth REST handler, which directly propagates Set-Cookie. The TanStack cookie plugin is unnecessary for this path. Session reads remain request-scoped.
- Vite needs an explicit `~` alias for the development Worker; relying only on tsconfig paths did not work in the runtime proof.

`dependencies.json` contains resolved package versions; installed dependencies are authoritative in the workspace manifests and lockfile. Separate personal staging and production GitHub OAuth apps are registered and verified. Owner-approved OpenAI credentials and pinned task/model profiles are installed in both environments; subsequent live workflow proofs are recorded in their implementation documents.

## Document resources

| Resource | Exact identity |
| --- | --- |
| Base image | `node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e` |
| Target | `linux/amd64` |
| Tectonic | `0.17.0`, x86_64 unknown-linux-musl |
| Compiler archive SHA-256 | `8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7` |
| Tectonic v33 bundle | `6ffe055852f8faf66c0acbe1a7fb27f87b869a90bad1204f3bf4d9683f597c7c` |
| Fonts | `fonts-lmodern=2.005-1` |
| PDF extractor/viewer | `pdfjs-dist@6.3.289`, Apache-2.0 |
| DOCX extractor | `mammoth@1.12.2`, BSD-2-Clause |

The image warms the required TeX resources during build and verifies the upstream bundle identity. Runtime compilation has no Internet access and uses `--only-cached`, `--untrusted`, and deterministic mode. `/app/resources.json` records the cache digest. The artifact fingerprint includes resolved content/template identity, compiler/resources, parser identity, and PDF hash. Identical fixture runs produced identical fingerprints.

The tested local image was `sha256:f749bc4bd1e4417e1ca45e6dbfccf4fd2d4b10ffbb30b9455b67bbfe8291625b`, 970,678,403 bytes before registry compression. Its cache digest was `139173b8191124ffa7b084aa6183370a36bf5a22c8f004ad2333c40c7975761c`. Later builds record their own identities; this measurement is not a promise that different builds are byte-identical.

## Measurements

Docker Desktop on the development Mac, Linux/amd64 emulation, one CPU, 512 MiB cap, network disabled. These are local measurements, not Cloudflare latency claims.

| Pack/run | Full request including Docker exec | Compile + extraction |
| --- | ---: | ---: |
| Classic, first request | 3,361 ms | 1,206 ms |
| Classic, repeated request | 2,658 ms | 1,117 ms |
| Minimal | 2,590 ms | 1,099 ms |
| Technical | 2,579 ms | 1,062 ms |

Observed peak cgroup memory across the expanded fixture suite: 401,424,384 bytes (about 383 MiB). The full `pnpm test:documents` reproduction also passed, with a peak of 407,314,432 bytes (about 388 MiB), and removed its temporary Container. Idle usage after the suite was about 71 MiB. The TeX cache was about 42 MiB. Initial resource warmup took approximately 67–83 seconds in observed builds. Hosted first/subsequent latency samples are recorded below. Cloudflare memory usage remains unmeasured.

## Operational limits

| Boundary | Limit |
| --- | --- |
| Source bytes | 10 MiB |
| Extracted source text | 500,000 characters |
| Source PDF pages | 100 |
| Resolved résumé text | 100,000 characters |
| Rendered PDF | 20 MiB |
| Container request/response | 15 MiB / 30 MiB |
| Compiler time | 60 seconds |
| Child-process lifetime | 90 seconds; kill the entire process group |
| Node job heap | 256 MiB |
| HTTP headers/body arrival | 5 seconds / 10 seconds |
| Container concurrency | One job; busy returns 503 with Retry-After |
| Workflow compile step | 2 minutes, two retries, exponential delay starting at 5 seconds |
| Interrupted Running operation | Reconciled after 10 minutes; scheduled scan every 5 minutes |
| Staging Container | One `basic` instance; sleep after 2 minutes; no Internet |

The current 20 MiB PDF cap can exceed the 30 MiB JSON response cap when accompanying text/source is large. In that case the job is rejected; limits are independent, not an assurance every combination fits.

## Verified behavior

- D1 concurrent idempotent create, permanent fingerprint conflict, stale revision rollback, rollback after a later SQL failure, and cancellation/late-result races.
- Better Auth non-Owner denial, verification requirement, real session login, immediate logout revocation, and authenticated Effect command execution.
- Credential hash-only listing/audit, scopes, expiry, revocation, stale mutation refusal, and denial of Owner document commands.
- Three offline template pack compilations, PDF viewer rendering, exact required text/order, PDF page offsets, DOCX table order, repeated text, accented Unicode, escaped LaTeX syntax, multiple pages, unsupported-glyph validation failure, malformed PDF/DOCX/UTF-8/base64, and input/text limits.
- Local authenticated server function → Effect → D1 → Workflow → service binding → Container → R2 → protected PDF/text/LaTeX/report download.
- Browser checks for light/dark sign-in, local compile/inspection/recovery, settings, one-time credential display/revocation, and 390px mobile layouts.

PDF.js and Mammoth are accepted as initial adapters for these bounded, text-based fixtures. OCR and visual reading-order reconstruction are not implemented. Arbitrary real-world document fidelity still requires provenance inspection and fixture expansion; parser output never verifies a claim automatically.

## Recovery contracts

The Operation, dispatch record, command receipt, and audit row commit in one D1 batch. Dispatch uses idempotent Workflow `createBatch` with the Operation ID. An interrupted dispatch remains eligible for the scheduled scanner. Cancellation commits before Workflow termination and reopens its durable dispatch record. Conditional writes prevent a late result or dispatch acknowledgment from replacing cancellation.

Artifact object keys are immutable and include the Operation ID and artifact fingerprint. The compile step writes all four artifacts before publishing the D1 manifest. Retried writes use the same keys when bytes are identical. An interruption between R2 upload and D1 publication can leave an unreferenced object set; a complete orphan-retention/finalization process remains required before the MVP.

A Vite restart during the first local compile left the local Workflow stuck in its compile step. The Container was healthy and direct calls succeeded. Cancellation terminated that instance; a fresh instance completed in approximately one second of document processing. Avoid restarting the development Worker during a proof run. The scheduled reconciler now bounds the user-visible Running state.

## Reproduce and deploy

Run `pnpm test:documents` from the repository root. The command builds the image for Linux/amd64, executes the fixture suite without networking, records results, and removes its temporary Container.

For staging, all commands must use the personal account already specified in the Wrangler configurations:

```sh
pnpm --filter @river/web exec wrangler d1 migrations apply river-staging --env staging --remote
WRANGLER_DOCKER_BIN=/Applications/Docker.app/Contents/Resources/bin/docker pnpm --filter @river/documents exec wrangler deploy --env staging
CLOUDFLARE_ENV=staging pnpm --filter @river/web build
pnpm --filter @river/web exec wrangler deploy --env staging
```

1. Apply the reviewed migration to River's isolated staging database.
2. Publish the private document Worker/Container before deploying callers of its current contract.
3. Build the web Worker against the staging bindings.
4. Deploy the generated TanStack/Cloudflare build. `AUTH_SECRET` remains a server-side Wrangler secret.

Production is not deployed. Seven-day preview expiry and thirty-day database-backup retention are configured on staging. Checkpoint files and source originals use retained prefixes. An isolated local database/object restore drill passed; automatic daily exports remain open. See `checkpoints.md` and `recovery.md`.

Sources: [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [Workflow instance controls](https://developers.cloudflare.com/workflows/build/workers-api/), [local Container behavior](https://developers.cloudflare.com/containers/guides/local-dev/), [PDF.js](https://mozilla.github.io/pdf.js/), [Mammoth](https://github.com/mwilliamson/mammoth.js).

## Hosted Owner acceptance, 2026-09-04

The Owner created and verified `joshuasilva414@gmail.com`. The authenticated browser completed two synthetic Classic compilations on the deployed Worker/Workflow/Container path. Both returned PDFs with exact normalized text integrity, no validation warnings, and private R2 artifacts. PDF.js visibly rendered the actual protected PDF. The PDF download action succeeded, and a separate unauthenticated request to the same concrete artifact returned 401.

| Operation | End-to-end D1 timestamps | Container document processing |
| --- | --- | --- |
| `01a06fc1-237c-7f21-bba2-ca4357ccde11` | 13.495 s | 3.773 s |
| `01a06fc1-ab8a-7f0d-b77a-be80d0bfff39` | 18.553 s | 8.812 s |

These are first/subsequent hosted samples, 35 seconds apart, not a latency distribution. The subsequent request was slower; no warm-start speedup is established. Local resource limits remain the measured baseline. The main deployed PDF exit criterion is met. GitHub OAuth, hosted password reset completion, and deployed aborted-request recovery remain separate unchecked gates.
