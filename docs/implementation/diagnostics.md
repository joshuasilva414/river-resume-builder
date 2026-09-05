# Correlated diagnostics

Application commands and reads emit one Effect JSON outcome event. The logger uses a fixed field list; it does not serialize inputs, results, exception causes, source text, model responses, credentials or signed URLs. Effect's default console logger is replaced to avoid duplicate plaintext output.

| Event | Correlation and outcome fields |
| --- | --- |
| `river.application` | `traceId`, authenticated `actorId` or `anonymous`, required `permission`, `outcome`; elapsed milliseconds in the named log span |
| `river.workflow-dispatch` | `operationId`, the identical stable `workflowId`, `ownerId`, `outcome`; elapsed milliseconds in the named log span |
| `river.document.response` | bounded `operationId`, validated `jobType`, HTTP `status`, allowlisted `cache` outcome |

An application failure's `traceId` matches its public Problem Details response. A dispatch event links the persisted Operation to its Workflow; the document response reuses that Operation identity. These are separate request and Operation correlations, not a claim that a distributed tracing exporter is configured. Authentication infrastructure errors that occur before shared command execution remain outside this application event.

Use `pnpm --filter @river/web exec wrangler tail --env staging --format json` for request/dispatch events and the same command with `@river/documents` for document responses. Omit the explicit Worker name when selecting the environment. Capture only for a bounded incident window in a private file, and inspect the fixed River events rather than dumping request envelopes. The raw tail can contain Cloudflare request metadata beyond River's field list. Follow [the recovery procedure](recovery.md) for Operation, Workflow and artifact inspection.

Three focused tests exercise concurrent successes, typed failures, defects, interruption and failed dispatch. They preserve returned values/outcomes, verify correlation and elapsed spans, and assert that private payloads and exception messages never appear in River's logs. The full 139-test Workers suite, workspace types/lint and staging build passed on 2026-09-05. CI runs the repository's existing type, lint, test and build checks. Hosted deployment verification is recorded in `deployment.json`.

Hosted verification passed for commit `149d87f`: the anonymous 401 response and event share trace `01a07360-66fe-7a3d-b517-f2ab89edd876`. Synthetic Operation `01a07360-933f-7bee-af1f-6477c5d43767` dispatched under the same Workflow ID (628 ms) and returned a successful authenticated PDF. The document Worker update retained the existing Container image. Exact Worker versions are in `deployment.json`.
