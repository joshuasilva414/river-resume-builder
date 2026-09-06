# Use Better Auth for account authentication

River uses Better Auth with GitHub OAuth and admitted email/password accounts, verification and password recovery. Each account owns an independent private workspace. External agents remain separate scoped identities belonging to one account.

`ADMIN_EMAIL` identifies the service administrator. Additional accounts must appear in `ALLOWED_EMAILS`. The same admission policy applies to signup, new sessions, existing application sessions, agent credentials and authentication mail. Removing an address disables its application access on its next request. Administrator capabilities cover backups and non-production runtime diagnostics; they do not grant access to another user's content.

Sessions are revocable, stored in D1, valid for 30 days, and not duplicated in KV or a cookie session cache. A completed password reset revokes only that account's sessions. Requesting a reset does not. Authentication throttles use D1 so they survive request-scoped auth instances and Worker isolates. The Cloudflare Email Service binding restricts senders; River restricts recipients to admitted accounts.

This extends the original single-owner decision on 2026-09-06. See [multi-user operation](../implementation/multi-user.md) for configuration and verification.
