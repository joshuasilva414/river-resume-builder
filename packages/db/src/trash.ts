import { type SetTrashRequest, TrashItem, type TrashSearch } from "@river/contracts";
import { ApplicationError, type Principal } from "@river/domain";
import { and, eq, sql } from "drizzle-orm";
import { Schema } from "effect";
import { conditionGuard, createCommands } from "./commands";
import { createEvidenceRepository } from "./evidence";
import type { Database } from "./index";
import { createJobRepository } from "./jobs";
import { createLibraryRepository } from "./library";
import * as s from "./schema";
import { createSourceRepository } from "./sources";

/** Trash is a view over retained records. Restoring never recreates content or files. */
export function createTrashRepository(db: Database) {
  const commands = createCommands(db);
  const sources = createSourceRepository(db);
  const evidence = createEvidenceRepository(db);
  const jobs = createJobRepository(db);
  const library = createLibraryRepository(db);

  async function setTemplateArchived(actor: Principal, input: SetTrashRequest) {
    return commands.commit(actor, "trash-template", input.idempotencyKey, input, async () => {
      const previous = (
        await db
          .select()
          .from(s.templateDesigns)
          .where(
            and(eq(s.templateDesigns.id, input.id), eq(s.templateDesigns.ownerId, actor.ownerId)),
          )
          .limit(1)
      )[0];
      if (!previous)
        throw new ApplicationError({ code: "NotFound", message: "Template not found." });
      if ((previous.archivedAt !== null) === input.archived)
        throw new ApplicationError({
          code: "Conflict",
          message: "This template changed. Refresh before deleting or restoring it.",
        });
      const now = Date.now();
      const next = {
        archivedAt: input.archived ? now : null,
        revision: previous.revision + 1,
        updatedAt: now,
      };
      return {
        result: {
          id: previous.id,
          revision: next.revision,
          revisionId: previous.currentRevisionId,
        },
        guards: [
          conditionGuard(
            db,
            sql`EXISTS (SELECT 1 FROM template_designs WHERE id=${input.id} AND owner_id=${actor.ownerId} AND revision=${input.revision})`,
            "This template changed. Refresh before deleting or restoring it.",
          ),
        ],
        writes: [
          db.update(s.templateDesigns).set(next).where(eq(s.templateDesigns.id, previous.id)),
        ],
        history: [
          {
            entityId: previous.id,
            before: { archivedAt: previous.archivedAt, revision: previous.revision },
            after: next,
          },
        ],
      };
    });
  }

  return {
    async listTrash(ownerId: string, input: TrashSearch) {
      const retained = sql`
        SELECT id, 'source' AS kind, title AS label, revision, current_processing_id AS revisionId, archived_at AS deletedAt FROM sources WHERE owner_id=${ownerId} AND archived_at IS NOT NULL
        UNION ALL SELECT id, 'evidence', CASE WHEN json_extract(metadata, '$.label') != '' THEN json_extract(metadata, '$.label') ELSE assertion END, revision, current_revision_id, archived_at FROM evidence_claims WHERE owner_id=${ownerId} AND archived_at IS NOT NULL
        UNION ALL SELECT id, 'job', json_extract(details, '$.role') || ' · ' || json_extract(details, '$.company'), revision, current_snapshot_id, archived_at FROM job_targets WHERE owner_id=${ownerId} AND archived_at IS NOT NULL
        UNION ALL SELECT id, kind, label, revision, current_revision_id, archived_at FROM library_items WHERE owner_id=${ownerId} AND archived_at IS NOT NULL
        UNION ALL SELECT id, 'template', name, revision, current_revision_id, archived_at FROM template_designs WHERE owner_id=${ownerId} AND archived_at IS NOT NULL`;
      const filter = sql`(${input.kind} IS NULL OR kind=${input.kind}) AND instr(lower(label), lower(${input.query.trim()})) > 0`;
      const [rows, count] = await Promise.all([
        db.all(
          sql`SELECT * FROM (${retained}) WHERE ${filter} ORDER BY deletedAt DESC, kind, id LIMIT 51 OFFSET ${input.offset}`,
        ),
        db.get<{ total: number }>(sql`SELECT COUNT(*) AS total FROM (${retained}) WHERE ${filter}`),
      ]);
      const items = Schema.decodeUnknownSync(Schema.Array(TrashItem))(rows);
      return { items: items.slice(0, 50), hasMore: items.length > 50, total: count?.total ?? 0 };
    },
    async setTrash(actor: Principal, input: SetTrashRequest) {
      if (actor.kind !== "owner")
        throw new ApplicationError({
          code: "Forbidden",
          message: "Only the account owner can delete or restore items.",
        });
      switch (input.kind) {
        case "source":
          return sources.archiveSource(actor, input);
        case "evidence":
          return evidence.archiveEvidence(actor, input);
        case "job":
          return jobs.runJobCommand(actor, { ...input, type: "archive" });
        case "content":
        case "block":
        case "section": {
          const item = await library.getLibraryItem(actor.ownerId, input.id);
          if (!item || item.kind !== input.kind)
            throw new ApplicationError({ code: "NotFound", message: "Reusable item not found." });
          return library.setLibraryArchived(actor, { ...input, rationale: "" });
        }
        case "template":
          return setTemplateArchived(actor, input);
      }
    },
  };
}
