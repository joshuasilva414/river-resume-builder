# Private accounts

Deployed to staging and production on 2026-09-06. The Owner authorized publication and admitted `jilvadev@gmail.com` and `karisamscott@gmail.com`. The existing release history remains in [implementation status](status.md).

Each admitted account owns one private workspace. There are no teams, memberships, invitations between users, shared documents or collaborative editing. Existing owner IDs and ownership checks remain the data boundary.

## Account access and administration

Set `ADMIN_EMAIL` to the service administrator's email. Set `ALLOWED_EMAILS` to a comma-separated list of additional admitted addresses in the selected environment's `apps/web/wrangler.jsonc` configuration. Matching ignores case and surrounding whitespace. The administrator is admitted automatically. Staging and production currently admit `jilvadev@gmail.com` and `karisamscott@gmail.com`; local development's additional-account list remains empty.

An admitted user opens River, selects **Create account**, supplies their own name and verifies their email. The operator provides the URL directly; this version has no invitation-delivery interface. GitHub authentication retains the same account admission policy. Password recovery remains account-specific, and completing a reset revokes that account's sessions.

Removing an address from `ALLOWED_EMAILS` blocks new sessions, existing application sessions and that account's agent credentials on their next request after the configuration is deployed. It preserves their data. Work already accepted by a Workflow is not cancelled automatically. Re-admitting the address can restore still-valid sessions and credentials; revoke them separately if permanent revocation is required.

Only the administrator can inspect or retry backups and use non-production runtime diagnostics. These restrictions are enforced in services and repositories as well as navigation. Production runtime diagnostics remain disabled. Administrator status does not bypass ownership checks on content or downloads. External agents cannot acquire administrator capabilities.

## Email delivery

Hosted email uses the existing `EMAIL` service binding and `EMAIL_FROM`. Its binding now restricts the sender to `hello@river.jilva.dev`, instead of restricting every recipient to the original owner. Application code checks account admission before sending verification or recovery messages. See Cloudflare's [send-binding configuration](https://developers.cloudflare.com/email-service/configuration/send-bindings/).

Local development writes the latest verification or reset message separately for each recipient under `development/auth/<sha256-normalized-email>/latest.json` in local private R2. Read it with `pnpm auth:mail -- you@example.test`. The helper reads local storage only. Development delivery requires both the development environment and a loopback application origin.

Authentication throttles are stored in D1. The general limit is 60 requests per minute per IP; signup, password-reset requests and verification-email requests each have a five-per-hour limit. Better Auth's endpoint-specific defaults still apply where configured by the library. Cloudflare's connecting-IP header supplies the client identity in hosted environments.

## Processing limits

| Budget | Per account | Whole service |
| --- | ---: | ---: |
| Pending or running tasks | 4 | 16 |
| New tasks per UTC day | 100 | 1,000 |

AI requests, document extraction, rendering, validation and scoring share these budgets. The existing two-active-AI-task limit also remains. Settings → Account & sessions shows the account's daily and active usage.

An SQLite trigger checks every operation insertion in the same transaction as its domain writes. Parallel requests cannot both claim the final slot. Replaying an existing idempotency key consumes no additional task. Failed and cancelled tasks still count toward the daily allowance; ending a task releases its active slot. A newly requested attempt counts again, while retries inside an operation remain bounded by its existing Workflow policy. System database backups are exempt.

Quota failures return a typed 429 error with a public-safe explanation. The failed transaction leaves no partially accepted command. Limits bound task admission, not exact dollar spend or storage retention. Existing payload and Workflow bounds still apply.

## Rollout

1. Configure `ADMIN_EMAIL`, `ALLOWED_EMAILS` and the sender-restricted email binding for the target environment. Keep the current owner's email as administrator to preserve access.
2. Apply D1 migrations through `0030_auth_rate_limits.sql` before deploying the new application. `0029_multi_user_usage.sql` adds operation indexes and quota enforcement; `0030` adds the authentication throttle table. Existing account and content ownership IDs do not change.
3. Deploy the built application and matching configuration using the existing environment-specific deployment procedure. Keep the existing authentication secret, OAuth configuration and private storage bindings.
4. On staging, admit a second test address and verify actual email receipt, verification, recovery and private workspace access. Then repeat the applicable acceptance checks before production rollout.

The new Drizzle snapshots capture the current schema, including earlier hand-written migrations. Runtime migration order remains the numbered SQL files. Do not regenerate or replay historical migrations to deploy this change.

## Hosted deployment

