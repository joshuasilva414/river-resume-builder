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
