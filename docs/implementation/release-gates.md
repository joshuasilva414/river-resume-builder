# V1 release evidence

Updated 2026-09-05. V1 is not released. This maps the remaining plan gates to concrete verification rather than treating deployed controls as completed workflows.

## Service and persistence gate

The complete Workers run recorded in `/tmp/river-approved-full-tests.log` passed 151 tests in 26 files, including the password-reset session-revocation correction and earlier dialog focus fix. All workspace type/lint checks, both environment builds and production dry runs passed. The following assertions satisfy M6's focused integration-test gate; hosted credential and provider acceptance remain separate.

| Contract | Verification |
| --- | --- |
| Owner allowlist, verified sessions, logout and password recovery | `apps/web/test/auth.test.ts` uses the real Better Auth adapter and D1. Password reset invalidates two existing sessions; old passwords and used/expired tokens fail. See `authentication.md`. |
| Agent scopes, hash-only storage, expiry and revocation | `credentials.test.ts` and `mcp.test.ts` exercise authentication and the actual MCP handler. A read scope cannot mutate, repeated commands return one result, and revoked credentials fail immediately. |
| Atomic revision guards and permanent idempotency | `persistence.test.ts` races four creates, checks one Operation/dispatch/audit, rejects fingerprint reuse, and checks no dependent writes after a stale revision or a later SQL failure. |
| Stale and concurrent AI acceptance | `job-ai.test.ts`, `source-ai.test.ts` and `wording.test.ts` preserve Pending proposals and unchanged aggregates/indexes/audits when captured inputs change or a competing decision wins. |
| Interrupted background work | `sources.test.ts` finalizes a previously uploaded object, leaves a missing upload undispatched, rotates beyond 50 abandoned reservations and isolates R2 failures. `persistence.test.ts` preserves cancellation against late success and dispatch acknowledgment. |
| Partial artifact publication | `refinement-artifacts.test.ts` interrupts after the first retained object, resumes without replacing that object's bytes/time, checks exact digests and rejects incomplete or conflicting sets. |
| Historical output and non-destructive restoration | `checkpoints.test.ts` preserves captured composition, contact/context values, artifacts and exact acknowledgments through later edits. `history.test.ts` restores an independent branch without changing the source checkpoint or newer draft. |

Reproduce the complete Workers suite with `pnpm --filter @river/web test`. Its D1 and R2 bindings are isolated test resources; it does not send provider requests or change staging credentials. See each workflow's implementation record for its exact test and hosted proof history.

## Browser and release gates

Local and hosted Playwright journeys cover source intake, evidence review, manual jobs, composition, concurrent-tab preservation, warning inspection, retained export, AI review and history. Their records are in `evidence.md`, `jobs.md`, `composition.md`, `checkpoints.md` and the relevant AI documents. `mobile-review.md` records actual 390-pixel checks. These are synthetic journeys, not the required timed Owner session.

Hosted Agent Credential acceptance passed with real REST/MCP source, evidence and job commands, exact citations, shared idempotency, denied scopes and revoked-credential 401s. See `agent-access.md`.

The following work still prevents V1 release:

- Required GitHub OAuth and hosted password recovery. The personal GitHub app is registered and staging credential installation is approved; GitHub requires Owner identity verification before secret generation; the Owner must enter a new password for the hosted recovery journey.
- Explicit source-refinement acceptance, retained export, structured return and template promotion. Candidate rendering passed; acceptance remains pending the Owner review attestation.
- ATS identity deployment and two synthetic provider requests passed. River integration, compatible comparisons, failure/retry and canonical template qualification remain open. No tested designation is awarded.
- Populated mobile scoring/qualification review and a restore containing real scoring records.
- One real Owner job-tailoring session within 15 minutes, using Owner-selected job and evidence files.
- Production secret/authentication setup, `river.jilva.dev` deployment and final production acceptance. Isolated personal-account D1/R2 resources, all 28 migrations, environment-specific backup handling and an empty production restore are prepared; see `production.md`.

The three approved setup actions are authorized. Source-refinement Owner attestation and production publication remain separate. Original sources and checkpoint artifacts remain retained. Production storage exists, with no application or domain publication. ACM UTSA remains untouched.

The deployed request-lifetime gate now has a captured Cloudflare `canceled` invocation, a subsequent expected authorization response and a successful authenticated synthetic compile. See `request-lifetime.md`. The approved temporary Agent Credential completed its six-scope hosted journey and is revoked. Fictional claim/job fixtures are archived.
