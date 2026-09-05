import {
  ApplicationError,
  type CapturedEvidence,
  canonicalJson,
  type EvidenceStatus,
  EXPORT_POLICY_VERSION,
  exportIssues,
  fingerprint,
  type LibraryGraphNode,
  newId,
  type SourceFields,
  sourceExportIssues,
} from "@river/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Guard } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

const conflict = () => {
  throw new ApplicationError({
    code: "Conflict",
    message: "Checkpoint evidence changed. Refresh and review the current report.",
  });
};
/** Collect immutable material plus a guarded observation of every mutable review/context record. */
export const observeCheckpointEvidence = async (
  db: Database,
  ownerId: string,
  references: readonly { claimId: string; revisionId: string }[],
) => {
  const refs = [...new Map(references.map((ref) => [ref.revisionId, ref])).values()];
  if (refs.length > 500)
    throw new ApplicationError({
      code: "InvalidInput",
      message: "A checkpoint supports at most 500 Evidence Revisions.",
    });
  const captured: CapturedEvidence[] = [],
    statuses: EvidenceStatus[] = [],
    claimVersions = new Map<string, number>(),
    contextVersions = new Map<string, number>();
  for (let offset = 0; offset < refs.length; offset += 80) {
    const chunk = refs.slice(offset, offset + 80),
      ids = chunk.map((ref) => ref.revisionId);
    const rows = await db
      .select({ claim: s.claims, revision: s.evidenceRevisions, decision: s.reviewDecisions })
      .from(s.evidenceRevisions)
      .innerJoin(s.claims, eq(s.claims.id, s.evidenceRevisions.claimId))
      .leftJoin(
        s.reviewDecisions,
        sql`${s.reviewDecisions.id} = (SELECT d.id FROM evidence_review_decisions d WHERE d.claim_id = ${s.claims.id} AND d.revision_id = ${s.evidenceRevisions.id} ORDER BY d.created_at DESC, d.id DESC LIMIT 1)`,
      )
      .where(and(eq(s.claims.ownerId, ownerId), inArray(s.evidenceRevisions.id, ids)));
    const contexts = await db
      .select({ ref: s.evidenceContexts, context: s.contexts, revision: s.contextRevisions })
      .from(s.evidenceContexts)
      .innerJoin(s.contexts, eq(s.contexts.id, s.evidenceContexts.contextId))
      .innerJoin(
        s.contextRevisions,
        eq(s.contextRevisions.id, s.evidenceContexts.contextRevisionId),
      )
      .where(and(inArray(s.evidenceContexts.revisionId, ids), eq(s.contexts.ownerId, ownerId)));
    for (const ref of chunk) {
      const row = rows.find(
        (row) => row.claim.id === ref.claimId && row.revision.id === ref.revisionId,
      );
      if (!row)
        throw new ApplicationError({
          code: "NotFound",
          message: "Checkpoint evidence is unavailable.",
        });
      const related = contexts.filter((context) => context.ref.revisionId === row.revision.id);
      if (related.length !== row.revision.material.contexts.length)
        throw new ApplicationError({
          code: "NotFound",
          message: "A pinned evidence context is unavailable.",
        });
      const previousClaim = claimVersions.get(row.claim.id);
      if (previousClaim !== undefined && previousClaim !== row.claim.revision) conflict();
      claimVersions.set(row.claim.id, row.claim.revision);
      for (const { context } of related) {
        const previous = contextVersions.get(context.id);
        if (previous !== undefined && previous !== context.revision) conflict();
        contextVersions.set(context.id, context.revision);
      }
      captured.push({
        claimId: row.claim.id,
        revisionId: row.revision.id,
        material: row.revision.material,
        contexts: related.map(({ context, revision }) => ({
          id: context.id,
          revisionId: revision.id,
          data: revision.data,
        })),
      });
      statuses.push({
        claimId: row.claim.id,
        revisionId: row.revision.id,
        currentRevisionId: row.claim.currentRevisionId,
        archived: row.claim.archivedAt !== null,
        state: row.decision?.state ?? "Draft",
        rationale: row.decision?.rationale ?? "",
        decisionId: row.decision?.id ?? null,
        contexts: related.map(({ context, revision }) => ({
          id: context.id,
          revisionId: revision.id,
          currentRevisionId: context.currentRevisionId,
        })),
      });
    }
  }
  const guards: Guard[] = [];
  for (const [table, versions] of [
    ["evidence_claims", claimVersions],
    ["contexts", contextVersions],
  ] as const) {
    if (!versions.size) continue;
    const observed = JSON.stringify([...versions].map(([id, revision]) => ({ id, revision })));
    guards.push({
      condition: sql`NOT EXISTS (SELECT 1 FROM json_each(${observed}) observation LEFT JOIN ${sql.raw(table)} current ON current.id = json_extract(observation.value, '$.id') AND current.owner_id = ${ownerId} WHERE current.id IS NULL OR current.revision != json_extract(observation.value, '$.revision'))`,
      check: async () => {
        conflict();
      },
    });
  }
  return {
    captured,
    statuses,
    guards,
    dependencies: {
      claims: [...claimVersions].map(([id, revision]) => ({ id, revision })),
      contexts: [...contextVersions].map(([id, revision]) => ({ id, revision })),
    },
  };
};
export const createCheckpointReview = async (
  checkpointId: string,
  data: typeof s.checkpoints.$inferSelect.data,
  graph: readonly LibraryGraphNode[],
  evidence: readonly CapturedEvidence[],
  statuses: readonly EvidenceStatus[],
  sourceFields?: SourceFields,
) => {
  const issues = sourceFields
    ? sourceExportIssues(sourceFields, evidence, statuses)
    : exportIssues(data, graph, evidence, statuses);
  const policyVersion = sourceFields ? "river-source-evidence-export-v1" : EXPORT_POLICY_VERSION;
  if (issues.length > 5000)
    throw new ApplicationError({
      code: "InvalidInput",
      message: "The checkpoint exceeds 5,000 review issues. Reduce its evidence references.",
    });
  return {
    id: newId(),
    checkpointId,
    policyVersion,
    digest: await fingerprint(canonicalJson({ checkpointId, policy: policyVersion, issues })),
    issues,
    evidence: statuses,
    createdAt: Date.now(),
  };
};
