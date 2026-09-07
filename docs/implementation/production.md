# Production release

Current release: v1.1, published September 6, 2026, as `85da80c2-566f-44da-bd84-0533fb29ac3d`, through migration 0032. OpenAI connection, fictional source/claim/PDF export, data preservation and final backup/restore pass. See [v1.1 production evidence](v1.1-production.md). The records below describe earlier releases.

Updated 2026-09-05 (America/Chicago). V1 is released at https://river.jilva.dev. The Owner approved publication, the personal GitHub OAuth app, all five production secrets and the fictional production acceptance test. Owner sign-in, recovery email receipt, document/export and backup/restore acceptance pass. Staging records were not copied. ACM UTSA is excluded.

The 2026-09-06 private-account extension was deployed as web version `9d3ce1ab-ab71-47cb-93ad-3f7afa3d2aca`, with 31 migrations and 73 base tables. The existing administrator account is preserved and `jilvadev@gmail.com` and `karisamscott@gmail.com` are admitted. See [multi-user operation](multi-user.md) for current deployment and preservation evidence. The detailed V1 release record below remains historical.

## Deployed resources

| Resource | Production identity |
| --- | --- |
| Personal account | `a91c30d69981b341efe3b656a263f6da` |
| Application | `https://river.jilva.dev` |
| Web Worker | `river-production`, version `93fa8303-7f0a-405c-a256-fb8a786188f9` |
| Document Worker | `river-documents-production`, version `02f4fe23-a7f4-4897-966a-192a4f4897c5` |
| Container application | `a03812b3-f348-4754-a11a-f89ee4ab21b8` |
| Container image | `sha256:1aa23e49fbe6e678fb0247e8a9c08bbc691d42ed9cdf417a845ec9b25ae6e807` |
| D1 | `river-production`, `50d255b8-840b-4d03-87d9-c3fb9e810366` |
| Private R2 | `river-production-artifacts` |
| Schema | 29 migrations through `0028_library_archival.sql`; 72 base tables |
| Workflows | 11 production-named bindings; maintenance cron every five minutes |
| Sole Owner | `joshuasilva414@gmail.com` |
| GitHub application | Personal **River**, app `3839803`, client `Ov23liZjSClopimWF5Jz` |
| OAuth callback | `https://river.jilva.dev/api/auth/callback/github` |

The web Worker has no workers.dev or preview URL. The private document Worker has no public route and at most one basic Container instance. Private R2 has no public endpoint. Original sources and checkpoint artifacts remain retained. Transient previews expire after seven days and database backups after 30 days.