| Environment | Web Worker version | Schema |
| --- | --- | --- |
| Staging | `31075387-924b-4c79-8c74-763065337f00` | 31 migrations through `0030_auth_rate_limits.sql`; 73 base tables |
| Production | `9d3ce1ab-ab71-47cb-93ad-3f7afa3d2aca` | 31 migrations through `0030_auth_rate_limits.sql`; 73 base tables |

Release source is base commit `075b368` plus the multi-user working-tree changes, captured in isolated checkout `/tmp/river-multiuser-release-20260906`. The unrelated uncommitted root-route/favicon changes are excluded. Existing document Workers, Container images, secrets, account IDs and private storage bindings are preserved. Exact release-file hashes and backup receipts are recorded in `deployment.json` and the ignored `test-results/multi-user-deployment/` evidence directory.

Both environments have fresh backups before and after migration. Restoring the snapshots locally passes integrity, foreign-key and FTS checks. Every original production table has exactly the same rows before and after deployment. Staging content is also unchanged; only its authentication verification table differs after the GitHub sign-in probe. The new throttle table accounts for the increase from 72 to 73 tables.

The hosted checks confirm existing administrator sessions, the account usage display, backup controls, production runtime redirection and anonymous REST/MCP/artifact denial. Requests for the newly admitted email reach account-name validation in both environments. These deliberately invalid forms create no account and send no email. An uninvited staging email receives Better Auth's synthetic signup response without creating a user, as covered by the existing auth test. The recipient must create and verify their own account; hosted delivery to the new address has not yet been exercised.

Two deployment corrections are included. The remote D1 API rejected the initial trigger's `CASE` form without applying the migration; conditional `RAISE ... WHERE` statements apply successfully with the same quota behavior. Backup restoration now pauses only the admission trigger while replaying already accepted history, then restores it before committing. Foreign-key and FTS checks remain active. A focused test proves full restoration at the active-task limit and rejection of additional work afterward.

## Verification

Tests use synthetic accounts and isolated local D1/R2 resources. Browser checks ran against a separate QA copy at `http://127.0.0.1:3001`, preserving the existing development database and server.

| Surface | Evidence |
| --- | --- |
| Account lifecycle | `apps/web/test/multi-user.test.ts`: two real Better Auth accounts verify and sign in independently; a reset revokes only the target account; removed admission blocks existing and new sessions. |
| Email | Verification and reset adapters address both admitted accounts; removed recipients receive nothing. The local CLI reads each recipient's own message. Hosted delivery is mocked in the adapter test. |
| Administration | Service tests reject member backup reads/retries and runtime calls. Browser checks show admin controls only for the administrator; a member's direct `/runtime` navigation redirects to jobs. |
| UI isolation | Administrator and member both completed signup, local verification and sign-in. The member's job list is empty; opening the known administrator job URL shows “Job target not found.” Account settings show the member's own name, email and usage. |
| Downloads | Service tests cover private source bytes. Separate authenticated HTTP clients also exercise the actual artifact route: both own downloads return 200 with exact bytes and `private, no-store`; both cross-account requests return 404 without the other account's bytes. Artifact fixtures are synthetic, not newly compiled PDFs. |
| Background jobs | Two actual `DocumentWorkflow` instances run together and retain their respective source extraction results. Cross-account inspection fails. The external extraction adapter is synthetic; Workflow loading, storage and publication are real. |
| MCP | Real scoped bearer credentials execute MCP requests; one account cannot read or mutate the other account's evidence. Removing admission also disables that account's agent access. |
| Usage | `apps/web/test/usage.test.ts`: parallel admission, replay, cancellation, account/service limits, UTC reset, exempt backups and transactional rollback. Auth throttles persist across separately created auth instances. |

The member settings page was visually inspected at desktop size with no console errors or warnings in a fresh browser tab. Actual hosted multi-recipient email delivery and GitHub OAuth were not repeated during this extension. The document compiler code is unchanged; its Container build passes, while the isolation tests use the synthetic extraction adapter described above.

Final validation:

- `pnpm test`: 211 tests pass in the isolated release, including 170 Workers tests in 28 files and the new backup-restoration test. Backup scheduling also passes with an uppercase administrator-email fixture.
- `pnpm check`: all six packages pass.
- `pnpm --filter @river/web build`: passes.
- `WRANGLER_DOCKER_BIN=/Applications/Docker.app/Contents/Resources/bin/docker pnpm --filter @river/documents build`: Worker and Container dry-run build passes. The root Turbo build does not forward this Docker-path variable, so builds were verified directly per application.
- The isolated release passes whole-workspace lint, both hosted environment builds and deployment dry runs. `git diff --check` passes. Main-checkout lint still reports the unrelated untracked favicon's missing accessible SVG title; that file is excluded from the release.
