# Owner authentication and recovery

Updated 2026-09-05. River uses request-scoped Better Auth 1.7.2 with the D1 Drizzle adapter. Only the configured, verified Owner can obtain an application principal. The required GitHub OAuth method is configured and verified on staging.

Password recovery sends a one-use link through the destination-restricted mail adapter. Requesting a link does not end existing sessions. Completing a reset now sets Better Auth's `revokeSessionsOnPasswordReset` option, which deletes the Owner's existing D1 sessions. The user must sign in with the new password. Agent Credentials remain separate, individually revocable identities.

## Local integration proof

The focused test initially failed because an existing session still authenticated after a successful reset. Enabling session revocation corrected that observed behavior. The test uses only isolated Workers bindings, fictional accounts and captured test-mail delivery; it does not access the Owner's password or email inbox.

`apps/web/test/auth.test.ts` now exercises:

- Unknown and Owner reset requests return the same public response; only the Owner receives test mail.
- The real reset callback resolves to River's reset page with its token.
- Requesting recovery preserves two existing sessions. Completing it invalidates both.
- A too-short password is rejected before token consumption; a valid retry succeeds.
- The old password and reused reset token fail; the new password succeeds.
- An expired token cannot change the password.

The six focused auth, credential and MCP tests passed together. The existing allowlist/verification test and agent scope/revocation tests still exercise the actual application authentication boundary.

The complete Workers suite then passed **142 tests in 25 files**. All six workspace type and lint checks and the staging production build passed. Logs are `/tmp/river-auth-recovery-{red,green,full-tests,types,lint,build}.log`; the initial failure is retained separately from the passing runs.

Reproduce with `pnpm --filter @river/web exec vitest run test/auth.test.ts test/credentials.test.ts test/mcp.test.ts`.

## Hosted acceptance

Commit `dc27521` is deployed to personal staging as Worker version `230d70d0-0600-4020-818c-e46daf72f84a`. The schema and document Container are unchanged.

The Owner has created and verified the staging account and authenticated multiple persisted workflows. Verification email delivery and protected routes are established. The local recovery test alone does not establish hosted reset email delivery or Owner password entry; that separate journey is recorded below. No Owner password was changed by the agent, and no existing staging session was revoked merely by deploying the setting.

The personal GitHub app **River staging** is registered under `joshuasilva414` (app `3839574`, client ID `Ov23liu8Dx6Sb3xJJ5MB`). Its callback is `https://river-staging.jilva.workers.dev/api/auth/callback/github`. The Owner approved secret generation and staging installation, then completed GitHub's Confirm access challenge. The two credentials were installed as staging secrets through a private temporary file, which was removed. Existing secrets were preserved.

A fresh Chrome sign-in authorized only read-only email addresses and profile information. GitHub returned to River and authenticated the existing verified Owner. The protected checkpoint and its retained scoring history load through that session. D1 confirms one password account and one GitHub account linked to the same Owner; no auth tokens, passwords or cookies were inspected. App wildcard matching and device flow remain disabled. The code deployment is `05238d5`; the secret installation created active Worker version `5e0fc3ae-0c56-4f53-93f9-af5b72272d62`. Hosted password-reset completion remains separate.

The approved hosted Agent Credential journey passed real REST/MCP intake, exact citations, shared idempotency, stale-write rejection, scope denial and revocation. Both entry points return 401 after revocation. Fictional claim/job fixtures are archived; see `agent-access.md`.

## Owner-confirmed hosted password reset — 2026-09-05

The Owner replied **“password reset is complete”** to the outstanding hosted recovery check. This confirms completion of the requested email-link and new-password flow. At `2026-09-06T02:37:29Z` (September 5 in America/Chicago), a fresh navigation in the previously authenticated in-app browser to protected checkpoint `01a07463-0ac8-7287-a377-e408a1753763` displayed River's sign-in page instead of checkpoint content.

The hosted evidence consists of the Owner's completion report and the observed protected-route sign-in requirement. The isolated Better Auth/D1 tests above establish old-password rejection, token expiry/reuse behavior and revocation of multiple sessions. The agent did not inspect the password, reset token, cookies or inbox, and did not attempt to sign in with the new password. This closes the staging recovery gate. Production authentication remains a separate final-domain acceptance step.


## Production authentication acceptance — 2026-09-05

Production Worker `6b809303-ccd0-4f1a-b338-3f27ba23783b` uses the separate personal River OAuth app `3839803` and exact callback `https://river.jilva.dev/api/auth/callback/github`. The Owner explicitly approved registration, client-secret generation and installation of all five production secrets, and completed GitHub's Confirm access challenge. A fresh Chrome OAuth flow authorized read-only email/profile access and returned to Job targets on the final domain. The first production backup's isolated restore confirms one verified Owner, `joshuasilva414@gmail.com`. Staging credentials and records were not copied.

An unauthenticated in-app browser submitted Forgot password → Send reset link for that Owner on the production domain. River returned “Check your email for a password reset link.” The Owner confirmed “I got the recovery email” on September 5. This closes final-domain email delivery acceptance. No password, email inbox, reset URL/token or session cookie was inspected. No password was changed. The UI response and separate Owner confirmation establish request completion and inbox delivery. Fresh GitHub sign-in also passed after the final archival deployment, Worker `93fa8303-7f0a-405c-a256-fb8a786188f9`.
