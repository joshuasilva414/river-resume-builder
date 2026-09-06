# V1 release evidence

Updated 2026-09-05. V1 is not released. This maps the remaining plan gates to concrete verification rather than treating deployed controls as completed workflows.

## Service and persistence gate

The complete Workers run recorded in `/tmp/river-score-diagnostics-full.log` passed 158 tests in 26 files, including source occurrence anchors, safe scoring diagnostics across Workflow steps, password-reset session revocation and dialog focus. Five domain tests, all workspace type/lint checks and the clean staging build passed. The current production build/dry run also passes with the final scoring-origin configuration; see `production.md`. Production remains unpublished. The following assertions satisfy M6's focused integration-test gate; hosted credential and provider acceptance remain separate.

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

Local and hosted Playwright journeys cover source intake, evidence review, manual jobs, composition, concurrent-tab preservation, warning inspection, retained export, AI review and history. Their records are in `evidence.md`, `jobs.md`, `composition.md`, `checkpoints.md` and the relevant AI documents. `mobile-review.md` records actual 390-pixel checks. Earlier journeys use synthetic data. The real USAA intake-to-export journey now passes with 29 explicitly approved Draft acknowledgments and four verified downloads; see `owner-tailoring.md`. A fresh prepared-workspace session then completed in 4 minutes 23 seconds with agent assistance; it excludes first-use intake and unaided Owner timing.

Hosted Agent Credential acceptance passed with real REST/MCP source, evidence and job commands, exact citations, shared idempotency, denied scopes and revoked-credential 401s. See `agent-access.md`.

The following work still prevents V1 release:

- Hosted password recovery. GitHub OAuth now passes real Owner sign-in; the Owner must enter a new password to complete the separate reset journey.
- Production secret/authentication setup, `river.jilva.dev` deployment and final production acceptance. Isolated personal-account D1/R2 resources, all 28 migrations, environment-specific backup handling and an empty production restore are prepared; see `production.md`.

Successful bounded scoring retry and complete canonical result handling now pass: Minimal retains all three six-platform responses, with the badge correctly withheld for failing simulations. Actual phone qualification review also passes. See `template-scoring.md` and `mobile-review.md`.

Hosted finding-review persistence also passes on the existing synthetic checkpoint. The explicitly labeled test decision survives reload and leaves the earlier scoring run Unreviewed; D1 confirms the exact result/finding binding. See `scoring.md`. Different-snapshot comparison suppression has domain-test coverage; no separate hosted journey is claimed.

M5's real-content rendering exit passes for all three starter packs. Minimal and Technical now retain separate one-page USAA checkpoints with complete text validation, visual inspection and unchanged wording/provenance. The original Classic export is preserved. See `owner-tailoring.md`.

The three approved setup actions completed. The later staging UI testing authorization also enabled synthetic source-refinement acceptance/export/structured return/promotion and generated-template visual approval. These now pass; see `source-refinement.md` and `template-generation.md`. Production publication remains separate. Original sources and checkpoint artifacts remain retained. Production storage exists, with no application or domain publication. ACM UTSA remains untouched.

The deployed request-lifetime gate now has a captured Cloudflare `canceled` invocation, a subsequent expected authorization response and a successful authenticated synthetic compile. See `request-lifetime.md`. The approved temporary Agent Credential completed its six-scope hosted journey and is revoked. Fictional claim/job fixtures are archived.


## Staging testing authorization

On 2026-09-05 the Owner authorized overriding staging application UI decisions for testing. Test acknowledgments, lifecycle approvals and state changes may be completed without asking again. Record their test purpose; they do not establish real evidence verification or a production release decision. This authorization applies to staging UI testing. The personal-account boundary, ACM UTSA exclusion and separate production publication gate remain in force.


The optional v2 AI rerun on the complete Owner résumé remains pending explicit OpenAI-transfer permission after automatic approval review rejected that submission. Hosted synthetic v2 generation, bounded retry and exact repeated/Unicode citations already pass. This optional rerun is not an additional release gate or a blocker for the completed manual export.
