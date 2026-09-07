# River security review — 7 September 2026

**Recommendation: fix HTTPS enforcement before inviting more users. Address the logging, caching, and browser-header findings before describing River as security-reviewed and ready for sensitive personal information.**

River has useful security controls, and the reviewed tests passed. This review did not find an account-isolation bypass or an unauthenticated data-download path. It did find one high-priority transport issue and three medium-priority privacy or browser-hardening gaps. These findings do not establish that an attack has occurred.

## Scope and evidence

- Source reviewed: clean checkout at `ff56a887387c4af13394028515fc08cd3b1a3dd9`.
- Live production: `https://river.jilva.dev`, checked around 16:45–17:00 UTC.
- Active web version: `7be96e22-85e4-415f-80a7-a2896fed3271`; document version: `1e36d615-51af-45df-b69e-4dc5260425cd`. Cloudflare did not return a source-commit annotation, so exact source-to-deployment byte equivalence was not established.
- Inspected authentication, account admission, agent permissions, repository ownership guards, artifact routes, AI credentials and outbound calls, document processing, logging, backup design, dependencies, and deployment settings.
- Ran 42 existing tests across eight security-relevant Workers test files. All passed. Tests used isolated local accounts and storage; document extraction in this Workers harness uses a synthetic adapter.
- Ran `pnpm audit --prod --json` after explicit approval. Result: one moderate advisory; zero high or critical advisories in the registry response.
- Scanned 540 tracked files for selected recognizable private-key, provider-key, GitHub-token, and AWS access-ID patterns; no matches. This limited pattern scan does not cover arbitrary secrets or git history.
- Production checks were read-only HTTP requests and configuration queries. Logging checks used harmless markers and aggregate counts. No real recovery tokens, passwords, API keys, or private résumé contents were retrieved.
- No application code, access lists, secrets, or production settings were changed.

## Findings

### RIVER-SEC-01 — High: production serves a password form over HTTP

**Evidence:** `GET http://river.jilva.dev/sign-in` returned `200`, a River HTML page containing a password input, and no redirect. The HTTPS response omitted `Strict-Transport-Security`. Cloudflare reported `always_use_https: off`, HSTS disabled, and `min_tls_version: 1.0`.

