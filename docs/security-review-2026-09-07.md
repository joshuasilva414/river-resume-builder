# River security review — 7 September 2026

**Remediation status: the four primary findings were fixed and verified in staging and production on 7 September 2026. Production cutover completed at 17:50 UTC. The minimum TLS setting remains a separate limitation; see the remediation record below.**

The original review, findings and verification record below describe the pre-remediation state. The later remediation record documents the changes and acceptance evidence. The original recommendation was to fix HTTPS enforcement and address logging, caching and browser headers before inviting more users or making security claims.

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

Following this remediation, an accurate explanation is:

> River is invite-only, and each person's workspace is separated from other users. Provider API keys are encrypted on the server. AI features send the selected information to the provider you choose; ATS scoring uses a separate service. I operate the infrastructure, so this is not end-to-end encrypted. A code and configuration review has been completed, but it is not an independent security certification.

## Verification record

Focused command: `pnpm --filter @river/web exec vitest run test/auth.test.ts test/credentials.test.ts test/multi-user.test.ts test/ai-settings.test.ts test/mcp.test.ts test/usage.test.ts test/refinement-artifacts.test.ts test/backups.test.ts`.

Result: **8 files passed, 42 tests passed**. The initial sandbox run could not bind local Workers sockets; rerunning with the permitted local runtime passed. Source-map warnings did not fail tests.

Live checks: HTTPS sign-in 200; anonymous jobs redirect to sign-in; anonymous identity/source APIs, artifact download, and MCP reject access with 401; anonymous Better Auth get-session returns null; cross-origin server-function request returns 403. HTTP sign-in returns 200 with a password form, confirming SEC-01.

Limits: no destructive testing, load testing, real credential submission, authenticated production account manipulation, full git-history secret audit, container penetration testing, provider-account policy audit, or independent penetration test. No claim of absence of vulnerabilities follows from passing tests.

## Remediation record

The remediation started from `main` at `c06dab5b9214489224190dc9814543e546e0aea3`, whose tree matches reviewed source `ff56a88`. Before edits, production still served web version `7be96e22-85e4-415f-80a7-a2896fed3271` and document version `1e36d615-51af-45df-b69e-4dc5260425cd`. The original checkout's untracked review was copied into the isolated remediation worktree.

At 17:14 UTC, a hostname-only edge redirect was installed: ruleset `14e2010e947d405d8ae2f769e2fe4133`, rule `209643837a5e4456820dc7d399f13dda`, expression `(http.host eq "river.jilva.dev" and not ssl)`, status 308, preserving path and query. A live HTTP sign-in check now redirects. No other hostname, zone-wide HTTPS setting, HSTS subdomain policy, or TLS setting was changed.

The released implementation adds a central HTTPS guard before dispatch/body consumption, one-year host-only HSTS, private/no-store responses, request-boundary error handling, nonce-based CSP, HTML framing denial, nosniff and no-referrer. Public documentation retains its existing cache policy; static assets retain normal caching. Same-origin PDF embedding remains permitted. RPC POST bodies are bounded to 15 MiB before framework parsing, and AI generation fetches reject redirects.

A staging experiment showed that disabling invocation logs and redacting queries alone still retains URL paths in custom-log metadata. Therefore the released implementation disables raw web-log persistence and sends events to a private per-environment tail Worker. The sanitizer persists only fixed event categories, UUID trace IDs and HTTP status. No request URL, body, header or exception text is copied. The synthetic reset query token was never a confirmed leak. Existing historical logs are not erased by this change and remain subject to Cloudflare retention.

Follow-ups assessed separately:

