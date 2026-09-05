import type { ReviewedComparisonOrigin, StartDuplicateAiRequest } from "@river/contracts";
import { ApplicationError, type DuplicateAiInput, type Principal } from "@river/domain";
import { and, eq, sql } from "drizzle-orm";
import { conditionGuard as duplicateGuard, type Guard } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

export { conditionGuard as duplicateGuard } from "./commands";
export function duplicateInputGuards(db: Database, ownerId: string, input: DuplicateAiInput) {
  return [
    duplicateGuard(
      db,
      sql`EXISTS (SELECT 1 FROM evidence_duplicates WHERE id=${input.pair.id} AND owner_id=${ownerId} AND revision=${input.pair.revision} AND state='Pending')`,
      "The duplicate pair was already resolved or changed.",
    ),
    ...[input.first, input.second].map((claim) =>
      duplicateGuard(
        db,
        sql`EXISTS (SELECT 1 FROM evidence_claims WHERE id=${claim.claimId} AND owner_id=${ownerId} AND revision=${claim.revision} AND current_revision_id=${claim.evidenceRevisionId} AND archived_at IS NULL)`,
        "A compared claim, review decision, or lifecycle state changed.",
      ),
    ),
    duplicateGuard(
      db,
      sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(input.contexts)}) expected WHERE NOT EXISTS (SELECT 1 FROM contexts c WHERE c.id=json_extract(expected.value,'$.id') AND c.owner_id=${ownerId} AND c.revision=json_extract(expected.value,'$.aggregateRevision') AND c.current_revision_id=json_extract(expected.value,'$.currentRevisionId')))`,
      "A compared context changed.",
    ),
    duplicateGuard(
      db,
      sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(input.sources)}) expected WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.id=json_extract(expected.value,'$.id') AND s.owner_id=${ownerId} AND s.revision=json_extract(expected.value,'$.revision') AND s.state=json_extract(expected.value,'$.state') AND s.current_processing_id IS json_extract(expected.value,'$.currentProcessingId')))`,
      "A compared source or processing selection changed.",
    ),
  ];
}
export async function duplicateStaleReasons(
  db: Database,
  ownerId: string,
  input: DuplicateAiInput,
) {
  const reasons: string[] = [];
  for (const guard of duplicateInputGuards(db, ownerId, input)) {
    try {
      await guard.check();
    } catch (error) {
      if (error instanceof ApplicationError && error.code === "Conflict")
        reasons.push(error.message);
      else throw error;
    }
  }
  return [...new Set(reasons)];
}
export async function captureDuplicateInput(
  db: Database,
  ownerId: string,
  request: StartDuplicateAiRequest,
): Promise<DuplicateAiInput> {
  const pair = (
    await db
      .select()
      .from(s.duplicatePairs)
      .where(and(eq(s.duplicatePairs.id, request.pairId), eq(s.duplicatePairs.ownerId, ownerId)))
      .limit(1)
  )[0];
  if (!pair) throw new ApplicationError({ code: "NotFound", message: "Duplicate pair not found." });
  if (pair.state !== "Pending" || pair.revision !== request.revision)
    throw new ApplicationError({
      code: "Conflict",
      message: "Select a current unresolved duplicate pair.",
    });
  const captureClaim = async (
    claimId: string,
    evidenceRevisionId: string,
    revision: number,
  ): Promise<DuplicateAiInput["first"]> => {
    const row = (
      await db
        .select({ claim: s.claims, evidence: s.evidenceRevisions })
        .from(s.claims)
        .innerJoin(s.evidenceRevisions, eq(s.evidenceRevisions.id, s.claims.currentRevisionId))
        .where(and(eq(s.claims.id, claimId), eq(s.claims.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!row)
      throw new ApplicationError({ code: "NotFound", message: "A compared claim is unavailable." });
    if (
      row.claim.archivedAt !== null ||
      row.claim.revision !== revision ||
      row.evidence.id !== evidenceRevisionId
    )
      throw new ApplicationError({
        code: "Conflict",
        message: "A compared claim changed. Review its current revision.",
      });
    const decision = row.claim.currentDecisionId
      ? (
          await db
            .select()
            .from(s.reviewDecisions)
            .where(eq(s.reviewDecisions.id, row.claim.currentDecisionId))
            .limit(1)
        )[0]
      : null;
    return {
      claimId,
      evidenceRevisionId,
      revision,
      material: row.evidence.material,
      decision: decision
        ? { id: decision.id, state: decision.state, rationale: decision.rationale }
        : null,
    };
  };
  const first = await captureClaim(pair.firstId, pair.firstRevisionId, request.firstRevision),
    second = await captureClaim(pair.secondId, pair.secondRevisionId, request.secondRevision);
  const contexts: DuplicateAiInput["contexts"][number][] = [],
    sources: DuplicateAiInput["sources"][number][] = [];
  for (const ref of [...first.material.contexts, ...second.material.contexts]) {
    if (contexts.some((context) => context.id === ref.id && context.revisionId === ref.revisionId))
      continue;
    const row = (
      await db
        .select({ context: s.contexts, revision: s.contextRevisions })
        .from(s.contexts)
        .innerJoin(
          s.contextRevisions,
          and(
            eq(s.contextRevisions.contextId, s.contexts.id),
            eq(s.contextRevisions.id, ref.revisionId),
          ),
        )
        .where(and(eq(s.contexts.id, ref.id), eq(s.contexts.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!row)
      throw new ApplicationError({
        code: "NotFound",
        message: "A compared context revision is unavailable.",
      });
    contexts.push({
      id: ref.id,
      revisionId: ref.revisionId,
      data: row.revision.data,
      aggregateRevision: row.context.revision,
      currentRevisionId: row.context.currentRevisionId,
    });
  }
  for (const citation of [...first.material.citations, ...second.material.citations]) {
    if (sources.some((source) => source.id === citation.sourceId)) continue;
    const source = (
      await db
        .select()
        .from(s.sources)
        .where(and(eq(s.sources.id, citation.sourceId), eq(s.sources.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!source)
      throw new ApplicationError({
        code: "NotFound",
        message: "A compared source is unavailable.",
      });
    sources.push({
      id: source.id,
      revision: source.revision,
      title: source.title,
      kind: source.kind,
      digest: source.digest,
      state: source.state,
      currentProcessingId: source.currentProcessingId,
    });
  }
  const input: DuplicateAiInput = {
    type: "duplicate-comparison",
    pair: { id: pair.id, revision: pair.revision },
    first,
    second,
    contexts,
    sources,
  };
  for (const guard of duplicateInputGuards(db, ownerId, input)) await guard.check();
  return input;
}
/** Optional AI attribution never changes manual merge/separate behavior and must still refer to current reviewed inputs. */
export async function reviewedComparisonGuards(
  db: Database,
  actor: Principal,
  origin: ReviewedComparisonOrigin | undefined,
  expected: { pairId: string } | { claimIds: readonly string[] },
): Promise<readonly Guard[]> {
  if (!origin) return [];
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can attribute a disposition to an AI comparison.",
    });
  const row = (
    await db
      .select({ proposal: s.duplicateAiProposals, task: s.duplicateAiTasks })
      .from(s.duplicateAiProposals)
      .innerJoin(s.duplicateAiTasks, eq(s.duplicateAiTasks.id, s.duplicateAiProposals.taskId))
      .where(
        and(
          eq(s.duplicateAiProposals.id, origin.id),
          eq(s.duplicateAiTasks.ownerId, actor.ownerId),
        ),
      )
      .limit(1)
  )[0];
  if (!row)
    throw new ApplicationError({
      code: "NotFound",
      message: "Reviewed duplicate comparison not found.",
    });
  const matches =
    "pairId" in expected
      ? row.task.pairId === expected.pairId
      : expected.claimIds.length === 2 &&
        expected.claimIds.includes(row.task.firstClaimId) &&
        expected.claimIds.includes(row.task.secondClaimId);
  if (!matches || row.proposal.state !== "Accepted" || row.proposal.digest !== origin.digest)
    throw new ApplicationError({
      code: "Conflict",
      message: "Choose the exact reviewed comparison for these claims.",
    });
  const guards = [
    duplicateGuard(
      db,
      sql`EXISTS (SELECT 1 FROM duplicate_ai_proposals WHERE id=${origin.id} AND digest=${origin.digest} AND state='Accepted')`,
      "The reviewed comparison changed.",
    ),
    ...duplicateInputGuards(db, actor.ownerId, row.task.input),
  ];
  for (const guard of guards) await guard.check();
  return guards;
}
