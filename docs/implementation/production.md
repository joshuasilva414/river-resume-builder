# Production activation

Updated 2026-09-05. The Owner approved production publication, explicitly approved the new personal River OAuth app, and explicitly approved all five production secrets. Both Workers, the document Container, 11 Workflows and https://river.jilva.dev are live in the personal account. Owner GitHub sign-in and production diagnostic exclusion pass. Final document/export and backup acceptance are in progress. Staging records were not copied; ACM UTSA remains excluded.

## Resource identities

| Resource | Production value |
| --- | --- |
| Account | `a91c30d69981b341efe3b656a263f6da` |
| D1 | `river-production`, `50d255b8-840b-4d03-87d9-c3fb9e810366` |
| Private R2 | `river-production-artifacts` |
| Configured web Worker | `river-production` |
| Configured document Worker | `river-documents-production` |
| Intended application origin | `https://river.jilva.dev` |
| Sole Owner allowlist | `joshuasilva414@gmail.com` |

D1 and R2 were created in ENAM. D1 read replication is disabled. All 28 migrations, 0000 through `0027_source_upload_checks.sql`, applied to the empty database. Read-only verification found 72 base tables, zero users and zero sources. R2's managed public URL is disabled and its custom-domain list is empty. Original sources and checkpoint artifacts have no expiry rule; transient document/source/template previews expire after seven days, database backups after 30 days. The existing multipart-abort rule is preserved.

Both Wrangler files define separate production environments. The web configuration has 11 production-named Workflows, production D1/R2 bindings and an RPC binding to the private production document Worker. The web `workers.dev` and preview URLs are disabled; the sole configured route is the custom domain `river.jilva.dev`. The document service has no public route and limits its Container to one basic instance. These declarations do not publish any application resource.

## Backup isolation and proof

`config/backup-resources.json` pins the personal account/database/bucket tuple for each environment. Scheduled exports require an exact environment/tuple match plus the dedicated token and Workflow binding. Captured Workflow steps retain the selected tuple. Earlier staging-only captured steps remain compatible; they cannot resume as production. Export object prefixes, retained manifests and isolated restores must match the selected environment. Deployment tests compare the actual Wrangler bindings against the shared pins.

Manual backup uses `pnpm backup:production`. Daily status uses `pnpm backup:status --production`; a completed date can be added after that flag to save its receipt. Restore uses `pnpm restore:drill /absolute/path/to/receipt.json --production`. Existing staging commands retain their defaults. All restores exclusively create a fresh local SQLite file and never change a live database.

The initial production backup is `backups/database/production/2026-09-05T22-24-55.085Z-75c41e87-e83f-4912-af64-fcffa049ddb7/snapshot.json.gz`, SHA-256 `d207e21eff8e0da0fef73d5d150cc0af7ff58573d78b1e2f7dfb0cefa43a19a9`. Its fresh private local restore passed integrity, foreign keys, exact FTS equality and all 72 table counts. Report: `test-results/recovery/drill-8d0a7065-7cb4-47ef-bafa-f73885899601/report.json`. It contains no source objects, citations or exports because production is empty. The updated scripts also restored the existing populated staging snapshot into a new local database: 72 tables, 88 retained objects, seven exact citations and one exported checkpoint. Its report is `test-results/recovery/drill-7b510481-1ba0-4fd1-8688-76110d94b38b/report.json`. Staging’s completed daily backup and three-attempt history were unchanged. Selecting this production snapshot as staging was also rejected before creating a local database.

## Build and release boundary

All 149 isolated Workers tests in 26 files, workspace types/lint and both environment builds pass. The 15 focused backup/deployment tests cover both resource tuples, exact export endpoints, mixed-environment rejection and retained-artifact checks. Production web and document Wrangler dry runs passed without uploading code or building a new Container.

To reproduce the web dry run, build with `CLOUDFLARE_ENV=production pnpm --filter @river/web build`, then run `pnpm exec wrangler deploy --config dist/server/wrangler.json --dry-run` from `apps/web`. For the document service, run `pnpm exec wrangler deploy --env production --dry-run --containers-rollout=none` from `apps/documents`. Both web environments share the local output directory: wait for a build or dry run to finish before starting another environment. Remove only generated `apps/web/dist` before the release build, then inspect the generated account/name/bindings before deployment. A release inspection found 52 duplicate-named server modules and six extra client files; cleaning the generated output removed them. Their origin was not established. No source files changed during cleanup.

