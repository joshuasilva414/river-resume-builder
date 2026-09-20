import { ApplicationError, type Principal } from "@river/domain";
import type { ExportMetadata } from "@river/domain/workspace";
import { and, desc, eq, sql } from "drizzle-orm";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import { workspaceExports as exports, workspaceRecords as records } from "./workspace-schema";

/** Prepared exports expose no download. Completion follows verification of the archived object. */
export function createWorkspaceExportRepository(db: Database) {
  const commands = createCommands(db);
  const get = async (ownerId: string, id: string) => {
    const row = (
      await db
        .select()
        .from(exports)
        .where(and(eq(exports.ownerId, ownerId), eq(exports.id, id)))
        .limit(1)
    )[0];
    if (!row) throw new ApplicationError({ code: "NotFound", message: "Export unavailable." });
    return row;
  };
  return {
    getWorkspaceExport: get,
    async listWorkspaceExports(ownerId: string, resumeId: string) {
      return db
        .select({
          id: exports.id,
          versionId: exports.versionId,
          metadata: exports.metadata,
          state: exports.state,
          createdAt: exports.createdAt,
          completedAt: exports.completedAt,
        })
        .from(exports)
        .innerJoin(records, eq(records.id, exports.versionId))
        .where(
          and(
            eq(exports.ownerId, ownerId),
            eq(records.ownerId, ownerId),
            sql`json_extract(${records.payload},'$.data.resumeId')=${resumeId}`,
          ),
        )
        .orderBy(desc(exports.createdAt));
    },
    async prepareWorkspaceExport(
      actor: Principal,
      input: {
        id: string;
        versionId: string;
        objectKey: string;
        metadata: ExportMetadata;
        idempotencyKey: string;
      },
    ) {
      if (actor.kind === "agent" && !actor.scopes.includes("resumes:write"))
        throw new ApplicationError({
          code: "Forbidden",
          message: "This credential cannot create exports.",
        });
      return commands.commit(actor, "workspace.export", input.idempotencyKey, input, async () => ({
        result: { id: input.id, revision: 0, revisionId: null },
        guards: [
          conditionGuard(
            db,
            sql`EXISTS(SELECT 1 FROM ${records} WHERE id=${input.versionId} AND owner_id=${actor.ownerId} AND kind='version' AND deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM ${exports} WHERE id=${input.id})`,
            "Choose an owned saved version and a new export identity.",
          ),
        ],
        writes: [
          db
            .insert(exports)
            .values({
              id: input.id,
              ownerId: actor.ownerId,
              versionId: input.versionId,
              objectKey: input.objectKey,
              metadata: input.metadata,
              state: "Prepared",
              createdAt: Date.now(),
            }),
        ],
        history: [
          { entityId: input.id, after: { versionId: input.versionId, metadata: input.metadata } },
        ],
      }));
    },
    async completeWorkspaceExport(ownerId: string, id: string) {
      await get(ownerId, id);
      await db
        .update(exports)
        .set({ state: "Complete", completedAt: Date.now() })
        .where(
          and(eq(exports.ownerId, ownerId), eq(exports.id, id), eq(exports.state, "Prepared")),
        );
      return get(ownerId, id);
    },
  };
}
