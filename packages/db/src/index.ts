import { ApplicationError, fingerprint, newId } from "@river/domain";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createAccessRepository } from "./access";
import { createAiSettingsRepository } from "./ai-settings";
import { createBackupRepository } from "./backups";
import { createCommands } from "./commands";
import { createFeedbackRepository } from "./feedback";
import * as schema from "./schema";
import { createSourceRepository } from "./sources";
import { createUsageRepository } from "./usage";
import { createWorkspaceRepository } from "./workspace";
import { createWorkspaceArchiveRepository } from "./workspace-archive";
import { createWorkspaceExportRepository } from "./workspace-exports";
import { createWorkspaceJobRepository } from "./workspace-jobs";
import { createWorkspaceRunRepository } from "./workspace-runs";
import { createWorkspaceSourceRepository } from "./workspace-sources";

export { usageFailure } from "./usage";
export { schema };
export const createDatabase = (binding: D1Database) => drizzle(binding, { schema });
export type Database = ReturnType<typeof createDatabase>;
export function createRepository(binding: D1Database) {
  const db = createDatabase(binding);
  const getOperation = async (id: string) =>
    (await db.select().from(schema.operations).where(eq(schema.operations.id, id)).limit(1))[0];
  const getReceipt = async (actorId: string, command: string, key: string) =>
    (
      await db
        .select()
        .from(schema.receipts)
        .where(
          and(
            eq(schema.receipts.actorId, actorId),
            eq(schema.receipts.command, command),
            eq(schema.receipts.key, key),
          ),
        )
        .limit(1)
    )[0];

  return {
    ...createAccessRepository(db),
    ...createAiSettingsRepository(db),
    ...createBackupRepository(db),
    ...createFeedbackRepository(db),
    ...createSourceRepository(db),
    ...createUsageRepository(db),
    ...createWorkspaceRepository(db),
    ...createWorkspaceArchiveRepository(db),
    ...createWorkspaceExportRepository(db),
    ...createWorkspaceJobRepository(db),
    ...createWorkspaceRunRepository(db),
    ...createWorkspaceSourceRepository(db),
    db,
    getOperation,
    replayCommand: createCommands(db).replayCommand,
    async pendingDispatches() {
      return db
        .select({ operationId: schema.dispatches.operationId })
        .from(schema.dispatches)
        .innerJoin(schema.operations, eq(schema.operations.id, schema.dispatches.operationId))
        .where(
          and(
            isNull(schema.dispatches.dispatchedAt),
            sql`json_extract(${schema.operations.input}, '$.type')='database-backup'`,
          ),
        )
        .limit(50);
    },
    async activeOperations() {
      return db
        .select()
        .from(schema.operations)
        .where(
          and(
            eq(schema.operations.state, "Running"),
            sql`json_extract(${schema.operations.input}, '$.type')='database-backup'`,
          ),
        )
        .limit(50);
    },
    async cancelBackupOperation(actorId: string, id: string, key: string) {
      const command = "cancel-backup-operation";
      const digest = await fingerprint(id);
      const replay = await getReceipt(actorId, command, key);
      if (replay) {
        if (replay.fingerprint !== digest)
          throw new ApplicationError({ code: "Conflict", message: "Idempotency input changed." });
        return id;
      }
      const current = await getOperation(id);
      if (
        !current ||
        current.ownerId !== actorId ||
        !("type" in current.input) ||
        current.input.type !== "database-backup"
      )
        throw new ApplicationError({ code: "NotFound", message: "Backup not found." });
      const guardId = newId();
      try {
        await db.batch([
          db.insert(schema.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM operations WHERE id = ${id} AND owner_id = ${actorId} AND state IN ('Pending', 'Running'))`,
          }),
          db
            .update(schema.operations)
            .set({ state: "Cancelled", stage: "Cancelled by Owner", updatedAt: Date.now() })
            .where(eq(schema.operations.id, id)),
          db
            .update(schema.dispatches)
            .set({ dispatchedAt: null })
            .where(eq(schema.dispatches.operationId, id)),
          db.insert(schema.receipts).values({
            actorId,
            command,
            key,
            fingerprint: digest,
            resultId: id,
            createdAt: Date.now(),
          }),
          db.insert(schema.audit).values({
            id: newId(),
            actorId,
            command,
            entityId: id,
            after: { state: "Cancelled" },
            createdAt: Date.now(),
          }),
          db.delete(schema.mutationGuards).where(eq(schema.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const receipt = await getReceipt(actorId, command, key);
        if (receipt?.fingerprint === digest) return id;
        const current = await getOperation(id);
        if (!current || current.ownerId !== actorId)
          throw new ApplicationError({ code: "NotFound", message: "Operation not found." });
        if (current.state !== "Pending" && current.state !== "Running")
          throw new ApplicationError({
            code: "Conflict",
            message: "This operation has already finished.",
          });
        throw error;
      }
      return id;
    },
    async markDispatched(operationId: string, expectedState: string) {
      await db
        .update(schema.dispatches)
        .set({ dispatchedAt: Date.now(), attempts: sql`${schema.dispatches.attempts} + 1` })
        .where(
          and(
            eq(schema.dispatches.operationId, operationId),
            sql`EXISTS (SELECT 1 FROM operations WHERE id = ${operationId} AND state = ${expectedState})`,
          ),
        );
    },
    async updateOperation(
      id: string,
      values: {
        state: "Running" | "Succeeded" | "Failed";
        stage: string;
        failure?: string | null;
      },
    ) {
      await db
        .update(schema.operations)
        .set({ ...values, updatedAt: Date.now() })
        .where(
          and(
            eq(schema.operations.id, id),
            inArray(schema.operations.state, ["Pending", "Running"]),
          ),
        );
    },
  };
}
export type Repository = ReturnType<typeof createRepository>;