The Worker forwards requests directly to the framework in [server.ts](../apps/web/src/server.ts#L21). Validating that configured `APP_URL` uses HTTPS does not reject an incoming HTTP request. The browser auth client uses its default relative endpoint in [auth-client.ts](../apps/web/src/lib/auth-client.ts#L1).

**Impact:** a user who reaches the HTTP URL can receive a page that a network attacker can read or alter. An attacker can replace the sign-in form or its scripts to capture entered credentials. Secure session cookies and HTTPS links do not protect a password typed into a page delivered over HTTP. No real credentials were submitted to test this.

**Fix:** enforce an HTTP-to-HTTPS redirect at the edge for the River hostname and add an application guard. Add HSTS to HTTPS responses. Raise the minimum supported TLS version to at least 1.2 after checking other affected hostnames. Zone-wide settings affect more than River; prefer hostname-scoped changes where appropriate. Do not enable HSTS `includeSubDomains` or preload without checking the whole domain.

**Acceptance:** HTTP requests to sign-in, reset-password, application, API, and server-function paths redirect before rendering or processing input; HTTPS responses contain the intended HSTS policy. Verify TLS policy separately.

### RIVER-SEC-02 — Medium: private server-function responses lack explicit cache protection

**Evidence:** a same-origin production GET to the generated `getSession` server-function endpoint returned `200 application/json` with neither `Cache-Control` nor `Vary`. The call was anonymous and returned a null user. The same handler returns account ID, name, and email when authenticated. Other GET server functions return settings, evidence, jobs, and document metadata through the same transport.

Relevant sources: [functions.ts](../apps/web/src/server/functions.ts#L30), [job-functions.ts](../apps/web/src/server/job-functions.ts#L8), and [server.ts](../apps/web/src/server.ts#L21). The REST helper's `private, no-store` header in [http.ts](../apps/web/src/server/http.ts#L11) does not apply to these server-function responses. Private route rendering also has no central cache policy.

**Impact:** sensitive responses are left to browser or intermediary cache behavior instead of explicitly preventing storage and reuse. A later cache configuration change could have a larger effect than intended. This review did not demonstrate shared-cache leakage or retrieval of authenticated content after logout.

**Fix:** centrally apply `Cache-Control: private, no-store` to private HTML, authentication pages, and server-function responses, including errors. Preserve normal caching for public assets and documentation. `Vary: Cookie` alone is not a substitute for `no-store`.

**Acceptance:** inspect authenticated HTML and server-function responses for two test accounts, including errors and post-logout navigation. Verify that public asset caching still works.

### RIVER-SEC-03 — Medium: private search inputs can enter production request logs

**Evidence:** production observability has invocation logging and persistence enabled at full sampling, with `redact_query_string: false`. Harmless values sent to a public page under both `review_canary` and `payload` appeared in aggregate log searches. Job and evidence searches use GET server functions; the installed TanStack transport serializes their input into the URL's `payload` query parameter.

Relevant sources: [wrangler.jsonc](../apps/web/wrangler.jsonc#L8), [job-functions.ts](../apps/web/src/server/job-functions.ts#L8), and [evidence-functions.ts](../apps/web/src/server/evidence-functions.ts#L15). River's own [diagnostics.ts](../apps/web/src/server/diagnostics.ts#L24) deliberately excludes inputs, but platform request logging is a separate channel. Cloudflare documents that invocation logs include request URLs in [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

**Impact:** free-text searches and private record identifiers can be retained outside the application's ordinary data-access controls and exposed to people with log access. The canary establishes query-value retention; actual private searches were not inspected.

**Important qualification:** the fake `token` value on the reset-password page did not appear in logs. Aggregate queries instead matched `token=REDACTED`. This review therefore does **not** claim that password-reset query tokens are exposed. Path-based recovery tokens and other authentication URL variants remain unverified.

**Fix:** redact query strings in platform logs or disable invocation logs and retain sanitized application diagnostics. Consider POST for searches containing personal information. Ensure path-based authentication secrets are also excluded; query-string redaction alone does not cover URL paths. Apply equivalent controls to staging.

**Acceptance:** synthetic markers in `payload`, arbitrary query parameters, and recovery-path placeholders cannot be found in persisted logs, while useful error categories and trace identifiers remain available. Inspect aggregate counts or synthetic-only records, not real credential-bearing events.

### RIVER-SEC-04 — Medium: HTML lacks framing and content-security controls

**Evidence:** production sign-in, reset-password, and documentation HTML omitted both `Content-Security-Policy` and `X-Frame-Options`. These responses also omitted `X-Content-Type-Options` and an explicit `Referrer-Policy`. There is no central security-header layer in [server.ts](../apps/web/src/server.ts#L21).

**Impact:** the site does not explicitly prevent another site from framing its pages. It also lacks CSP as an additional barrier against script injection. SameSite cookies mitigate some cross-site scenarios; no working clickjacking exploit or XSS was demonstrated. See [OWASP's clickjacking guidance](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html).

**Fix:** set `frame-ancestors 'none'` on application HTML, with `X-Frame-Options: DENY` as a fallback. Develop a CSP compatible with TanStack's rendering and River's PDF viewer, initially using report-only mode for script/resource restrictions. Add `nosniff` and a restrictive referrer policy, especially on recovery pages. Preserve same-origin PDF embedding where River needs it instead of indiscriminately blocking every artifact response.

**Acceptance:** a separate-origin page cannot frame application HTML. Sign-in, GitHub OAuth, reset-password, scripts, fonts, and PDF previews still work under the final policy.

## Controls that held up in the review

| Area | Evidence and limits |
| --- | --- |
| Account admission | Invitation list and verified email checked during account/session creation and subsequent authentication. Removing admission invalidates future session and agent requests in local tests. |
| Passwords and sessions | Minimum 12-character passwords; database sessions; password reset revokes sessions. Installed Better Auth cookie defaults use Secure for the configured HTTPS origin, HttpOnly, and SameSite=Lax. Production authenticated cookie issuance was not exercised. |
| Authentication throttling | Database-backed throttles using Cloudflare's connecting-IP header; a test verifies limits across fresh auth instances. |
| Account isolation | Two-account tests reject foreign source reads/downloads, evidence access, and MCP reads/writes. Source workflows keep accounts separate. Reviewed artifact routes authenticate and check owning records before R2 reads. This is representative coverage, not exhaustive authorization fuzzing. |
| Agent credentials | Only secret hashes stored; live revocation, expiry, admission, and scope checks. Owner-only functions reject agents. |
| Request forgery | Production server-function GET accepts its own origin and rejects a different origin with 403. Installed TanStack supplies default CSRF middleware when no custom Start instance exists. REST JSON and MCP have separate origin/authorization controls. |
| AI keys | AES-256-GCM with random IVs and authenticated owner/connection/provider/revision data. Lists and audit records exclude plaintext. Removed/replaced revisions cannot be used for a new queued provider call. Encryption and lifecycle tests passed. |
| AI boundaries | Explicit provider/model selection, bounded inputs and output tokens, no automatic SDK retries or tool use. Fixed provider failure messages avoid returning key-bearing exceptions. Generated changes require validation and review. |
| Object storage | Live production R2 managed public domain disabled; no custom public domains. No bucket CORS policy was configured. Downloads pass through authorized application routes. |
| Document service | Live workers.dev and preview endpoints disabled. Default public handler returns 404. Code uses a service binding, no container Internet, non-root runtime, fresh job directories, command/package allowlists, Tectonic untrusted mode, cached resources, deadlines, and cleanup. No container escape testing was performed. |
| Resource quotas | Database triggers enforce four active / 100 daily tasks per account and 16 active / 1,000 daily globally. Atomic quota tests passed. |
| Backups | Backup UI restricted to administrators. Recovery tests passed. Documented retention is seven days for transient previews, 30 days for daily backups, and no automatic expiry for retained originals/checkpoints. A new production restore drill was outside this review. |

## Dependency result and additional hardening

The production dependency audit reports **one moderate advisory**, [GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99), for `esbuild@0.18.20` through `better-auth → drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils`. It concerns esbuild's development-server CORS behavior. No use of that affected serve mode was identified in River's production entrypoints. Resolve the transitive tooling dependency without a blind major-version override. The registry result is not a proof that all dependencies are safe.

Follow-up hardening, separate from the four findings:

- Extend the actual-stream body limit to server-function POST requests. The REST helper bounds bodies at 15 MiB, but the installed RPC transport calls `request.json()` / `request.formData()` before application authentication. Avoid testing large payloads against production; use an isolated runtime.
- Give AI generation calls the same explicit no-redirect policy already used by model catalogs, scoring, and backup requests. The SDK's generation transport currently receives raw `fetch`; no malicious provider redirect was observed.
- Review GitHub OAuth-token storage. Better Auth supports `account.encryptOAuthTokens`; River does not set it, and the installed implementation makes encryption opt-in. Database/backups should be treated as credential-bearing. Prefer discarding unnecessary provider tokens or encrypting retained tokens with a migration plan.
- Remove the legacy production `OPENAI_API_KEY` secret if operational verification confirms no remaining consumer. Current BYOK application code does not use it.
- Review Cloudflare/GitHub administrator access, MFA, API-token scope, secret rotation, backup readers, and incident procedures. Those account-level permissions were not audited here.
- Run a dedicated authenticated browser review and broader authorization matrix before a public rollout. The focused suite does not cover every route and every foreign identifier combination.

## What friends should know

River isolates ordinary users' workspaces. It is **not end-to-end encrypted**. The service operator and people with sufficient infrastructure/database/backup access can access stored résumé information. Server-side API-key encryption protects a database copy separately from the encryption secret; the application can decrypt those keys to use them.

AI actions transmit their selected inputs to the chosen provider. ATS scoring separately transmits full résumé text and the saved posting to the configured scoring service. Provider retention and training policies must be assessed for the selected provider/account; an OpenAI `store: false` request is not a universal zero-retention promise.

Original documents and saved history are retained. Archiving is not erasure. Removing a provider connection clears its live encrypted key, but earlier backups may still contain the prior ciphertext. A complete account/data deletion procedure and backup-expiry explanation should be available before promising deletion to friends. Feedback is intentionally visible to the administrator.

After fixing and verifying the findings, an accurate explanation would be:

> River is invite-only, and each person's workspace is separated from other users. Provider API keys are encrypted on the server. AI features send the selected information to the provider you choose; ATS scoring uses a separate service. I operate the infrastructure, so this is not end-to-end encrypted. A code and configuration review has been completed, but it is not an independent security certification.

## Verification record

Focused command: `pnpm --filter @river/web exec vitest run test/auth.test.ts test/credentials.test.ts test/multi-user.test.ts test/ai-settings.test.ts test/mcp.test.ts test/usage.test.ts test/refinement-artifacts.test.ts test/backups.test.ts`.

Result: **8 files passed, 42 tests passed**. The initial sandbox run could not bind local Workers sockets; rerunning with the permitted local runtime passed. Source-map warnings did not fail tests.

Live checks: HTTPS sign-in 200; anonymous jobs redirect to sign-in; anonymous identity/source APIs, artifact download, and MCP reject access with 401; anonymous Better Auth get-session returns null; cross-origin server-function request returns 403. HTTP sign-in returns 200 with a password form, confirming SEC-01.

Limits: no destructive testing, load testing, real credential submission, authenticated production account manipulation, full git-history secret audit, container penetration testing, provider-account policy audit, or independent penetration test. No claim of absence of vulnerabilities follows from passing tests.

## Remediation in progress

The security candidate starts from `main` at `c06dab5b9214489224190dc9814543e546e0aea3`, whose tree matches reviewed source `ff56a88`. Before edits, production still served web version `7be96e22-85e4-415f-80a7-a2896fed3271` and document version `1e36d615-51af-45df-b69e-4dc5260425cd`. The original checkout's untracked review was copied into the isolated remediation worktree.

At 17:14 UTC, a hostname-only edge redirect was installed: ruleset `14e2010e947d405d8ae2f769e2fe4133`, rule `209643837a5e4456820dc7d399f13dda`, expression `(http.host eq "river.jilva.dev" and not ssl)`, status 308, preserving path and query. A live HTTP sign-in check now redirects. No other hostname, zone-wide HTTPS setting, HSTS subdomain policy, or TLS setting was changed.

The candidate adds a central HTTPS guard before dispatch/body consumption, one-year host-only HSTS, private/no-store responses, request-boundary error handling, nonce-based CSP, HTML framing denial, nosniff and no-referrer. Public documentation retains its existing cache policy; static assets retain normal caching. Same-origin PDF embedding remains permitted. RPC POST bodies are bounded to 15 MiB before framework parsing, and AI generation fetches reject redirects.

A staging experiment showed that disabling invocation logs and redacting queries alone still retains URL paths in custom-log metadata. Therefore the candidate disables raw web-log persistence and sends events to a private per-environment tail Worker. The sanitizer persists only fixed event categories, UUID trace IDs and HTTP status. No request URL, body, header or exception text is copied. The synthetic reset query token was never a confirmed leak. Existing historical logs are not erased by this change and remain subject to Cloudflare retention.

Follow-ups assessed separately:

- TLS minimum remains 1.0 at the zone. Per-hostname TLS controls require Advanced Certificate Manager; the hostname settings endpoint returned 405. A zone-wide change would affect unrelated applications and is outside this remediation's authorization. [Cloudflare minimum TLS documentation](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/minimum-tls/).
- New/refreshed OAuth tokens use Better Auth's supported encryption. The installed implementation supports legacy plaintext reads. Existing tokens and older backups require a separate migration/rotation plan with the authentication secret retained; this change does not claim retrospective encryption.
- The legacy `OPENAI_API_KEY` remains a documented rollback dependency from the v1.1 release. Current application source has no consumer. Preserve it until rollback retirement is explicit; no secret was deleted.
- The approved registry audit still reports one moderate esbuild advisory through Drizzle tooling, zero high/critical advisories. No affected esbuild development-server use was identified in production. No blind dependency override was applied.
- Infrastructure administrator/MFA/token-scope review, broader authorization coverage, data-deletion procedures and provider retention policies remain outside the focused remediation.

Candidate checks: full suite passes, including 207 Workers tests across 32 files, plus domain/template/document unit tests and recovery/cutover checks. Focused boundary additions cover HTTPS short-circuiting, forged nonce replacement, headers on errors, body-stream limits, two independent authenticated accounts and post-logout isolation. Deployment validation rejects raw log persistence and missing/mismatched sanitizer routing. Hosted acceptance is pending below; local results alone do not establish production remediation.
