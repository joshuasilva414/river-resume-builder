import { ApplicationError, newId, type Principal } from "@river/domain";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import * as legacy from "./schema";
import {
  workspaceArchiveRecords as archive,
  workspaceArchives as manifests,
} from "./workspace-schema";

/** Archive copies historical payloads verbatim. It never re-renders or migrates a LaTeX template. */
export function createWorkspaceArchiveRepository(db: Database) {
  const commands = createCommands(db);
  const manifest = async (ownerId: string) =>
    (await db.select().from(manifests).where(eq(manifests.ownerId, ownerId)).limit(1))[0] ?? null;
  return {
    getWorkspaceArchive: manifest,
    async archiveLegacyWorkspace(actor: Principal, idempotencyKey: string) {
      if (actor.kind !== "owner")
        throw new ApplicationError({
          code: "Forbidden",
          message: "Only the workspace owner can perform the cutover.",
        });
      if (await manifest(actor.ownerId)) return manifest(actor.ownerId);
      await commands
        .commit(
          actor,
          "workspace.archive-legacy",
          idempotencyKey,
          { ownerId: actor.ownerId },
          async () => {
            const ownerId = actor.ownerId;
            const [contexts, facts, content, templates, resumes, versions, artifacts] =
              await Promise.all([
                db
                  .select({ record: legacy.contexts, revision: legacy.contextRevisions })
                  .from(legacy.contexts)
                  .leftJoin(
                    legacy.contextRevisions,
                    eq(legacy.contextRevisions.contextId, legacy.contexts.id),
                  )
                  .where(eq(legacy.contexts.ownerId, ownerId)),
                db
                  .select({ record: legacy.claims, revision: legacy.evidenceRevisions })
                  .from(legacy.claims)
                  .leftJoin(
                    legacy.evidenceRevisions,
                    eq(legacy.evidenceRevisions.claimId, legacy.claims.id),
                  )
                  .where(eq(legacy.claims.ownerId, ownerId)),
                db
                  .select({ record: legacy.libraryItems, revision: legacy.libraryRevisions })
                  .from(legacy.libraryItems)
                  .leftJoin(
                    legacy.libraryRevisions,
                    eq(legacy.libraryRevisions.itemId, legacy.libraryItems.id),
                  )
                  .where(eq(legacy.libraryItems.ownerId, ownerId)),
                db
                  .select({ record: legacy.templateDesigns, revision: legacy.templateRevisions })
                  .from(legacy.templateDesigns)
                  .leftJoin(
                    legacy.templateRevisions,
                    eq(legacy.templateRevisions.designId, legacy.templateDesigns.id),
                  )
                  .where(eq(legacy.templateDesigns.ownerId, ownerId)),
                db
                  .select()
                  .from(legacy.resumeDrafts)
                  .where(eq(legacy.resumeDrafts.ownerId, ownerId)),
                db.select().from(legacy.checkpoints).where(eq(legacy.checkpoints.ownerId, ownerId)),
                db
                  .select({ ...getTableColumns(legacy.operations) })
                  .from(legacy.operations)
                  .where(
                    and(
                      eq(legacy.operations.ownerId, ownerId),
                      sql`${legacy.operations.artifacts} IS NOT NULL`,
                    ),
                  ),
              ]);
            const now = Date.now();
            type Entry = { category: string; id: string; name: string; data: unknown };
            const entries: Entry[] = [
              ...contexts.map((row) => ({
                category: "contexts",
                id: row.revision?.id ?? row.record.id,
                name: row.record.label,
                data: row,
              })),
              ...facts.map((row) => ({
                category: "evidence",
                id: row.revision?.id ?? row.record.id,
                name: row.record.assertion,
                data: row,
              })),
              ...content.map((row) => ({
                category: "content",
                id: row.revision?.id ?? row.record.id,
                name: row.record.label,
                data: row,
              })),
              ...templates.map((row) => ({
                category: "templates",
                id: row.revision?.id ?? row.record.id,
                name: row.record.name,
                data: row,
              })),
              ...resumes.map((row) => ({
                category: "resumes",
                id: row.id,
                name: `Résumé ${row.id}`,
                data: row,
              })),
              ...versions.map((row) => ({
                category: "versions",
                id: row.id,
                name: row.label ?? "Saved résumé",
                data: row,
              })),
              ...artifacts.map((row) => ({
                category: "artifacts",
                id: row.id,
                name: `Retained document ${row.id}`,
                data: row,
              })),
            ];
            const counts = Object.fromEntries(
              [
                "contexts",
                "evidence",
                "content",
                "templates",
                "resumes",
                "versions",
                "artifacts",
              ].map((category) => [
                category,
                entries.filter((entry) => entry.category === category).length,
              ]),
            );
            return {
              result: { id: ownerId, revision: 1, revisionId: newId() },
              guards: [
                conditionGuard(
                  db,
                  sql`NOT EXISTS(SELECT 1 FROM ${manifests} WHERE owner_id=${ownerId})`,
                  "This workspace has already been archived.",
                ),
              ],
              writes: [
                ...entries.map((entry) =>
                  db.insert(archive).values({ ...entry, ownerId, archivedAt: now }),
                ),
                db.insert(manifests).values({ ownerId, version: 1, counts, createdAt: now }),
              ],
              history: [{ entityId: ownerId, after: { archiveVersion: 1, counts } }],
            };
          },
        )
        .catch(async (error) => {
          if (!(await manifest(actor.ownerId))) throw error;
        });
      return manifest(actor.ownerId);
    },
    async listWorkspaceArchive(ownerId: string, category?: string) {
      return db
        .select({
          id: archive.id,
          category: archive.category,
          name: archive.name,
          archivedAt: archive.archivedAt,
        })
        .from(archive)
        .where(
          and(eq(archive.ownerId, ownerId), category ? eq(archive.category, category) : undefined),
        )
        .orderBy(desc(archive.archivedAt));
    },
    async readWorkspaceArchive(ownerId: string, category: string, id: string) {
      const record = (
        await db
          .select()
          .from(archive)
          .where(
            and(eq(archive.ownerId, ownerId), eq(archive.category, category), eq(archive.id, id)),
          )
          .limit(1)
      )[0];
      if (!record)
        throw new ApplicationError({
          code: "NotFound",
          message: "This archived record is unavailable.",
        });
      return record;
    },
  };
}
