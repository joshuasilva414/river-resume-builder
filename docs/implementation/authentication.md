# Owner authentication and recovery

Updated 2026-09-05. River uses request-scoped Better Auth 1.7.2 with the D1 Drizzle adapter. Only the configured, verified Owner can obtain an application principal. GitHub OAuth remains a required V1 method. Registration and staging credential installation are approved; GitHub identity verification currently blocks secret generation.

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

## Hosted acceptance limits

Commit `dc27521` is deployed to personal staging as Worker version `230d70d0-0600-4020-818c-e46daf72f84a`. The schema and document Container are unchanged.

The Owner has created and verified the staging account and authenticated multiple persisted workflows. Verification email delivery and protected routes are established. This local recovery test does not establish hosted reset email delivery or Owner password entry. Completing that journey requires the Owner to enter a new password in the existing reset page. No Owner password was changed by this work, and no existing staging session was revoked merely by deploying the setting.

The personal GitHub app **River staging** is registered under `joshuasilva414` (app `3839574`, client ID `Ov23liu8Dx6Sb3xJJ5MB`). Its callback is `https://river-staging.jilva.workers.dev/api/auth/callback/github`. The Owner approved secret generation and staging installation; GitHub currently requires the Owner to complete its Confirm access challenge. No client secret is installed yet.

The approved hosted Agent Credential journey passed real REST/MCP intake, exact citations, shared idempotency, stale-write rejection, scope denial and revocation. Both entry points return 401 after revocation. Fictional claim/job fixtures are archived; see `agent-access.md`.
