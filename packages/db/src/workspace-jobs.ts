import { ApplicationError, canonicalJson, fingerprint, newId, type Principal } from "@river/domain";
import { type JobTargetInput, jobTargetInputSchema } from "@river/domain/workspace";
import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import { jobFactSelections, jobSnapshots, jobs } from "./schema";

export function createWorkspaceJobRepository(db: Database) {
  const commands = createCommands(db);
  const read = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.ownerId, ownerId), eq(jobs.id, id)))
        .limit(1)
    )[0];
  return {
    async listWorkspaceJobs(ownerId: string, query = "", archived = false) {
      return db
        .select({
          id: jobs.id,
          details: jobs.details,
          revision: jobs.revision,
          updatedAt: jobs.updatedAt,
        })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerId, ownerId),
            archived ? isNotNull(jobs.archivedAt) : isNull(jobs.archivedAt),
            query
              ? or(
                  sql`instr(lower(json_extract(${jobs.details}, '$.role')),lower(${query}))>0`,
                  sql`instr(lower(json_extract(${jobs.details}, '$.company')),lower(${query}))>0`,
                )
              : undefined,
          ),
        )
        .orderBy(desc(jobs.updatedAt))
        .limit(100);
    },
    async getWorkspaceJob(ownerId: string, id: string) {
      const row = (
        await db
          .select({
            id: jobs.id,
            revision: jobs.revision,
            details: jobs.details,
            archivedAt: jobs.archivedAt,
            snapshotId: jobSnapshots.id,
            description: jobSnapshots.text,
            url: jobSnapshots.url,
          })
          .from(jobs)
          .innerJoin(
            jobSnapshots,
            and(eq(jobSnapshots.id, jobs.currentSnapshotId), eq(jobSnapshots.jobId, jobs.id)),
          )
          .where(and(eq(jobs.ownerId, ownerId), eq(jobs.id, id)))
          .limit(1)
      )[0];
      if (!row)
        throw new ApplicationError({ code: "NotFound", message: "Job target unavailable." });
      const selection = (
        await db.select().from(jobFactSelections).where(eq(jobFactSelections.jobId, id)).limit(1)
      )[0];
      const snapshots = await db
        .select({
          id: jobSnapshots.id,
          text: jobSnapshots.text,
          details: jobSnapshots.details,
          url: jobSnapshots.url,
          createdAt: jobSnapshots.createdAt,
        })
        .from(jobSnapshots)
        .where(eq(jobSnapshots.jobId, id))
        .orderBy(desc(jobSnapshots.createdAt))
        .limit(100);
      return { ...row, factIds: selection?.factIds ?? [], snapshots };
    },
    async saveWorkspaceJob(actor: Principal, raw: JobTargetInput) {
      if (actor.kind === "agent" && !actor.scopes.includes("jobs:write"))
        throw new ApplicationError({
          code: "Forbidden",
          message: "Job write permission is required.",
        });
      const input = jobTargetInputSchema.parse(raw);
      return commands.commit(actor, "workspace.job.save", input.idempotencyKey, input, async () => {
        const previous = await read(actor.ownerId, input.id);
        if (previous ? previous.revision !== input.revision : input.revision !== 0)
          throw new ApplicationError({
            code: "Conflict",
            message: "This job changed. Reload before saving.",
            expectedRevision: input.revision,
            observedRevision: previous?.revision,
          });
        const now = Date.now(),
          snapshotId = newId(),
          revision = input.revision + 1;
        const record = {
          id: input.id,
          ownerId: actor.ownerId,
          details: input.details,
          revision,
          currentSnapshotId: snapshotId,
          archivedAt: input.archived ? now : null,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        };
        return {
          result: { id: input.id, revision, revisionId: snapshotId },
          guards: [
            conditionGuard(
              db,
              previous
                ? sql`EXISTS(SELECT 1 FROM job_targets WHERE id=${input.id} AND owner_id=${actor.ownerId} AND revision=${input.revision})`
                : sql`NOT EXISTS(SELECT 1 FROM job_targets WHERE id=${input.id})`,
              "The job changed. Reload before saving.",
            ),
            conditionGuard(
              db,
              sql`NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(input.factIds)}) f WHERE NOT EXISTS(SELECT 1 FROM workspace_records r WHERE r.id=f.value AND r.owner_id=${actor.ownerId} AND r.kind='fact' AND r.deleted_at IS NULL))`,
              "A selected fact is unavailable. Update the selection.",
            ),
          ],
          writes: [
            previous
              ? db.update(jobs).set(record).where(eq(jobs.id, input.id))
              : db.insert(jobs).values(record),
            db.insert(jobSnapshots).values({
              id: snapshotId,
              jobId: input.id,
              details: input.details,
              text: input.description,
              url: input.url,
              digest: await fingerprint(
                canonicalJson({
                  details: input.details,
                  text: input.description,
                  url: input.url,
                }),
              ),
              actorId: actor.id,
              createdAt: now,
            }),
            db
              .insert(jobFactSelections)
              .values({ jobId: input.id, factIds: input.factIds, updatedAt: now })
              .onConflictDoUpdate({
                target: jobFactSelections.jobId,
                set: { factIds: input.factIds, updatedAt: now },
              }),
          ],
          history: [
            { entityId: input.id, before: previous, after: { ...record, factIds: input.factIds } },
          ],
        };
      });
    },
  };
}