- TLS minimum remains 1.0 at the zone. Per-hostname TLS controls require Advanced Certificate Manager. A River-only request to set TLS 1.2 was explicitly rejected with Cloudflare error 1450: this zone has not been granted the feature. The earlier GET returned 405. A zone-wide change would affect unrelated applications and is outside this remediation's authorization. [Cloudflare minimum TLS documentation](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/minimum-tls/).
- New/refreshed OAuth tokens use Better Auth's supported encryption. The installed implementation supports legacy plaintext reads. Native GitHub sign-in refreshed the retained tokens for the single GitHub account in each hosted environment; aggregate checks confirmed encrypted-format access and refresh tokens in both. Older backups are not retroactively encrypted. Retain the authentication secret required to decrypt current tokens, and treat older backups as credential-bearing.
- The legacy `OPENAI_API_KEY` remains a documented rollback dependency from the v1.1 release. Current application source has no consumer. Preserve it until rollback retirement is explicit; no secret was deleted.
- The approved registry audit still reports one moderate esbuild advisory through Drizzle tooling, zero high/critical advisories. No affected esbuild development-server use was identified in production. The published stable Drizzle Kit version remains 0.31.10, already installed, and still includes the affected loader. No blind dependency override was applied.
- Infrastructure administrator/MFA/token-scope review, broader authorization coverage, data-deletion procedures and provider retention policies remain outside the focused remediation.

Release checks: full suite passes, including 207 Workers tests across 32 files, plus domain/template/document unit tests and recovery/cutover checks. Focused boundary additions cover HTTPS short-circuiting, forged nonce replacement, headers on errors, body-stream limits, two independent authenticated accounts and post-logout isolation. Deployment validation rejects raw log persistence and missing/mismatched sanitizer routing. Hosted acceptance is recorded below. Type checking and lint also passed across all six packages.


### Staging release and live acceptance

Staging deployed source `8f0dcd4425b421bf0bfddffd28b4d9b2c1e6415a` through Cloudflare build `5dc3041e-38c3-41ef-bfd7-3c091edac840`. Web version `f4d33d27-2e1c-4b5b-9090-21c9033fb97e` was published at 17:37:46 UTC. Document version: `08b6cace-b766-4836-a2b8-24622729b708`; telemetry sanitizer version: `e54228cd-21c8-4fe2-9378-95d56b42f750`.

- Backup retained and validated: `backups/database/staging/2026-09-07T17-36-52.159Z-dbb528a4-6152-42b6-ae5c-7921c5830d7b/snapshot.json.gz`, covering 77 base tables. No migrations were pending.
- Fifteen HTTP acceptance checks passed: HTTPS headers on sign-in, fake-token recovery page, docs, protected redirects, anonymous API/auth/RPC responses, cross-origin RPC 403 and missing-function 500; every generated HTML script carried its CSP nonce. Public JavaScript remained cacheable. HTTP POSTs to sign-in, recovery, jobs, API and RPC redirected with 308.
- An authenticated existing fictional résumé (`01a07900-054a-717a-8cc3-525daac4bea0`) hydrated and displayed its one-page PDF. Fonts, scripts and PDF rendering passed visual inspection with no browser CSP errors. No résumé record was changed.
- A page served from a different origin could not frame staging sign-in. The same probe could still frame the old production version before its cutover, providing a comparison.
- Logout returned to sign-in. Browser Back also showed sign-in. Existing GitHub authorization successfully signed in again under the enforced policy.
- Synthetic query, arbitrary parameter and recovery/source-path markers under `river-sec-staging-final-1788802732528` returned zero aggregate matches in both raw-web and sanitizer persisted logs. Each of the three associated UUID trace IDs returned one sanitizer match. Requests returned 401/400/401, so useful status/error context remained available.
- After the GitHub sign-in, aggregate checks found one GitHub account with both retained access and refresh tokens in the installed library's encrypted format. No token value was read or printed.

Local evidence is ignored under `test-results/security-2026-09-07/`, including HTTP assertions, synthetic-marker receipts, aggregate logging results, browser-check records, the dependency audit and test logs. The initial local container check failed because Docker's disk was full (`ENOSPC`). The unchanged fixtures passed with a bounded 128 MiB temporary filesystem, preserving unrelated Docker data. The hosted GitHub and Cloudflare document checks passed normally.


### Production release and live acceptance