Five production secrets are installed: `AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `OPENAI_API_KEY` and `D1_EXPORT_API_TOKEN`. Secret values and temporary credential files are excluded from Git and documentation. The archival deployment preserved the existing secrets.

## Release boundary and validation

The release uses isolated checkout `/tmp/river-production-release-c006a46`. Initial publication was commit `c006a46` (application code `316c2b5`); final archival code is release commit `2754539`, cherry-picked from main commit `b46bc7e`. The main checkout's separate copy commit `868ad7e` and later favicon work are preserved and excluded from this deployment.

All 160 Workers tests in 26 files, domain/template/document unit suites, workspace types, isolated-release lint, and clean staging/production builds pass. Main-workspace lint separately reports a missing title in the unrelated uncommitted favicon; this is outside the released tree. The new archive tests exercise every library kind, concurrent and replayed commands, stale edits, required reasons and immutable draft/checkpoint preservation.

Staging archival version `080f168f-c8d0-4db2-adab-e1a550edb33e` passed archive → restore → archive on an existing fictional item. Its original content revision remained unchanged, all reasons appeared in history, and archived editing was unavailable. Desktop light at 1280px and dark mobile at 390px were visually inspected; temporary viewport settings were reset. A Paper subagent designed `AJ4-0` and `ALY-0` before UI implementation. See `library.md`.

Fresh production GitHub sign-in succeeds after the final deployment. River opens on Job targets, omits Document runtime from production navigation, redirects its diagnostic route and rejects diagnostic service execution. The redundant shared workspace label and Phase 0 badge are absent. The Owner confirmed receipt of the final-domain recovery email. See `authentication.md`.

## Approved production document test

The fixture contains only **River Fictional Acceptance Fixture** in a Classic contact/header section. The job, document and audit reasons explicitly identify it as a fictional deployment test. No real evidence was verified.

| Record | Identity |
| --- | --- |
| Fictional job | `01a074c9-ebe1-7b28-a45c-e04e86a9020a` |
| Draft | `01a074ca-32f5-7a1b-b91a-1d84fb075dcf`, revision 1 |
| Checkpoint | `01a074d8-470e-74c7-96a3-53e49277b30d` |
| Document Operation | `01a074d8-470e-7348-82c5-50b2fc913158` |
| Original review | `01a074d8-470e-7f90-83bf-5f5358af2c69` |
| Export digest | `88cd2598e14b1544a0899ce29ffb57f859135c4fa68413f436ee78c7dc251b61` |

Attempt 1 produced one page in 3020.27ms of document processing. Completeness, multiplicity and reading order all passed. PDF inspection confirmed the expected name; extracted text is exactly that name followed by a newline. The Owner-approved single unsupported-evidence acknowledgment was saved for this checkpoint before export. All four authenticated downloads match their stored SHA-256 digests; anonymous requests to each artifact returned 401.

| File | SHA-256 |
| --- | --- |
| PDF | `f864d4c4fe18dba3decb96c9c07d593bf426082d9d257cdd0eeaa1c809384263` |
| LaTeX | `9a6deb5744cbda8a2ec34facbb416d3d79f9f7adc2fc40dac301fe6c1e5f9f73` |
| Extracted text | `0141fa9c02a49106cd7b7616761fbd1982d74205983ad89fd2428d5633645596` |
| Validation report | `80fe88b30ddbfc38c706894f00950d0f4fbddff089acc8e8880004f7f6247808` |

The fictional job and its three library items are archived with Owner-approved test reasons. Their immutable revisions, original checkpoint and export record are byte-for-byte unchanged from the pre-migration snapshot. The retained checkpoint still displays its PDF, exact text, successful report, acknowledgment and all four download links. Private proof is in `test-results/production-acceptance/proof.json` and `archival-proof.json`; these files are ignored by Git.

## Backup and recovery

The first scheduled production backup succeeded on application attempt 1 at `2026-09-06T03:40:20.659Z`, Operation `01a074cd-5d40-70f2-b262-785b5593743a`. Its retained manifest and isolated restore prove the dedicated token, exact production export endpoint, Workflow dispatch and private R2 finalization. See `recovery.md`.

A fresh post-cleanup manual backup is `backups/database/production/2026-09-06T04-12-08.821Z-379ff4c1-7be8-4095-af6e-d4737492875b/snapshot.json.gz`, SHA-256 `29153be59f8dbac1507dfb10615ddf4e964251a4db27ab3ca2785e5aefc61c7e`. Its isolated local restore passed all 72 table counts, integrity, foreign keys, FTS equality, four artifact hashes and the exported checkpoint. Report: `test-results/recovery/drill-a821db33-aa86-4c43-ae01-dc94e14d4cee/report.json`. No live data was overwritten or restored Operation dispatched.

Reproduce backups with `pnpm backup:production`, inspect a scheduled run with `pnpm backup:status --production`, and restore with `pnpm restore:drill /absolute/path/to/receipt.json --production`. Resource pins enforce the personal account/database/bucket tuple. Each restore creates fresh private local SQLite. Do not use an in-place production restore for an acceptance drill.

## Deployment procedure

Back up before migrations. Apply additive migrations to the explicitly named database/environment. Remove only generated `apps/web/dist`, then build with `CLOUDFLARE_ENV=production pnpm --filter @river/web build`. Inspect the generated account, Worker name, final domain and bindings. From `apps/web`, use `pnpm exec wrangler deploy --config dist/server/wrangler.json`; a preceding `--dry-run` validates the bundle without publication. Staging and production share local generated output, so builds and deployments must be sequential.

Deploy the private document Worker before the web Worker when its contract or image changes. This release changed library archival only; the already verified document Worker and Container were preserved. Rolling back the web bundle can leave the additive archive column in place. Destructive schema or data rollback requires a separately reviewed recovery plan.

Release logs: `/tmp/river-archive-{all-tests,check,release-lint,staging-build,staging-deploy,production-build,production-deploy}.log` and `/tmp/river-final-production-{backup,restore}.log`. Earlier deployment history remains in Git and the per-milestone records. See `release-gates.md` for complete V1 evidence and limitations.
