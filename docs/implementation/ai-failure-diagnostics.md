# AI failure diagnostics

The September 7 production source-analysis incident exposed an error classification bug. An expected `ApplicationError` thrown inside `WorkflowStep.do` arrived outside the step as a plain `Error`. The source workflow therefore replaced a provider failure with a citation-validation message. Job analysis, wording and duplicate comparison used the same pattern.

`runAiWorkflowStep` now serializes expected unavailable failures as a small step result and recreates the error after the step boundary. The existing operation failure handler saves the intended user-facing message. The operation and workflow still fail; automatic provider retries remain disabled. Successful steps retain no generated content. Unexpected errors continue through the existing failure handling.

Provider failures contain a fixed category and a numeric HTTP status (or null). Categories distinguish authorization, rate limits, rejected requests, provider unavailability, timeouts, invalid output and other request failures. The safe message and diagnostic are retained in the Workflow step result. Original provider messages, response bodies, headers, prompts and credentials are excluded. Existing historical failed steps cannot recover discarded diagnostics.

## Verification

- A regression test using the real Source AI Workflow failed before the change: a missing connection was reported as citation validation. It passes with the correct connection message after the change.
- Real Workflow tests exercise the shared provider adapter with synthetic HTTP 400, 401, 429 and 503 responses. They verify the diagnostic survives serialization and private synthetic text does not appear in the retained result.
- The six affected AI service test files pass (54 tests), followed by the complete web suite (196 tests across 31 files). Workspace type checks and lint pass.
- An isolated live replay used the incident's exact captured source, model (`gpt-5.6-luna`) and saved connection. It returned 19 candidates in 28.5 seconds; all passed River's citation validation. The replay did not publish candidates, create claims, or modify the production task.

## Production request regression found during release preparation

The initial replay ran against an older checkout. Release preparation compared it with the newer security changes already in production and found that the shared AI adapter used `redirect: "error"`. Cloudflare Workers rejects this option before the provider request is sent. A focused workerd probe reproduced `TypeError: Invalid redirect value, must be one of "follow" or "manual"`. All four provider tests failed when their synthetic transports constructed real workerd Requests using the adapter's options.

The adapter now uses `redirect: "manual"` and rejects every 3xx response without forwarding credentials. Regression coverage constructs a real Request for each provider and verifies that a synthetic 302 results in one request and a safe failure. The earlier replay success therefore did not establish that the deployed request path worked. The release includes both the request compatibility fix and the safe failure propagation fix.

Temporary replay inputs and credential ciphertext were removed after the replay. Only the diagnostic harness, safe result metadata and build log remain under ignored `test-results/source-ai-diagnosis/`. Staging and production bundles both pass their deployment dry runs. The regression and replay are implementation evidence, not evidence of a production deployment.
