import type { ArchiveSourceRequest } from "@river/contracts";
import { ApplicationError, type Principal } from "@river/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import * as schema from "./schema";
/** Stored originals and text remain readable across the cutover. Extraction is client supplied. */
export function createSourceRepository(db: Database) {
  const commands = createCommands(db);
  const getSource = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(schema.sources)
        .where(and(eq(schema.sources.ownerId, ownerId), eq(schema.sources.id, id)))
        .limit(1)
    )[0];
  return {
    getSource,
    async archiveSource(actor: Principal, input: ArchiveSourceRequest) {
      return commands.commit(actor, "archive-source", input.idempotencyKey, input, async () => {
        const previous = await getSource(actor.ownerId, input.id);
        if (!previous)
          throw new ApplicationError({ code: "NotFound", message: "Source not found." });
        const next = {
          archivedAt: input.archived ? Date.now() : null,
          revision: previous.revision + 1,
          updatedAt: Date.now(),
        };
        return {
          result: {
            id: input.id,
            revision: next.revision,
            revisionId: previous.currentProcessingId,
          },
          guards: [
            conditionGuard(
              db,
              sql`EXISTS (SELECT 1 FROM sources WHERE id=${input.id} AND owner_id=${actor.ownerId} AND revision=${input.revision})`,
              "This source changed. Refresh before deleting or restoring it.",
            ),
          ],
          writes: [db.update(schema.sources).set(next).where(eq(schema.sources.id, input.id))],
          history: [{ entityId: input.id, before: previous, after: { ...previous, ...next } }],
        };
      });
    },
    async listSources(ownerId: string) {
      return db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.ownerId, ownerId))
        .orderBy(desc(schema.sources.createdAt))
        .limit(200);
    },
    async getProcessingResult(ownerId: string, sourceId: string, id: string) {
      return (
        await db
          .select({ result: schema.processingResults })
          .from(schema.processingResults)
          .innerJoin(schema.sources, eq(schema.sources.id, schema.processingResults.sourceId))
          .where(
            and(
              eq(schema.sources.ownerId, ownerId),
              eq(schema.sources.id, sourceId),
              eq(schema.processingResults.id, id),
            ),
          )
          .limit(1)
      )[0]?.result;
    },
    async sourceHistory(ownerId: string, sourceId: string) {
      return db
        .select({ result: schema.processingResults })
        .from(schema.processingResults)
        .innerJoin(schema.sources, eq(schema.sources.id, schema.processingResults.sourceId))
        .where(and(eq(schema.sources.ownerId, ownerId), eq(schema.sources.id, sourceId)))
        .orderBy(desc(schema.processingResults.createdAt));
    },
  };
}
