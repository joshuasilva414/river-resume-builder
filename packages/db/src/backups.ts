import type { ReadBackupStatusRequest, RetryBackupRequest } from "@river/contracts";
import {
  ApplicationError,
  type BackupObject,
  newId,
  type Principal,
  requireAdministrator,
} from "@river/domain";
import { and, desc, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

export function createBackupRepository(db: Database) {
  const commands = createCommands(db);
  const getBackup = async (date: string) =>
    (await db.select().from(s.backups).where(eq(s.backups.date, date)).limit(1))[0];
  return {
    getBackup,
    async readBackupStatus(actor: Principal, input: ReadBackupStatusRequest = {}) {
      requireAdministrator(actor);
      const selection = {
        date: s.backups.date,
        attempt: s.backups.attempts,
        operationId: s.operations.id,
        state: s.operations.state,
        stage: s.operations.stage,
        createdAt: s.operations.createdAt,
        updatedAt: s.operations.updatedAt,
        completedAt: s.backups.completedAt,
      };
      const latest =
        (
          await db
            .select(selection)
            .from(s.backups)
            .innerJoin(s.operations, eq(s.operations.id, s.backups.operationId))
            .where(eq(s.operations.ownerId, actor.ownerId))
            .orderBy(desc(s.backups.date))
            .limit(1)
        )[0] ?? null;
      const retainedCandidates = await db
        .select({
          date: s.backups.date,
          completedAt: s.backups.completedAt,
          manifest: s.backups.manifest,
        })
        .from(s.backups)
        .innerJoin(s.operations, eq(s.operations.id, s.backups.operationId))
        .where(
          and(
            eq(s.operations.ownerId, actor.ownerId),
            isNotNull(s.backups.manifest),
            gt(s.backups.completedAt, Date.now() - 30 * 86_400_000),
          ),
        )
        .orderBy(desc(s.backups.date))
        .limit(30);
      const dates = await db
        .select(selection)
        .from(s.backups)
        .innerJoin(s.operations, eq(s.operations.id, s.backups.operationId))
        .where(
          and(
            eq(s.operations.ownerId, actor.ownerId),
            input.before ? lt(s.backups.date, input.before) : undefined,
          ),
        )
        .orderBy(desc(s.backups.date))
        .limit(11);
      const selectedDate = input.date ?? latest?.date ?? null;
      const attempts = selectedDate
        ? await db
            .select({
              id: s.operations.id,
              state: s.operations.state,
              stage: s.operations.stage,
              failure: s.operations.failure,
              createdAt: s.operations.createdAt,
              updatedAt: s.operations.updatedAt,
            })
            .from(s.operations)
            .where(
              and(
                eq(s.operations.ownerId, actor.ownerId),
                sql`json_extract(${s.operations.input}, '$.type') = 'database-backup'`,
                sql`json_extract(${s.operations.input}, '$.date') = ${selectedDate}`,
              ),
            )
            .orderBy(s.operations.createdAt, s.operations.id)
            .limit(3)
        : [];
      return {
        latest,
        retainedCandidates,
        dates: dates.slice(0, 10),
        nextBefore: dates.length > 10 ? (dates[9]?.date ?? null) : null,
        selectedDate,
        attempts,
        maxAttempts: 3,
      };
    },
    async retryBackup(actor: Principal, input: RetryBackupRequest, configured: boolean) {
      requireAdministrator(actor);
      return commands.commit(
        actor,
        "retry-database-backup",
        input.idempotencyKey,
        input,
        async () => {
          const backup = await getBackup(input.date);
          const operation = backup
            ? (
                await db
                  .select()
                  .from(s.operations)
                  .where(
                    and(
                      eq(s.operations.id, backup.operationId),
                      eq(s.operations.ownerId, actor.ownerId),
                    ),
                  )
                  .limit(1)
              )[0]
            : null;
          if (!backup || !operation)
            throw new ApplicationError({ code: "NotFound", message: "Daily backup not found." });
          const guard = conditionGuard(
            db,
            sql`EXISTS (SELECT 1 FROM database_backups b JOIN operations o ON o.id=b.operation_id WHERE b.date=${input.date} AND b.attempts=${input.attempt} AND b.attempts<3 AND b.manifest IS NULL AND o.id=${operation.id} AND o.owner_id=${actor.ownerId} AND o.state IN ('Failed','Cancelled'))`,
            "This backup changed, succeeded, or used all three attempts. Reload its status before retrying.",
          );
          await guard.check();
          if (!configured)
            throw new ApplicationError({
              code: "Unavailable",
              message: "Daily backup credentials or personal staging settings are unavailable.",
            });
          const id = newId(),
            now = Date.now(),
            attempt = input.attempt + 1;
          return {
            result: { id, revision: attempt, revisionId: null },
            guards: [guard],
            writes: [
              db.insert(s.operations).values({
                id,
                ownerId: actor.ownerId,
                input: { type: "database-backup", date: input.date },
                state: "Pending",
                stage: "Queued for Owner-requested database backup retry",
                createdAt: now,
                updatedAt: now,
              }),
              db
                .update(s.backups)
                .set({ operationId: id, attempts: attempt, createdAt: now })
                .where(eq(s.backups.date, input.date)),
              db.insert(s.dispatches).values({ operationId: id }),
            ],
            history: [
              {
                entityId: id,
                before: { operationId: operation.id, attempt: input.attempt },
                after: { date: input.date, attempt },
              },
            ],
          };
        },
      );
    },
    /** The date is the permanent scheduler identity. Concurrent cron deliveries share one durable dispatch. */
    async scheduleBackup(administratorEmail: string, date: string) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new ApplicationError({
          code: "InvalidInput",
          message: "A UTC backup date is required.",
        });
      const existing = await getBackup(date);
      if (existing) return existing;
      const owner = (
        await db
          .select({ id: s.user.id })
          .from(s.user)
          .where(
            and(
              eq(s.user.email, administratorEmail.trim().toLowerCase()),
              eq(s.user.emailVerified, true),
            ),
          )
          .limit(1)
      )[0];
      if (!owner) return null;
      const id = newId(),
        now = Date.now();
      try {
        await db.batch([
          db.insert(s.operations).values({
            id,
            ownerId: owner.id,
            input: { type: "database-backup", date },
            state: "Pending",
            stage: "Queued for daily database backup",
            createdAt: now,
            updatedAt: now,
          }),
          db.insert(s.backups).values({ date, operationId: id, createdAt: now }),
          db.insert(s.dispatches).values({ operationId: id }),
          db.insert(s.audit).values({
            id: newId(),
            actorId: "system:daily-backup",
            command: "schedule-database-backup",
            entityId: id,
            after: { date },
            createdAt: now,
          }),
        ]);
      } catch (error) {
        const raced = await getBackup(date);
        if (raced) return raced;
        throw error;
      }
      return getBackup(date);
    },
    async completeBackup(date: string, operationId: string, manifest: BackupObject) {
      const existing = await getBackup(date);
      if (existing?.operationId !== operationId) return false;
      if (existing.manifest) return existing.manifest.sha256 === manifest.sha256;
      const guardId = newId();
      try {
        await db.batch([
          db.insert(s.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM database_backups b JOIN operations o ON o.id=b.operation_id WHERE b.date=${date} AND o.id=${operationId} AND o.state IN ('Pending','Running') AND b.manifest IS NULL)`,
          }),
          db
            .update(s.backups)
            .set({ manifest, completedAt: Date.now() })
            .where(eq(s.backups.date, date)),
          db
            .update(s.operations)
            .set({
              state: "Succeeded",
              stage: "Daily database backup retained",
              updatedAt: Date.now(),
            })
            .where(eq(s.operations.id, operationId)),
          db.insert(s.audit).values({
            id: newId(),
            actorId: "system:daily-backup",
            command: "retain-database-backup",
            entityId: operationId,
            after: { date, manifest },
            createdAt: Date.now(),
          }),
          db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const raced = await getBackup(date);
        if (raced?.manifest) return raced.manifest.sha256 === manifest.sha256;
        const operation = (
          await db.select().from(s.operations).where(eq(s.operations.id, operationId)).limit(1)
        )[0];
        if (operation && !["Pending", "Running"].includes(operation.state)) return false;
        throw error;
      }
      return true;
    },
  };
}
