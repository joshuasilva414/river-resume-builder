import { ApplicationError, type BackupObject, newId } from "@river/domain";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import * as s from "./schema";

export function createBackupRepository(db: Database) {
  const getBackup = async (date: string) =>
    (await db.select().from(s.backups).where(eq(s.backups.date, date)).limit(1))[0];
  return {
    getBackup,
    /** The date is the permanent scheduler identity. Concurrent cron deliveries share one durable dispatch. */
    async scheduleBackup(ownerEmail: string, date: string) {
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
          .where(and(eq(s.user.email, ownerEmail), eq(s.user.emailVerified, true)))
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
