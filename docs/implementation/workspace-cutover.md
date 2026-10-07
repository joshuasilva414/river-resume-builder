# Visual workspace cutover and container decommission

This is a runbook, not evidence of a hosted deployment. The replacement branch has
been validated locally. Production deployment, merge, and remote infrastructure
deletion remain separate authorized actions. Run staging before production.

## Prepare a release

1. Freeze the reviewed commit and preserve the two unrelated documentation edits.
   Run `pnpm lint`, `pnpm check`, `pnpm test`, and `pnpm test:deployment`. Build both
   environments sequentially using `pnpm ci:build staging --bundle-only` and the
   production equivalent. These perform bundle validation and Wrangler dry runs.
2. Confirm the target from `apps/web/wrangler.jsonc` and
   `config/backup-resources.json`. Only personal River resources are in scope.
   Record current web, telemetry, document Worker/container, Workflow, D1, and R2
   identities for recovery. Do not infer remote state from this repository.
3. Before a separately approved merge into a deployment branch, control the
   automatic Workers Build trigger so cutover cannot race an automatic release.
   Arrange a maintenance interval that prevents old UI, agent, and API writes.
   Drain or explicitly cancel old document/source/AI Workflows. Confirm no pending
   or running legacy operations remain. Preserve failed inputs for historical read.
4. Retain and verify a pre-cutover database backup with the environment-specific
   backup command. Run an isolated restore drill and preserve its receipt. Confirm
   retained object access/hashes, accounts, settings, sources, and job targets.
   Backups contain encrypted AI keys; retain the matching encryption secret
   separately. Database rollback alone cannot restore object storage.

## Publish and archive

5. With deployment authorization, run the environment's build/deploy process. It
   validates resource identities, backs up D1, applies additive migrations, deploys
   the private telemetry Worker, and publishes the web Worker. Migrations 0039–0041
   add the new model; historical tables remain intact. No document Worker or image
   is built or deployed. The only active Workflow binding is `BACKUP_WORKFLOW`.
6. During the controlled acceptance interval, each existing owner opens
   `/archive` and chooses **Archive previous workspace**. This owner-scoped command
   is idempotent and copies historical payloads and artifact manifests verbatim.
   It does not clear accounts, settings, sources, jobs, or new workspace records.
   It never converts or re-renders old templates. Newly admitted empty accounts
   can create an empty archive manifest.
7. Compare `workspace_archives.counts` with `workspace_archive_records` grouped by
   owner/category. Categories are contexts, evidence revisions, content revisions,
   template revisions, résumés, versions, artifacts, and scorecards. A count of
   revisions is not a count of current entities. Track owners without a manifest;
   their old tables remain preserved but their archive must still be materialized.
   Do not treat one owner's successful cutover as global completion.
8. Check an available old PDF, an expired preview, and owner isolation. Downloads
   must use retained bytes with no container calls. An expired/missing preview is
   unavailable and is never regenerated. Verify sources and postings remain usable,
   while new facts/content are empty. Old evidence selections must be rebuilt.
9. Verify v1 evidence/job mutations return 410 `RIVER_WORKSPACE_REPLACED`. Reissue
   agent credentials with explicit v2 scopes where needed. Test new facts, browser
   import, copied content, custom templates, direct authoring, versions, and exact
   PDF archival. Configure live AI/scoring for staging acceptance; failures must
   leave manual authoring/export available. Successful live-provider paths were not
   exercised locally because those connections were unconfigured.
10. Retain a post-cutover backup and run an isolated restore with new sources,
    complete browser exports, and historical artifacts. The inventory covers both
    historical `retained/` objects and new `sources/` and `workspace/.../exports/`
    objects. Preserve those prefixes without lifecycle expiry. Prepared uploads are
    not successful exports. Reopen traffic only after acceptance, then restore the
    intended automatic build policy.

The owner archive action is deliberately not an administrator impersonation API.
If an owner is unavailable during cutover, keep their legacy tables unchanged and
record the outstanding manifest. Do not delete historical tables or pretend their
archive was verified. The new editor uses only the new tables, so old rows cannot
silently enter the fresh model.

## Separately authorized remote decommission

11. Inspect deployed web versions, bindings, Workflow instances, and invocation
    telemetry. Confirm active exports and source imports no longer call the old
    document service. Do not delete the service just because this branch removed
    its code. Preserve the pre-cutover backup and historical R2 data.
12. With explicit remote-decommission authorization, terminate remaining obsolete
    Workflow instances, remove the old document Worker/container application and
    its obsolete service/Workflow deployment settings. Remove unused image/build
    artifacts only after identifying their exact ownership. Keep the web Worker,
    telemetry, database-backup Workflow, D1, R2, authentication, and email bindings.
13. Remove Container/Cloudchamber permissions from the deployment token when no
    other authorized build needs them. Update required branch checks from the
    removed `documents` job to the remaining `application` job. Verify staging
    and production separately; never use a broad account cleanup command.

## Failure and recovery

- Stop reopening traffic when archive counts or object ownership checks fail.
  Retry archive creation with the same owner/key; a completed manifest is reused.
- For client rendering errors, keep the draft and last good preview. Unsupported
  font glyphs/text loss must not produce a successful export.
- Retry failed PDF uploads in the original tab using the retained frozen blob.
  Closing that tab loses an unarchived blob; it does not invalidate older exports.
- Resolve draft conflicts by reloading or saving a separate copy. Do not overwrite
  a newer revision. Restoring a version creates a new draft revision.
- A Worker rollback does not reverse D1/R2 writes. Preserve new data, use a
  maintenance/read-only state, and investigate. Re-enabling an old editor would
  create divergent histories and requires a separately reviewed recovery plan.
- Restore drills must be isolated and unpublished. Do not redispatch restored old
  operations or substitute a new PDF for a retained historical file.

Local evidence and Paper references are in [river-replacement.md](river-replacement.md).