Public launch still requires the open gates in `release-gates.md`: production credentials, publication approval and final-domain acceptance. The Owner has confirmed hosted staging password-reset completion. Prepared-workspace timed tailoring, real exports, hosted agent access, source refinement and successful scoring retry also pass. Production needs its own authentication secret, an explicitly approved production secret installation, production OAuth callback settings, and a separate Owner bootstrap. Staging-only secret approval does not authorize copying its credentials to production. Deploy the private production document service before publishing the web application; then verify authentication, retained export, background recovery, email delivery and a real daily backup on the final domain. Production scheduled backups are currently inactive because no production Worker or secrets exist.

## Current release candidate dry runs — 2026-09-05

The web production build/dry run passes for code `9eb25db`. The unchanged private document Worker dry run passed at `528a60e`. No production resource was published or secret installed. Logs: `/tmp/river-production-current-build.log`, `/tmp/river-production-current-dry-run.log` and `/tmp/river-production-current-documents-dry-run.log`. The shared web build directory currently contains production output; rebuild explicitly for staging before any further staging deployment.

## Proposed production activation

The reviewable target is `https://river.jilva.dev`, sole Owner `joshuasilva414@gmail.com`, on personal Cloudflare account `a91c30d69981b341efe3b656a263f6da`. The web configuration now pins `ATS_SCREENER_ORIGIN=https://ats.jilva.dev` for production. Three deployment-configuration tests, focused Biome and the final production build/dry run pass. Logs: `/tmp/river-production-final-{config-tests,build,dry-run}.log`. The document Worker dry run is unchanged. No production publication occurred.

Activation would deploy the private `river-documents-production` service with its one configured basic Container, then `river-production` with 11 isolated Workflows and the final-domain route. It would create a separate personal GitHub OAuth application named **River** with homepage `https://river.jilva.dev` and callback `https://river.jilva.dev/api/auth/callback/github`. Production needs a newly generated `AUTH_SECRET`, this application's client ID/secret, and approved installation of `OPENAI_API_KEY` and `D1_EXPORT_API_TOKEN` from the existing local secret file. Secret values are excluded from documentation and Git.

The prepared production database is empty. Activation does not copy staging records, acknowledgments, test evidence or exports. The Owner then signs in on the final domain for bootstrap, and the deployed authentication, document export and scheduled backup checks complete before V1 is declared released.

The personal GitHub **River** registration form was prepared with those exact values. Wildcard redirects and device flow were disabled; expiring user access tokens retained the default enabled setting. **Register application was not submitted.** That browser tab is no longer open, so registration must be reopened and checked after approval. Production credential creation/installation and publication remain pending the separate approval. The final staging acceptance backup/restore passes 148 objects and four exports; see `recovery.md`.

## Approved landing and diagnostic cleanup — 2026-09-05

The Owner approved Job targets as the landing screen and restricted Document runtime to staging/local development. Commit `316c2b5` redirects `/` to `/jobs`, moves the diagnostic screen to `/runtime`, removes the shared header's Personal workspace label and removes the Phase 0 badge. Production navigation omits Document runtime, and authenticated production visits to `/runtime` redirect to `/jobs`. Diagnostic list/compile services reject production execution with typed NotFound errors before persistence or dispatch. Regular checkpoint compilation, export and shared cancellation remain available.

A Paper subagent first updated production Job targets `NG-0` (header `NH-0`, navigation `O5-0`), staging/local runtime `AGI-0` (header `AGJ-0`, heading `AH9-0`, sidebar `AH4-0`) and the shared Evidence bank shell reference `14H-0`. The existing 64px header and 204px sidebar are preserved. The design handoff preceded the UI changes; affected nodes were screenshot-reviewed and finalized.

Eight isolated auth/credential/checkpoint tests, web type/lint checks, staging build and production build/dry run pass. The production rejection checks use an authenticated Owner and verify no extra document operation is created. Hosted staging Worker `491fc65f-90e8-4793-8654-1d40d4e7c112` passes `/` → Job targets, Active/Archived filtering, `/runtime` navigation and logo → Job targets. Browser checks cover 1280px desktop, the 782px runtime reference and 390px mobile navigation. The mobile document width is exactly 390px; screenshots show both removed labels absent and no clipping in the landing screen. No application console warnings/errors were reported. Light/dark appearance was inspected and the temporary viewport/theme changes were reset.

