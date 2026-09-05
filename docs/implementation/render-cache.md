# Warm document reuse

Structured `compile-resume` requests can reuse a successful result in the current document Container process. This avoids repeating Tectonic and PDF extraction when different Operation or draft revisions contain exactly the same rendering input. It supplements the existing revision-level preview coalescing. It is an optimization; cold Containers compile normally.

The key hashes the schema-decoded complete document, theme, optional template identity and complete custom graph. Only the transport `jobId` is excluded. A runtime namespace hashes the Node version, compiler-resource manifest, bundled document program and full dependency lock. Resource or renderer changes cannot reuse an earlier process's results. Entry keys contain hashes rather than source text.

Only schema-valid results with passing text integrity enter the cache. Invalid inputs, extraction, template validation and final-source refinement use the existing fresh child-process path. In particular, repeated template validation still performs two independent compilations. Failed and oversized results are never retained.

The in-memory cache holds at most 16 MiB of serialized results, evicts the least recently used entries, and expires entries two minutes after compilation. Reading an entry does not extend its lifetime. Container restart discards the cache. This does not add persistent storage or extend the seven-day preview policy.

The cached result preserves all PDF/LaTeX/text/report bytes, fingerprint, resource identities and original compiler duration. `durationMs` therefore describes the retained compilation, not the elapsed time of a cache lookup. Internal HTTP responses report `X-River-Document-Cache: hit`, `miss` or `bypass`; request wall time is measured independently. These headers contain no input or credential data.

Each Workflow still creates its own immutable R2 keys and publishes its own D1 artifact manifest. Checkpoint retention, authorization, per-issue acknowledgments and stale-preview publication guards are unchanged. Cache reuse neither creates a checkpoint nor accepts a proposal.

## Verification

Three focused tests cover equivalent inputs with different Operation IDs, changed content/theme/template/runtime identity, ineligible jobs, expiry, eviction and rejection of invalid, failed or oversized output. Document-package type checks and lint pass. The offline Container fixture command is `pnpm test:documents`; its added checks compare complete real results across a miss/hit, require a miss after changed content, and assert that template validation bypasses reuse.

The complete offline suite passed on local image `sha256:b23a0c2482af42d845647a3a8a1889a3c1ea0c4e3697106803f71eaea1204dcc`, with Linux/amd64 emulation, networking disabled, one CPU and a 512 MiB memory cap. The cache miss took 2,512 ms and hit took 575 ms including Docker execution overhead. Changed content missed. All artifact fields remained identical across reuse. Canonical fixtures, independent repeat rendering, extraction, source refinement, malformed input, prohibited source and text-integrity checks also passed. Peak cgroup memory was 463,609,856 bytes, about 442 MiB. These are local measurements, not hosted latency guarantees.

The first harness attempt encountered a refused connection before the server accepted requests. The harness now waits for the health endpoint with a bounded deadline before exercising document jobs. Logs: `/tmp/river-render-cache-container.log` and `/tmp/river-render-cache-container-ready.log`. Hosted deployment and acceptance are recorded separately in `deployment.json` and the status ledger.

## Hosted verification

Image commit `f946af0` deployed as `sha256:a35ce74287fdce2c7a7152e2afd107ac2d9b736bd31b8f9eb8b42bdf5cec3a2f`; the personal Container application advanced to version 9. The first requests after deploy still compiled separately. Application configuration and a successful PDF alone did not establish cache activation. This is consistent with Cloudflare's documented interval between Worker activation and Container replacement; it does not establish the exact image that served those earlier requests. See [Container rollouts](https://developers.cloudflare.com/containers/configuration/rollouts/).

Commit `fc2b6f0` adds an Effect JSON response event containing only the bounded Operation identity, validated job type, HTTP status and allowlisted cache outcome. It logs neither request content nor raw responses. Worker version `41b6ee79-64cf-4a54-919b-06add26319a9` deployed that diagnostic without another Container rollout. The first tail command incorrectly combined an explicit script name with `--env staging`, which doubled its suffix. Using the configured environment alone corrected the read-only diagnostic command.

The hosted synthetic compilation `01a0734d-3db1-7b84-96db-37bb014eec62` completed in 12,273 ms end to end. Its repeat `01a0734d-f254-7095-83d9-330a75b882f6` completed in 3,514 ms. The observed header for a further immediate repeat, `01a0734e-e11d-74de-a0b8-05d9edeb222a`, was `hit`; that Operation completed in 3,213 ms. All three preserved the original 3,875.363364 ms compilation duration, identical four artifact digests and fingerprint `12975f6a16a3b966022b3201259c142df5c3ac1350d38dcc758c38a2853ee4a9`, under distinct per-Operation R2 keys. The actual hosted PDF rendered and its text-integrity report passed. No checkpoint or Owner evidence was created.

The diagnostic capture is private at `/tmp/river-cache-private-tail-corrected.jsonl`. Only the redacted `river.document.response` events were inspected. These samples prove warm reuse in this hosted run, not a general latency guarantee or cross-Container cache.
