# Backup, restore, and deployment recovery

Updated 2026-09-05. All commands target the personal River account. Staging and production use separate pinned D1/R2 resources; ACM UTSA is unsupported. Production storage and its empty-schema restore are prepared, but its application and scheduled backups are unpublished. See `production.md`.

## Backup

Run `pnpm backup:staging` or `pnpm backup:production` with the existing Wrangler login. It reads the applied migration list and base-table catalog, exports every base table in one D1 snapshot, and verifies that schema identities did not change during export. It packages exact migration SQL with the exported data, checks an isolated restore, and stores a compressed snapshot under `backups/database/<environment>/` in that environment’s private R2 bucket. The local receipt contains its immutable key and SHA-256 digest. Private local files are ignored under `test-results/recovery/`; Wrangler export output is withheld because it contains a temporary signed download URL.

D1 full exports do not support virtual tables. River's verified export selects the base tables together and excludes the derived FTS5 tables. Restore recreates the schema and triggers before importing data, which rebuilds search without dropping or changing the live index. An export briefly blocks other D1 queries. Run it outside an active migration. See [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Both environments’ R2 lifecycle rules are `river-preview-seven-days` on `transient/previews/`, `river-template-preview-seven-days` on `transient/template-proposals/`, `river-source-preview-seven-days` on `transient/source-proposals/`, and `river-backup-thirty-days` on `backups/database/`. Original source, processing, and checkpoint objects use retained prefixes without expiry. Existing multipart-abort retention is preserved. Local snapshots are not automatically expired: remove a private local recovery directory explicitly when it is no longer needed.

**The Owner-approved dedicated token is installed on staging, and a live daily backup plus isolated restore passed.** Token activation and access to the pinned personal database were verified without printing credentials. Existing interactive Wrangler OAuth credentials must not be copied into a Worker secret. Both environments pin `BACKUP_ACCOUNT_ID`, `BACKUP_DATABASE_ID`, and `BACKUP_BUCKET_NAME`; the complete tuple must match the selected environment in `config/backup-resources.json`. Scheduled production export is implemented but inactive until a production Worker and explicitly approved secrets exist. Development export remains disabled.

