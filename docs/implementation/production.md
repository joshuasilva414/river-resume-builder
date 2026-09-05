# Production preparation

Updated 2026-09-05. Production storage exists in the personal Cloudflare account, but the application is unpublished. No production Worker, Workflow, Container, Owner account, secret installation or custom-domain activation is claimed. Staging records were not copied into production. ACM UTSA remains excluded.

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

Public launch still requires the open gates in `release-gates.md`: Owner review and real tailoring acceptance, approved provider/authentication setup, and hosted credential/scoring checks. Production needs its own authentication secret, an explicitly approved production secret installation, production OAuth callback settings, and a separate Owner bootstrap. Staging-only secret approval does not authorize copying its credentials to production. Deploy the private production document service before publishing the web application; then verify authentication, retained export, background recovery, email delivery and a real daily backup on the final domain. Production scheduled backups are currently inactive because no production Worker or secrets exist.
