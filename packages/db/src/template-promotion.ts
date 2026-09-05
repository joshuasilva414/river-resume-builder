import { ApplicationError } from "@river/domain";
import { isolateLayoutAdjustment, type TemplateBase } from "@river/templates";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import * as s from "./schema";

/** This boundary returns generic layout values and provenance, never expanded source or evidence. */
export async function captureTemplatePromotion(
  db: Database,
  ownerId: string,
  checkpointId: string,
) {
  const row = (
    await db
      .select({
        data: s.checkpoints.data,
        source: s.checkpointSources.source,
        candidateDigest: s.checkpointSources.candidateDigest,
        baseSource: sql<string>`json_extract(${s.sourceRefinementTasks.input}, '$.checkpoint.source')`,
      })
      .from(s.checkpoints)
      .innerJoin(s.checkpointSources, eq(s.checkpointSources.checkpointId, s.checkpoints.id))
      .innerJoin(
        s.sourceRefinementProposals,
        and(
          eq(s.sourceRefinementProposals.id, s.checkpointSources.proposalId),
          eq(s.sourceRefinementProposals.resultCheckpointId, s.checkpoints.id),
          eq(s.sourceRefinementProposals.candidateDigest, s.checkpointSources.candidateDigest),
          eq(s.sourceRefinementProposals.state, "Accepted"),
        ),
      )
      .innerJoin(
        s.sourceRefinementTasks,
        eq(s.sourceRefinementTasks.id, s.sourceRefinementProposals.taskId),
      )
      .where(
        and(
          eq(s.checkpoints.id, checkpointId),
          eq(s.checkpoints.ownerId, ownerId),
          eq(s.sourceRefinementTasks.ownerId, ownerId),
        ),
      )
      .limit(1)
  )[0];
  if (!row)
    throw new ApplicationError({
      code: "NotFound",
      message: "Accepted source checkpoint not found.",
    });
  const binding = row.data.template;
  const base: TemplateBase = binding
    ? { kind: "saved", revisionId: binding.revisionId }
    : { kind: "fixed", theme: row.data.theme };
  const design = binding
    ? (
        await db
          .select()
          .from(s.templateDesigns)
          .where(
            and(eq(s.templateDesigns.id, binding.designId), eq(s.templateDesigns.ownerId, ownerId)),
          )
          .limit(1)
      )[0]
    : null;
  return {
    checkpointId,
    candidateDigest: row.candidateDigest,
    base,
    destination:
      design?.scope.level === "document"
        ? { id: design.id, revision: design.revision, name: design.name }
        : null,
    layout: isolateLayoutAdjustment(row.baseSource, row.source),
  };
}