The implementation was promoted through [PR 5 (feature to dev)](https://github.com/joshuasilva414/river-resume-builder/pull/5), [PR 6 (dev to staging)](https://github.com/joshuasilva414/river-resume-builder/pull/6), and [PR 7 (staging to main)](https://github.com/joshuasilva414/river-resume-builder/pull/7). Application and document checks passed before each merge. Production deployed source `37050a77f2f9aefb3fde20e4932c9564ea7681c8` through successful Cloudflare build `805a5a8b-6e0a-48c1-87ea-13a11c941438`. GitHub's main-branch run `34148614073` also passed.

Web version `82580fec-bc8b-4067-852d-a1630a180a1e` reached 100% traffic at 17:50:55 UTC, deployment `6d08c0c9-d254-4d94-aaa4-ae5a340d47d8`. Document version: `de6e9e41-39ff-4fc3-a974-548a622190b7`; telemetry sanitizer version: `99b651bd-6925-47e4-b4b0-3783c5dc39a7`.

- Backup retained and validated: `backups/database/production/2026-09-07T17-50-05.066Z-33c25ba7-f138-4815-b201-8db2499c33c5/snapshot.json.gz`. No migrations were pending. This was automated backup validation, not a new full production restore drill.
- All fifteen HTTP acceptance checks passed, covering the same headers, nonce, private-response, RPC, error, cacheable-asset and HTTP POST cases as staging.
- An existing fictional résumé (`01a074ca-32f5-7a1b-b91a-1d84fb075dcf`) hydrated and displayed its one-page PDF. Fonts and scripts rendered under the enforced CSP, with no browser CSP errors. No résumé record was changed.
- The separate-origin probe could no longer frame production sign-in. Logout returned to sign-in, and browser Back remained at sign-in. GitHub sign-in then successfully returned to the authenticated application with no browser warnings/errors in the final check.
- Live configuration confirmed raw web-log persistence and invocation logging disabled, query redaction enabled, traces disabled, and the matching production sanitizer attached. Sanitizer persistence is enabled without invocation logging.
- Synthetic query, arbitrary parameter and recovery/source-path markers under `river-sec-production-final-1788803537041` returned zero aggregate matches in raw-web and sanitizer persisted logs. The three request traces each returned one sanitizer match: `1d3d39d4-8bde-4a0a-b432-78b5b2181817` (401), `e50003b0-6924-4636-9ff8-62a38ebe5f3e` (400), and `d6efb283-5fc6-4997-8686-e3de6a244640` (401).
- After GitHub sign-in, aggregate checks found one GitHub account with encrypted-format retained access and refresh tokens. No token values were retrieved.

### Final disposition and limits

| Finding | Disposition |
| --- | --- |
| RIVER-SEC-01 | HTTP redirects before dispatch; host-only HSTS is present. The zone's minimum TLS remains 1.0 because the scoped control is unavailable without Advanced Certificate Manager. No zone-wide change was authorized or made. |
| RIVER-SEC-02 | Central private/no-store policy covers private routes, authentication, RPC, redirects and errors. Focused local tests exercise two separate authenticated accounts and logout isolation. Public docs and static assets retain appropriate caching. |
| RIVER-SEC-03 | Raw web events are no longer persisted. The private sanitizer stores only allowlisted diagnostic fields. Both hosted environments rejected synthetic URL markers from persisted logs while retaining trace/status events. Historical logs follow existing retention. No real reset token leak was established. |
| RIVER-SEC-04 | Enforced nonce CSP, HTML framing denial, nosniff and no-referrer passed hosted checks. Authenticated rendering, GitHub sign-in and same-origin PDF previews remain functional. |

RPC actual-stream limits and AI no-redirect transport are implemented and tested. OAuth encryption is enabled and the existing hosted GitHub tokens were refreshed. The moderate transitive development-tool advisory and legacy rollback key remain documented follow-ups. Reverting to the previous application/configuration would also revert these security controls; preserve the HTTPS edge rule and evaluate the security impact before any rollback.

Two-account isolation was exercised locally; hosted browser acceptance used the existing administrator account in each environment. Recovery-page rendering was checked with fake tokens, while password-reset/session-revocation behavior remains covered by local tests. No real password was changed. No production load/destructive tests, new real-data AI transfers, full authorization fuzzing, administrator-access audit or independent penetration test were performed. Passing these checks supports the specific remediation claims above, not a claim that River has no vulnerabilities or is independently certified.