Create a custom token from Cloudflare **My Profile → API Tokens** named `River staging backups`. Select **Account → D1 → Edit** and restrict Account Resources to the specific personal account; exclude ACM UTSA. Do not add a workstation IP filter to a token used by a Worker. D1 Edit permits database reads and writes in that account; River's backup code uses the export endpoint against the selected environment’s pinned database. The existing token installation is authorized for staging only. Store the value as `D1_EXPORT_API_TOKEN` in the ignored `apps/web/.dev.vars`, then install it as a staging Worker secret without printing it. A token's existence does not establish a successful backup: verify a completed retained manifest and a fresh isolated restore. See [Cloudflare's token setup](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).

The five-minute scheduler records one `database_backups` row per UTC date, its Operation, dispatch, and system audit atomically. Concurrent deliveries reuse the same Operation. A failed run remains inspectable; the following UTC day has a new identity. Without a confirmed retained manifest, use the manual backup command rather than assuming the day is protected.

`BackupWorkflow` bundles the exact applied migration SQL, captures the base-table catalog, and requests one D1 data-only export for those tables. It polls at most 60 times per attempt with one second between polls; API calls have a ten-second timeout. Export/download/upload has three attempts with a two-minute step timeout and ten-second retry delay. Other persistence steps have three attempts, a 30-second timeout, and five-second retry delay. The generic ten-minute Operation reconciler remains an outer recovery bound.

SQL streams through SHA-256 hashing and a fixed-length stream into private R2. Download requires an explicit positive content length no greater than 64 MiB and has a 30-second timeout. Raw SQL and signed URLs never become Workflow step output. An interrupted finalization can reuse the immutable uploaded SQL without another export. The schema is checked again before retaining `manifest.json`; migrations during export prevent completion. The `river-d1-export-v2` manifest records exact migration SQL/hashes, resource identities, table catalog, and SQL key/hash/size. Both files live under one `backups/database/<environment>/<date>-<operation>/` prefix and expire after 30 days. Completion publishes the manifest reference and Operation outcome atomically.

Run `pnpm backup:status` to inspect staging’s last seven daily runs without printing SQL or credentials. Add `--production` to select production. A date after the environment flag, such as `pnpm backup:status --production YYYY-MM-DD`, saves a completed run’s private local receipt. Pass it to `pnpm restore:drill` with the matching environment.

Settings → Backups implements Paper's daily status, preserved attempt inspection, paged UTC dates, configuration availability, safe diagnostic copy and inline operator reference. Failed or Cancelled attempts can be retried explicitly, with three total application attempts per UTC date. Internal Workflow step retries do not consume this count. Each application retry atomically guards the observed attempt and terminal state, then commits a new Operation, immutable artifact prefix, dispatch, audit and permanent idempotency outcome. Old attempts remain available, late completion cannot replace a newer attempt, and successful dates cannot be retried. Exhaustion never resets from another idempotency key or cancellation.

Last retained success is checked independently from the latest attempt: its manifest hash, data object availability/size and 30-day object expiry must pass. Missing artifacts are not labeled retained. Transfer failures expose only fixed stage names; SQL, signed URLs and raw provider errors remain private. Twelve focused Workers tests cover dispatch deduplication, atomic retry races and rollback, permanent replay, owner isolation, cancellation and attempt limits, date pagination, immutable artifact recovery, both exact export endpoints, mixed-environment rejection, missing artifacts and safe diagnostics. Three deployment tests also compare actual bindings with the resource pins. Workspace types, lint and staging build pass. Hosted Settings was inspected in light/dark appearance; its explicit retries preserved both failed attempts and displayed the third attempt's retained success.

The second hosted attempt `01a071e2-a35f-7d71-bbfb-f4960c30aabe` isolated the failure to request construction. The pinned Workers runtime rejects `redirect: "error"`; a synthetic `Request` reproduced its exact error. Downloads now use `manual`, and all non-success statuses (including 3xx) are rejected without following the signed request. Tests now construct a real Workers `Request` around synthetic transport responses and exercise redirect rejection. The token and private resources did not cause this failure.

The third attempt `01a071e7-d9a3-78b2-be1d-90eb11efb542` completed on 2026-09-05 at 14:10:20 UTC. Its immutable manifest hash is `61e94d315ad7405cd4be661b63b3b91e15fe3703eaac0459099902ff4387f126`. The date remains permanently completed with all three Operations retained. The receipt is `test-results/recovery/receipt-2026-09-05-4639902f-2a9a-485f-bf04-8157ec763ed2/receipt.json`.

## Isolated restore drill

Run `pnpm restore:drill /absolute/path/to/receipt.json` for staging; append `--production` for production. The receipt prefix and captured resource tuple must match the selection before restore. The command supports both the original compressed `river-d1-snapshot-v1` backup and the streamed `river-d1-export-v2` manifest plus SQL. It verifies receipt and SQL hashes, and requires both streamed files to share their exact backup prefix. It exclusively creates a fresh local SQLite file; existing files cannot be overwritten. It recreates exact migrations, imports with foreign-key checks enabled, and verifies database integrity, table counts when captured, foreign keys, and exact FTS equality. It derives every retained source/processing/document reference from the restored snapshot, verifies source/processing digests, checks citation offsets against exact processing results, and checks all four files for exported checkpoints. The local report includes object hashes and counts without candidate content or credentials.

The first drill passed with 39 base tables, one exact citation, 14 retained objects, and one exported checkpoint. Its receipt and report identities are in `deployment.json`. A second streamed-format drill, derived from an actual 42-table staging export, also passed with one exact citation, 14 retained objects, and one export. It verifies the v2 manifest/SQL recovery path; it does not claim a live token-driven Workflow export. The restored databases remain local and unpublished. This verifies SQL/provenance/artifact recovery, not a production D1 cutover or application login against restored data.

The fresh daily-Workflow drill passed against migration 0018: 58 base tables, exact FTS equality, foreign keys, one exact citation, 30 retained objects and one exported checkpoint. It verified retained template fixture artifacts as well. The report is `test-results/recovery/drill-5c9c1ca1-e8b9-43d5-a8db-569121966589/report.json`. This was a new permission-restricted local database; staging resources and data were not overwritten.

For a later remote cutover, create new personal River D1/R2 resources, apply the captured schema and data, rebuild FTS, copy/verify retained objects, and validate the application with dispatch disabled. Restored Pending/Running Operations refer to old Workflow executions. Do not automatically redispatch them during a drill. Revoke restored sessions and credentials before a real cutover when recovering from a security incident. Switch application bindings only after a reviewed validation result; keep the old resources until the new deployment is verified.

## Time Travel

Time Travel is automatically enabled on supported D1 storage; it is separate from daily R2 exports. The current staging bookmark was read successfully and recorded in `deployment.json`. Cloudflare documents up to 30 days on Workers Paid and seven days on Free. An in-place Time Travel restore overwrites current database state, so this run did not perform one. See [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## Deployment and diagnosis

Build with `CLOUDFLARE_ENV=staging pnpm --filter @river/web build`. Apply additive migrations with the explicitly named `river-staging` database and staging environment. Deploy the private document Worker/image before the web Worker when the document contract changes. Record both Worker versions and the image digest. Hosted acceptance must exercise the authenticated document path; a successful deploy alone does not prove Container startup or template compatibility.

Workflows start only after Operation/dispatch persistence. The five-minute reconciler retries dispatch using the stable Operation identity, finalizes completed uploads, and marks interrupted active work failed without changing captured input. Inspect a specific Operation/Workflow rather than enabling broad content logging. Workflow step input inspection can expose private document content; use only appropriately scoped diagnostics. Application logs must omit source text, proposals, authentication secrets, and signed URLs.

During an incident, check Worker version, bindings, D1 migration version, exact Operation state/stage, Workflow state, Container deployment health, and R2 manifest completeness. New code cannot safely roll back across an incompatible schema migration without a migration-specific recovery procedure. Preserve the database and immutable objects before a destructive migration or in-place restore. Renderer retries must honor the checkpoint's pinned templates; a new renderer must not silently reinterpret historical input.

Document protocol `river-document-runtime-v2` attaches a fixed protocol identifier to internal HTTP responses. Failed jobs include only an allowlisted process stage: input validation, preparation, compilation, extraction, validation, resources, output, or bounded timeout. The Worker retains these safe identifiers in its error without reading the response payload or compiler stderr. An unidentified protocol may be an earlier image; it does not by itself prove a rollout failure. Build contexts exclude generated test results and coverage. The offline fixture suite proves malformed-input and prohibited-source diagnostics return only generic error bodies and preserve all existing rendering checks.

Cloudflare activates Worker code before its Container rollout completes. A successful deploy starts the rollout but does not establish that every request reaches the new image. Check the actual hosted contract after deployment; preserve a failed candidate for bounded retry. See [Container rollouts](https://developers.cloudflare.com/containers/configuration/rollouts/).

## Migration 0025 restore proof — 2026-09-05

A fresh post-migration backup retained all 67 base tables under `backups/database/staging/2026-09-05T18-25-28.476Z-f3dd7261-ab8f-4c28-9435-9c8fdb45bcd5/snapshot.json.gz`, with SHA-256 `6effb22143e001f3a86ebb4331b043e867586b4199addc1ae752917de3511f2b`. A separate fresh local restore passed schema/data integrity, exact FTS equality, foreign keys, one citation, 50 retained objects and the original exported checkpoint. Its report is `test-results/recovery/drill-c08c37e9-a550-410c-bbed-bc1b126aa1d5/report.json`. Pending/failed Operations were not redispatched, and no remote data or bindings changed.


## Template qualification schema restore — 2026-09-05

Before deploying commit `570278e`, the 67-table migration-0025 staging database was backed up to `backups/database/staging/2026-09-05T19-10-28.465Z-01c5d448-1fb1-40a5-88f3-68d41478c8d7/snapshot.json.gz` (SHA-256 `7db0f144a783ebeca0aadb991be8c52ce8ae3bc9f96611159b984e40cb61755e`). The additive migration `0026_template_scoring.sql` applied successfully.

The new 71-table snapshot is `backups/database/staging/2026-09-05T19-12-36.488Z-22730f37-6741-481b-a4d8-c3c9e69ea8e8/snapshot.json.gz` (SHA-256 `c298bdec91b98172f953e4699e9d698c495301ad706a347a1efed8df94991666`). The isolated local drill passed FTS equality, foreign keys, one exact citation, 50 retained objects and one exported checkpoint. Receipt: `test-results/recovery/2026-09-05T19-12-36.488Z-22730f37-6741-481b-a4d8-c3c9e69ea8e8/receipt.json`; report: `test-results/recovery/drill-695926dd-7ddc-4094-82d6-28fd700b0051/report.json`. Private artifacts remain ignored by Git. No remote cutover or restored operation dispatch occurred.

Restore discovery includes every hashed PDF, LaTeX, text and validation file referenced by `template_scoring_fixtures.document`. Staging has no qualification records while the provider remains unconfigured; a drill with a populated live qualification remains part of provider verification. Logs: `/tmp/river-template-score-predeploy-backup.log`, `/tmp/river-template-score-postdeploy-backup.log`, `/tmp/river-template-score-restore.log`.

## Hosted AI review recovery — 2026-09-05

After completing source, job and duplicate AI review and archiving their fictional fixtures, a fresh backup retained all 71 base tables. The first attempt failed at its initial Wrangler query before export; a read-only `SELECT 1` succeeded and one retry completed. No cause was recovered from the deliberately withheld first error.

Snapshot: `backups/database/staging/2026-09-05T20-19-12.806Z-8e33bcfd-ab53-4731-a09a-5b0bb3589f57/snapshot.json.gz`; SHA-256: `479046cc41f6de480a5d648bec2201ac06d3f64cfa624c9e209189f2e6194130`. The separate unpublished restore passed schema/data integrity, FTS equality, foreign keys, four exact citations, 52 retained objects and one exported checkpoint. Report: `test-results/recovery/drill-c0e5929b-afb8-44f8-9b6f-a8a09318e47d/report.json`.

Read-only inspection of that restored database also confirmed both archived fictional Claims, the rejected source candidate and rejected ranking with null payloads, and populated source/job/duplicate task and proposal tables. This snapshot still has no live scoring records. No remote database was replaced and no restored Operation was dispatched.

## Upload recovery migration — 2026-09-05

Commit `9c1b54b` adds maintenance-only `source_upload_checks` in migration 0027. It applied locally and to staging after retaining a 71-table backup. The post-migration 72-table snapshot is `backups/database/staging/2026-09-05T21-12-17.743Z-ca553c58-757a-4158-b00f-b7f9fcff8bb8/snapshot.json.gz` (SHA-256 `15399950cb1f6d31a9c36c6ce9ddcba9265f3e4c4ed466600fd58e909a87042e`). Its captured migrations and data passed the backup script’s fresh local SQLite integrity, foreign-key and FTS checks. The full remote-object drill was not repeated for this maintenance table. Original and processing references are unchanged. Exact deployment and pre-migration backup identities are in `deployment.json`.

## Hosted clarification recovery — 2026-09-05

After the live clarification journey, a fresh migration-0027 snapshot retained all 72 base tables at `backups/database/staging/2026-09-05T21-44-03.787Z-9ac04d09-7d83-4941-8a09-bce41e3fc6e5/snapshot.json.gz` (SHA-256 `61032a4bade7d19479849ddf277004e26dcfd2185a9d5c7678e42e5d07b8f20a`). The separate isolated restore passed integrity, foreign keys, FTS equality, seven exact citations, 88 retained objects and one exported checkpoint. Report: `test-results/recovery/drill-8737128a-75ee-4df3-b354-c5038a23f504/report.json`.

Read-only assertions against the restored database confirmed the clarification's original and answering Evidence Revision identities, the exact answering source/processing pair and offsets 102–230, archived Draft state, zero verification decisions and the rejected sibling's null payload. This supersedes the earlier maintenance-table-only restore coverage. Scoring records remain unpopulated. No remote database was overwritten and no restored Operation was dispatched. The successful daily backup date and its three-attempt history were unchanged; this was a separate manual snapshot.


## Separate production resources — 2026-09-05

Commit `a797477` makes manual and scheduled backups select exact environment-specific resource tuples. Both environments share validated infrastructure pins; mixed database/bucket settings, mismatched manifest prefixes and cross-environment restores are rejected. Staging’s earlier captured Workflow steps and CLI defaults remain compatible. All 149 Workers tests pass.

The clean staging deployment is `8362a12e-d080-42fb-8588-1a4c157b2dd0`. The original successful daily backup still appears retained with all three attempts preserved. A fresh compatibility restore of the populated staging snapshot passed with 72 tables, 88 objects, seven exact citations and one export; report `test-results/recovery/drill-7b510481-1ba0-4fd1-8688-76110d94b38b/report.json`. Empty production storage also passed its own 72-table backup and isolated restore. No production application or scheduled backup is active. See `production.md` for resource identities, commands and publication gates.

## OAuth and live scoring restore — 2026-09-05

After the approved OAuth setup and real scoring acceptance, a fresh private staging snapshot retained all 72 tables at `backups/database/staging/2026-09-05T23-44-30.457Z-ec37af2f-7f03-4549-bd23-5a557f136362/snapshot.json.gz` (SHA-256 `11370a748cd35d5d7edd958f4aa3cce11dbde5520b2ddc2eb04946d7013f8f16`). The separate unpublished restore passed integrity, foreign keys, exact FTS equality, eight exact citations, 98 retained objects and the original exported checkpoint.

Report: `test-results/recovery/drill-1b616dbe-170a-488e-9db1-6e29015be5cd/report.json`. Additional read-only assertions confirmed both completed scoring runs, exact 17/95-unit captured inputs, all six results, SHA-256 equality for each complete canonical raw response, unchanged scoring identity on the cached result, and matching platform scores. The restored Owner retains both password and GitHub account linkage. No credential values were printed, no remote data was replaced, and no restored Operation was dispatched. Template qualification is still unpopulated; this is checkpoint-scoring recovery proof.

Logs: `/tmp/river-approved-scoring-backup.log` and `/tmp/river-approved-scoring-restore.log`. This manual snapshot preserves the earlier daily backup's date and three-attempt history.


## Real Owner export and populated qualification restore — 2026-09-05

The post-export manual snapshot retained all 72 base tables at `backups/database/staging/2026-09-06T00-44-21.561Z-45d4c002-e71b-4fa7-9e65-1ae389d11140/snapshot.json.gz` (SHA-256 `eba804e50673b8129edf521507200498ee9631d158dd3d4ed12538aecda31839`). The UTC key falls on September 6; the Owner's America/Chicago date remains September 5. The first attempt failed before export at its catalog query. A read-only connection check passed and one retry succeeded; the original failure's cause remains unknown. No daily attempt count was changed.

The isolated unpublished restore passed schema/data integrity, foreign keys, exact FTS equality, 24 exact citations, both exported checkpoints and all 140 retained objects. Report: `test-results/recovery/drill-3d462133-e158-44c4-a982-73679a241fd6/report.json`. This supersedes the earlier empty-template-scoring restore coverage.

Additional read-only assertions against the restored database checked the real USAA export digest, all 29 exact issue acknowledgments and all 16 source-linked claims remaining Draft. All nine canonical template documents matched their captured document digests and four artifact hashes. The sole valid provider response matched its raw-response digest. All four immutable qualification reports matched their digests and withheld qualification. The five Pending v2 source candidates retained separate repeated-text occurrences. Supplemental proof: `test-results/recovery/drill-3d462133-e158-44c4-a982-73679a241fd6/acceptance-proof.json`.

No remote data was replaced, no restored Operation was dispatched and no private résumé content was committed. Logs: `/tmp/river-owner-export-backup-retry.log` and `/tmp/river-owner-export-restore.log`.


## Accepted source and template lifecycle restore — 2026-09-05

After the authorized staging UI acceptance checks, a fresh manual backup retained all 72 tables at `backups/database/staging/2026-09-06T00-59-21.843Z-7152f4ac-3555-451b-962c-4a06321ab1db/snapshot.json.gz` (SHA-256 `cea6ea1cf0cb8e69e665d0576b5c230434361f8e428c806f532c5ac9c3caca54`). The isolated restore passed 24 exact citations, all 144 retained objects and three exported checkpoints, including the accepted source override.

Report: `test-results/recovery/drill-96b18ff8-b2f7-42c1-bef8-f621ddfa5531/report.json`. Supplemental assertions in `source-acceptance-proof.json` confirm the accepted source/base links, fresh unsupported-issue acknowledgment, separate regenerated branch, successful revision-zero preview and template-promotion provenance. Comparing this snapshot with the preceding restore proves the original and real USAA checkpoints and all three preexisting working drafts are unchanged. The promoted Draft changes only paragraph spacing; the earlier template's approval preserves its exact graph/digest. No remote restore or operation redispatch occurred.

Logs: `/tmp/river-source-acceptance-backup.log` and `/tmp/river-source-acceptance-restore.log`. The daily backup's attempt history remains intact.