Logs: `/tmp/river-runtime-access-tests.log`, `/tmp/river-runtime-types-final.log`, `/tmp/river-runtime-lint.log`, `/tmp/river-runtime-build.log`, `/tmp/river-runtime-deploy.log`, `/tmp/river-runtime-production-build.log` and `/tmp/river-runtime-production-dry-run.log`. The shared build directory now contains production output. These production checks upload nothing; final-domain browser acceptance remains pending publication approval. No production resources or credentials were activated.


## Approved activation in progress — 2026-09-05

Production approval is received. New uncommitted UI/copy edits were present in the main workspace, so release commands use the isolated detached checkout `/tmp/river-production-release-c006a46` at tested commit `c006a46` (application code `316c2b5`). Those unrelated edits remain untouched. Frozen offline dependency installation, the production web build and its Wrangler dry run pass. The generated bundle pins the personal account, production D1/R2, 11 production Workflows, final domain and private document service. Logs: `/tmp/river-production-release-{install,build,dry-run}.log`.

The private document deployment completed: Worker `river-documents-production`, version `02f4fe23-a7f4-4897-966a-192a4f4897c5`; Container application `a03812b3-f348-4754-a11a-f89ee4ab21b8`, image `sha256:1aa23e49fbe6e678fb0247e8a9c08bbc691d42ed9cdf417a845ec9b25ae6e807`. It has one basic instance maximum and no public route. Log: `/tmp/river-production-release-documents.log`. A successful deployment does not yet prove a production document job.

Automatic approval review initially rejected OAuth registration as insufficiently specific. The Owner then explicitly approved registration, secret generation and production installation. GitHub created personal OAuth app **River**, application `3839803`, client ID `Ov23liZjSClopimWF5Jz`, with the exact homepage and callback above. Wildcard matching and device flow remain disabled. The Owner completed GitHub confirmation, and the generated client secret was captured in a mode-0600 temporary installation file without printing it. No secret value is recorded in Git. Automatic approval review then rejected the five-secret deployment because it considered the existing OpenAI/D1 permissions staging-only. The Owner subsequently approved installation of all five named secrets; publication then completed as recorded below. Earlier unpublished-resource statements in this document describe the pre-approval preparation history.


## Published final domain — 2026-09-05

After explicit approval of all five named secrets, web version `6b809303-ccd0-4f1a-b338-3f27ba23783b` deployed to `https://river.jilva.dev` with 11 Workflows and the five-minute reconciliation/backup schedule. `wrangler secret list --env production` confirms AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, OPENAI_API_KEY and D1_EXPORT_API_TOKEN. The authentication secret is newly generated; the personal production OAuth app is separate from staging. Temporary credential files were deleted after installation, and the generated secret is no longer displayed in the browser. Log: `/tmp/river-production-release-web.log`.

A fresh Chrome OAuth flow requested only read-only email addresses and profile information, returned to the final domain, and bootstrapped the sole Owner `joshuasilva414@gmail.com`. The landing page is Job targets. Authenticated `/runtime` redirects to `/jobs` and the diagnostic navigation link is absent. Anonymous `/api/v1/me`, `/api/v1/jobs` and `/mcp` return 401; `/sign-in` returns 200 and `/runtime` redirects to sign-in. An initial probe of nonexistent `/api/v1/identity` returned 404 and is not counted as an authentication check.

A clearly labeled fictional acceptance job, empty draft, name Content Item and contact Block were created through the UI. Automatic approval review paused the Section save because production test writes need explicit permission beyond publication. Approval was requested for completing compilation, test-only unsupported-content acknowledgment, four-artifact export/download and archival. No real evidence is involved; no document acceptance is yet claimed.


The first manual post-publication backup retains all 72 base tables at `backups/database/production/2026-09-06T03-38-37.323Z-3f20c91e-1778-466e-bf8a-3a41ce59d8f2/snapshot.json.gz`, SHA-256 `0877685ad54cea93b763bfa941f18e67ed01f4c567a791682be8685db071da11`. Its isolated local restore passes integrity, foreign keys, FTS equality and table counts. Report: `/private/tmp/river-production-release-c006a46/test-results/recovery/drill-19a7db6f-8604-4fe9-82d6-8ec6a2663276/report.json`. There are no retained document objects, citations or exports yet. The latest scheduled-backup status is empty; the cron is installed, but a successful automatic export is not yet claimed. Logs: `/tmp/river-production-activation-{backup,restore}.log` and `/tmp/river-production-daily-status.log`.
