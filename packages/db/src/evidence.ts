import type {
  ArchiveEvidenceRequest,
  CreateEvidenceRequest,
  DismissDuplicateRequest,
  EditEvidenceRequest,
  EvidenceMetadataRequest,
  EvidenceSearch,
  MergeEvidenceRequest,
  ReviewEvidenceRequest,
  SaveContextRequest,
} from "@river/contracts";
import {
  ApplicationError,
  canonicalJson,
  duplicateSimilarity,
  type EvidenceMaterial,
  type EvidenceMetadata,
  newId,
  type Principal,
  requireReview,
} from "@river/domain";
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { createCommands, type Guard, type Write } from "./commands";
import { reviewedComparisonGuards } from "./duplicate-inputs";
import type { Database } from "./index";
import * as s from "./schema";

export function createEvidenceRepository(db: Database) {
  const commands = createCommands(db);
  const getClaim = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(s.claims)
        .where(and(eq(s.claims.ownerId, ownerId), eq(s.claims.id, id)))
        .limit(1)
    )[0];
  const getContext = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(s.contexts)
        .where(and(eq(s.contexts.ownerId, ownerId), eq(s.contexts.id, id)))
        .limit(1)
    )[0];
  const getEvidenceRevision = async (ownerId: string, id: string) =>
    (
      await db
        .select({ revision: s.evidenceRevisions })
        .from(s.evidenceRevisions)
        .innerJoin(s.claims, eq(s.evidenceRevisions.claimId, s.claims.id))
        .where(and(eq(s.claims.ownerId, ownerId), eq(s.evidenceRevisions.id, id)))
        .limit(1)
    )[0]?.revision;
  const claimGuard = (ownerId: string, id: string, revision: number): Guard => ({
    condition: sql`EXISTS (SELECT 1 FROM evidence_claims WHERE id = ${id} AND owner_id = ${ownerId} AND revision = ${revision})`,
    check: async () => {
      await observedClaim(ownerId, id, revision);
    },
  });
  async function observedClaim(ownerId: string, id: string, revision: number) {
    const claim = await getClaim(ownerId, id);
    if (!claim)
      throw new ApplicationError({ code: "NotFound", message: "Evidence Claim not found." });
    if (claim.revision !== revision)
      throw new ApplicationError({
        code: "Conflict",
        message: "This claim changed elsewhere. Compare the latest revision before saving.",
        expectedRevision: revision,
        observedRevision: claim.revision,
      });
    return claim;
  }
  const searchText = (material: EvidenceMaterial, metadata: EvidenceMetadata) =>
    [material.assertion, metadata.label, ...metadata.tags, metadata.notes].join("\n");
  const revisionWrites = (
    actorId: string,
    claimId: string,
    revisionId: string,
    material: EvidenceMaterial,
  ): Write[] => [
    db
      .insert(s.evidenceRevisions)
      .values({ id: revisionId, claimId, material, actorId, createdAt: Date.now() }),
    ...Array.from(
      new Map(
        material.citations.map((citation) => [
          `${citation.sourceId}:${citation.processingId}`,
          citation,
        ]),
      ).values(),
    ).map((citation) =>
      db
        .insert(s.citationReferences)
        .values({ revisionId, sourceId: citation.sourceId, processingId: citation.processingId }),
    ),
    ...material.contexts.map((context) =>
      db
        .insert(s.evidenceContexts)
        .values({ revisionId, contextId: context.id, contextRevisionId: context.revisionId }),
    ),
  ];
  async function duplicateWrites(
    ownerId: string,
    claimId: string,
    revisionId: string,
    assertion: string,
  ) {
    const candidates = await db
      .select()
      .from(s.claims)
      .where(
        and(eq(s.claims.ownerId, ownerId), isNull(s.claims.archivedAt), ne(s.claims.id, claimId)),
      )
      .orderBy(desc(s.claims.updatedAt))
      .limit(500);
    return candidates.flatMap((candidate) => {
      const similarity = duplicateSimilarity(assertion, candidate.assertion);
      if (similarity < 0.8) return [];
      const first = claimId < candidate.id;
      return [
        db
          .insert(s.duplicatePairs)
          .values({
            id: newId(),
            ownerId,
            firstId: first ? claimId : candidate.id,
            firstRevisionId: first ? revisionId : candidate.currentRevisionId,
            secondId: first ? candidate.id : claimId,
            secondRevisionId: first ? candidate.currentRevisionId : revisionId,
            similarity: Math.round(similarity * 100),
            state: "Pending",
            createdAt: Date.now(),
          })
          .onConflictDoNothing(),
      ];
    });
  }
  const prepareEvidenceCreate = async (
    actor: Principal,
    metadata: EvidenceMetadata,
    material: EvidenceMaterial,
  ) => {
    const id = newId();
    const revisionId = newId();
    const now = Date.now();
    const record = {
      id,
      ownerId: actor.ownerId,
      revision: 0,
      currentRevisionId: revisionId,
      assertion: material.assertion,
      metadata,
      reviewState: "Draft" as const,
      searchText: searchText(material, metadata),
      createdAt: now,
      updatedAt: now,
    };
    return {
      result: { id, revision: 0, revisionId },
      writes: [
        db.insert(s.claims).values(record),
        ...revisionWrites(actor.id, id, revisionId, material),
        ...(await duplicateWrites(actor.ownerId, id, revisionId, material.assertion)),
      ],
      history: [{ entityId: id, after: { ...record, material } }],
    };
  };
  return {
    prepareEvidenceCreate,
    replayCommand: commands.replayCommand,
    getClaim,
    getContext,
    getEvidenceRevision,
    async getContextRevision(ownerId: string, id: string, revisionId: string) {
      return (
        await db
          .select({ revision: s.contextRevisions })
          .from(s.contextRevisions)
          .innerJoin(s.contexts, eq(s.contextRevisions.contextId, s.contexts.id))
          .where(
            and(
              eq(s.contexts.ownerId, ownerId),
              eq(s.contexts.id, id),
              eq(s.contextRevisions.id, revisionId),
            ),
          )
          .limit(1)
      )[0]?.revision;
    },
    async listContexts(ownerId: string) {
      return db
        .select({ record: s.contexts, revision: s.contextRevisions })
        .from(s.contexts)
        .innerJoin(s.contextRevisions, eq(s.contexts.currentRevisionId, s.contextRevisions.id))
        .where(eq(s.contexts.ownerId, ownerId))
        .orderBy(desc(s.contexts.updatedAt))
        .limit(200);
    },
    async saveContext(actor: Principal, input: SaveContextRequest) {
      return commands.commit(actor, "save-context", input.idempotencyKey, input, async () => {
        if (!input.data.label.trim())
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Give this context a label.",
          });
        if ((input.id === null) !== (input.revision === null))
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Existing context changes require the observed revision.",
          });
        const previous = input.id ? await getContext(actor.ownerId, input.id) : undefined;
        if (input.id && !previous)
          throw new ApplicationError({ code: "NotFound", message: "Context not found." });
        if (previous && previous.revision !== input.revision)
          throw new ApplicationError({
            code: "Conflict",
            message: "This context changed elsewhere.",
            expectedRevision: input.revision ?? 0,
            observedRevision: previous.revision,
          });
        if (previous && previous.kind !== input.data.kind)
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Create a new context to use a different type.",
          });
        if (
          input.data.kind === "Owner Profile" &&
          !previous &&
          (
            await db
              .select()
              .from(s.contexts)
              .where(
                and(eq(s.contexts.ownerId, actor.ownerId), eq(s.contexts.kind, "Owner Profile")),
              )
              .limit(1)
          ).length
        )
          throw new ApplicationError({
            code: "Conflict",
            message: "An Owner Profile already exists. Edit that context instead.",
          });
        const id = input.id ?? newId();
        const revisionId = newId();
        const revision = previous ? previous.revision + 1 : 0;
        const now = Date.now();
        const record = {
          id,
          ownerId: actor.ownerId,
          kind: input.data.kind,
          label: input.data.label,
          revision,
          currentRevisionId: revisionId,
          updatedAt: now,
        };
        const guards: Guard[] = previous
          ? [
              {
                condition: sql`EXISTS (SELECT 1 FROM contexts WHERE id = ${id} AND owner_id = ${actor.ownerId} AND revision = ${previous.revision})`,
                check: async () => {
                  const current = await getContext(actor.ownerId, id);
                  if (current?.revision !== previous.revision)
                    throw new ApplicationError({
                      code: "Conflict",
                      message: "This context changed elsewhere.",
                      expectedRevision: previous.revision,
                      observedRevision: current?.revision,
                    });
                },
              },
            ]
          : [];
        return {
          result: { id, revision, revisionId },
          guards,
          writes: [
            previous
              ? db.update(s.contexts).set(record).where(eq(s.contexts.id, id))
              : db.insert(s.contexts).values({ ...record, createdAt: now }),
            db.insert(s.contextRevisions).values({
              id: revisionId,
              contextId: id,
              data: input.data,
              actorId: actor.id,
              createdAt: now,
            }),
          ],
          history: [
            { entityId: id, before: previous ?? null, after: { ...record, data: input.data } },
          ],
        };
      });
    },
    async createEvidence(
      actor: Principal,
      input: typeof CreateEvidenceRequest.Type,
      material: EvidenceMaterial,
    ) {
      return commands.commit(actor, "create-evidence", input.idempotencyKey, input, async () => {
        const plan = await prepareEvidenceCreate(actor, input.metadata, material);
        if (!input.originCandidate) return plan;
        if (actor.kind !== "owner")
          throw new ApplicationError({
            code: "Forbidden",
            message: "Only the Owner can create a manual draft from an AI candidate.",
          });
        const origin = (
          await db
            .select({ id: s.sourceCandidates.id })
            .from(s.sourceCandidates)
            .innerJoin(s.sourceAiTasks, eq(s.sourceAiTasks.id, s.sourceCandidates.taskId))
            .where(
              and(
                eq(s.sourceCandidates.id, input.originCandidate.id),
                eq(s.sourceCandidates.digest, input.originCandidate.digest),
                eq(s.sourceAiTasks.ownerId, actor.ownerId),
              ),
            )
            .limit(1)
        )[0];
        if (!origin)
          throw new ApplicationError({
            code: "NotFound",
            message: "The original claim candidate identity is unavailable.",
          });
        return {
          ...plan,
          history: plan.history.map((item) => ({
            ...item,
            after: {
              ...item.after,
              originCandidate: input.originCandidate,
              reviewMode: "independent-manual-draft",
            },
          })),
        };
      });
    },
    async editEvidence(
      actor: Principal,
      input: typeof EditEvidenceRequest.Type,
      material: EvidenceMaterial,
    ) {
      return commands.commit(actor, "edit-evidence", input.idempotencyKey, input, async () => {
        const previous = await observedClaim(actor.ownerId, input.id, input.revision);
        if (previous.archivedAt !== null)
          throw new ApplicationError({
            code: "Conflict",
            message: "Restore this claim before editing it.",
          });
        const before = await getEvidenceRevision(actor.ownerId, previous.currentRevisionId);
        if (canonicalJson(before?.material) === canonicalJson(material))
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Change the assertion, citations, or context before saving a new revision.",
          });
        const revisionId = newId();
        const revision = previous.revision + 1;
        const next = {
          assertion: material.assertion,
          currentRevisionId: revisionId,
          revision,
          reviewState: "Draft" as const,
          currentDecisionId: null,
          searchText: searchText(material, previous.metadata),
          updatedAt: Date.now(),
        };
        return {
          result: { id: input.id, revision, revisionId },
          guards: [claimGuard(actor.ownerId, input.id, input.revision)],
          writes: [
            db.update(s.claims).set(next).where(eq(s.claims.id, input.id)),
            ...revisionWrites(actor.id, input.id, revisionId, material),
            ...(await duplicateWrites(actor.ownerId, input.id, revisionId, material.assertion)),
          ],
          history: [
            {
              entityId: input.id,
              before: { ...previous, material: before?.material },
              after: { ...previous, ...next, material },
            },
          ],
        };
      });
    },
    async updateEvidenceMetadata(actor: Principal, input: typeof EvidenceMetadataRequest.Type) {
      return commands.commit(actor, "evidence-metadata", input.idempotencyKey, input, async () => {
        const previous = await observedClaim(actor.ownerId, input.id, input.revision);
        const material = await getEvidenceRevision(actor.ownerId, previous.currentRevisionId);
        if (!material)
          throw new ApplicationError({ code: "NotFound", message: "Evidence Revision not found." });
        const next = {
          metadata: input.metadata,
          revision: previous.revision + 1,
          searchText: searchText(material.material, input.metadata),
          updatedAt: Date.now(),
        };
        return {
          result: { id: input.id, revision: next.revision, revisionId: previous.currentRevisionId },
          guards: [claimGuard(actor.ownerId, input.id, input.revision)],
          writes: [db.update(s.claims).set(next).where(eq(s.claims.id, input.id))],
          history: [{ entityId: input.id, before: previous, after: { ...previous, ...next } }],
        };
      });
    },
    async reviewEvidence(actor: Principal, input: typeof ReviewEvidenceRequest.Type) {
      return commands.commit(actor, "review-evidence", input.idempotencyKey, input, async () => {
        const previous = await observedClaim(actor.ownerId, input.id, input.revision);
        if (previous.currentRevisionId !== input.revisionId || previous.archivedAt !== null)
          throw new ApplicationError({
            code: "Conflict",
            message: "Review the current active Evidence Revision.",
          });
        const material = await getEvidenceRevision(actor.ownerId, input.revisionId);
        if (!material)
          throw new ApplicationError({ code: "NotFound", message: "Evidence Revision not found." });
        requireReview(material.material, input.state, input.rationale);
        const id = newId();
        const revision = previous.revision + 1;
        const decision = {
          id,
          claimId: input.id,
          revisionId: input.revisionId,
          state: input.state,
          rationale: input.rationale,
          actorId: actor.id,
          createdAt: Date.now(),
        };
        return {
          result: { id: input.id, revision, revisionId: input.revisionId },
          guards: [claimGuard(actor.ownerId, input.id, input.revision)],
          writes: [
            db.insert(s.reviewDecisions).values(decision),
            db
              .update(s.claims)
              .set({
                reviewState: input.state,
                currentDecisionId: id,
                revision,
                updatedAt: Date.now(),
              })
              .where(eq(s.claims.id, input.id)),
          ],
          history: [
            {
              entityId: input.id,
              before: {
                revision: previous.revision,
                state: previous.reviewState,
                decisionId: previous.currentDecisionId,
              },
              after: { revision, decision },
            },
          ],
        };
      });
    },
    async archiveEvidence(actor: Principal, input: typeof ArchiveEvidenceRequest.Type) {
      return commands.commit(actor, "archive-evidence", input.idempotencyKey, input, async () => {
        const previous = await observedClaim(actor.ownerId, input.id, input.revision);
        if (!input.rationale.trim())
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Record why this claim is archived or restored.",
          });
        const next = {
          archivedAt: input.archived ? Date.now() : null,
          mergedIntoId: input.archived ? previous.mergedIntoId : null,
          revision: previous.revision + 1,
          updatedAt: Date.now(),
        };
        return {
          result: { id: input.id, revision: next.revision, revisionId: previous.currentRevisionId },
          guards: [claimGuard(actor.ownerId, input.id, input.revision)],
          writes: [db.update(s.claims).set(next).where(eq(s.claims.id, input.id))],
          history: [
            {
              entityId: input.id,
              before: previous,
              after: { ...previous, ...next, rationale: input.rationale },
            },
          ],
        };
      });
    },
    async mergeEvidence(
      actor: Principal,
      input: typeof MergeEvidenceRequest.Type,
      material: EvidenceMaterial,
    ) {
      return commands.commit(actor, "merge-evidence", input.idempotencyKey, input, async () => {
        if (input.id === input.sourceId || !input.rationale.trim())
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Choose two distinct claims and record a merge rationale.",
          });
        const target = await observedClaim(actor.ownerId, input.id, input.revision);
        const source = await observedClaim(actor.ownerId, input.sourceId, input.sourceRevision);
        const comparisonGuards = await reviewedComparisonGuards(db, actor, input.comparisonOrigin, {
          claimIds: [target.id, source.id],
        });
        if (target.archivedAt !== null || source.archivedAt !== null)
          throw new ApplicationError({
            code: "Conflict",
            message: "Both claims must be active before merging.",
          });
        const revisionId = newId();
        const revision = target.revision + 1;
        const now = Date.now();
        const next = {
          assertion: material.assertion,
          revision,
          currentRevisionId: revisionId,
          reviewState: "Draft" as const,
          currentDecisionId: null,
          searchText: searchText(material, target.metadata),
          updatedAt: now,
        };
        const archived = {
          archivedAt: now,
          mergedIntoId: target.id,
          revision: source.revision + 1,
          updatedAt: now,
        };
        return {
          result: { id: target.id, revision, revisionId },
          guards: [
            claimGuard(actor.ownerId, target.id, target.revision),
            claimGuard(actor.ownerId, source.id, source.revision),
            ...comparisonGuards,
          ],
          writes: [
            db.update(s.claims).set(next).where(eq(s.claims.id, target.id)),
            ...revisionWrites(actor.id, target.id, revisionId, material),
            db.update(s.claims).set(archived).where(eq(s.claims.id, source.id)),
          ],
          history: [
            {
              entityId: target.id,
              before: target,
              after: {
                ...target,
                ...next,
                material,
                rationale: input.rationale,
                mergedFromId: source.id,
                ...(input.comparisonOrigin ? { comparisonOrigin: input.comparisonOrigin } : {}),
              },
            },
            {
              entityId: source.id,
              before: source,
              after: { ...source, ...archived, rationale: input.rationale },
            },
          ],
        };
      });
    },
    async searchEvidence(ownerId: string, input: EvidenceSearch) {
      const terms =
        input.query
          .normalize("NFKC")
          .match(/[\p{L}\p{N}]+/gu)
          ?.slice(0, 20) ?? [];
      const match = terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" AND ");
      const where = and(
        eq(s.claims.ownerId, ownerId),
        input.archived === null
          ? undefined
          : input.archived
            ? isNotNull(s.claims.archivedAt)
            : isNull(s.claims.archivedAt),
        input.status === "All" ? undefined : eq(s.claims.reviewState, input.status),
        input.contextId
          ? sql`EXISTS (SELECT 1 FROM evidence_context_references WHERE revision_id = ${s.claims.currentRevisionId} AND context_id = ${input.contextId})`
          : undefined,
        match
          ? sql`(${s.claims.id} IN (SELECT claim_id FROM evidence_search WHERE evidence_search MATCH ${match}) OR EXISTS (
              SELECT 1 FROM evidence_context_references r JOIN context_revisions cr ON cr.id = r.context_revision_id
              WHERE r.revision_id = ${s.claims.currentRevisionId} AND ${sql.join(
                terms.map(
                  (term) =>
                    sql`lower(json_extract(cr.data, '$.label')) LIKE ${`%${term.toLowerCase()}%`}`,
                ),
                sql` AND `,
              )}
            ))`
          : undefined,
      );
      const items = await db
        .select()
        .from(s.claims)
        .where(where)
        .orderBy(desc(s.claims.updatedAt), desc(s.claims.id))
        .limit(51)
        .offset(input.offset);
      return { items: items.slice(0, 50), hasMore: items.length > 50 };
    },
    async evidenceHistory(ownerId: string, id: string) {
      if (!(await getClaim(ownerId, id)))
        throw new ApplicationError({ code: "NotFound", message: "Evidence Claim not found." });
      return {
        revisions: await db
          .select()
          .from(s.evidenceRevisions)
          .where(eq(s.evidenceRevisions.claimId, id))
          .orderBy(desc(s.evidenceRevisions.createdAt)),
        decisions: await db
          .select()
          .from(s.reviewDecisions)
          .where(eq(s.reviewDecisions.claimId, id))
          .orderBy(desc(s.reviewDecisions.createdAt)),
        activity: await db
          .select()
          .from(s.audit)
          .where(eq(s.audit.entityId, id))
          .orderBy(desc(s.audit.createdAt))
          .limit(100),
      };
    },
    async listDuplicates(ownerId: string) {
      // Reconcile the derived suggestions after concurrent creates or interrupted requests.
      // The bounded recent window is a heuristic; it never changes a claim or review decision.
      const recent = await db
        .select()
        .from(s.claims)
        .where(and(eq(s.claims.ownerId, ownerId), isNull(s.claims.archivedAt)))
        .orderBy(desc(s.claims.updatedAt))
        .limit(500);
      const existing = await db
        .select({
          first: s.duplicatePairs.firstRevisionId,
          second: s.duplicatePairs.secondRevisionId,
        })
        .from(s.duplicatePairs)
        .where(
          and(
            eq(s.duplicatePairs.ownerId, ownerId),
            sql`EXISTS (SELECT 1 FROM evidence_claims WHERE current_revision_id = ${s.duplicatePairs.firstRevisionId} AND archived_at IS NULL)`,
            sql`EXISTS (SELECT 1 FROM evidence_claims WHERE current_revision_id = ${s.duplicatePairs.secondRevisionId} AND archived_at IS NULL)`,
          ),
        );
      const known = new Set(existing.map((pair) => `${pair.first}:${pair.second}`));
      const repairs: Write[] = [];
      scan: for (const [index, claim] of recent.entries()) {
        for (const candidate of recent.slice(index + 1)) {
          const [first, second] = claim.id < candidate.id ? [claim, candidate] : [candidate, claim];
          if (known.has(`${first.currentRevisionId}:${second.currentRevisionId}`)) continue;
          const similarity = duplicateSimilarity(first.assertion, second.assertion);
          if (similarity < 0.8) continue;
          repairs.push(
            db
              .insert(s.duplicatePairs)
              .values({
                id: newId(),
                ownerId,
                firstId: first.id,
                firstRevisionId: first.currentRevisionId,
                secondId: second.id,
                secondRevisionId: second.currentRevisionId,
                similarity: Math.round(similarity * 100),
                state: "Pending",
                createdAt: Date.now(),
              })
              .onConflictDoNothing(),
          );
          if (repairs.length === 50) break scan;
        }
      }
      const [repair, ...remaining] = repairs;
      if (repair) await db.batch([repair, ...remaining]);
      const pairs = await db
        .select()
        .from(s.duplicatePairs)
        .where(
          and(
            eq(s.duplicatePairs.ownerId, ownerId),
            eq(s.duplicatePairs.state, "Pending"),
            sql`EXISTS (SELECT 1 FROM evidence_claims WHERE id = ${s.duplicatePairs.firstId} AND current_revision_id = ${s.duplicatePairs.firstRevisionId} AND archived_at IS NULL)`,
            sql`EXISTS (SELECT 1 FROM evidence_claims WHERE id = ${s.duplicatePairs.secondId} AND current_revision_id = ${s.duplicatePairs.secondRevisionId} AND archived_at IS NULL)`,
          ),
        )
        .orderBy(desc(s.duplicatePairs.createdAt))
        .limit(50);
      const ids = [...new Set(pairs.flatMap((pair) => [pair.firstId, pair.secondId]))];
      const claims = ids.length
        ? await db
            .select()
            .from(s.claims)
            .where(and(eq(s.claims.ownerId, ownerId), inArray(s.claims.id, ids)))
        : [];
      return pairs.map((pair) => ({
        ...pair,
        first: claims.find((claim) => claim.id === pair.firstId),
        second: claims.find((claim) => claim.id === pair.secondId),
      }));
    },
    async dismissDuplicate(actor: Principal, input: typeof DismissDuplicateRequest.Type) {
      return commands.commit(actor, "dismiss-duplicate", input.idempotencyKey, input, async () => {
        const pair = (
          await db
            .select()
            .from(s.duplicatePairs)
            .where(
              and(eq(s.duplicatePairs.id, input.id), eq(s.duplicatePairs.ownerId, actor.ownerId)),
            )
            .limit(1)
        )[0];
        if (!pair)
          throw new ApplicationError({
            code: "NotFound",
            message: "Duplicate comparison not found.",
          });
        const first = await getClaim(actor.ownerId, pair.firstId);
        const second = await getClaim(actor.ownerId, pair.secondId);
        const comparisonGuards = await reviewedComparisonGuards(db, actor, input.comparisonOrigin, {
          pairId: pair.id,
        });
        if (
          pair.revision !== input.revision ||
          pair.state !== "Pending" ||
          first?.currentRevisionId !== pair.firstRevisionId ||
          second?.currentRevisionId !== pair.secondRevisionId ||
          first.archivedAt !== null ||
          second.archivedAt !== null
        )
          throw new ApplicationError({
            code: "Conflict",
            message: "These claims changed. Review the current comparison.",
          });
        if (!input.rationale.trim())
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Record why these claims should stay separate.",
          });
        const guard: Guard = {
          condition: sql`EXISTS (SELECT 1 FROM evidence_duplicates WHERE id = ${pair.id} AND revision = ${input.revision} AND state = 'Pending')`,
          check: async () => {
            throw new ApplicationError({
              code: "Conflict",
              message: "This comparison was already reviewed.",
            });
          },
        };
        return {
          result: { id: pair.id, revision: pair.revision + 1, revisionId: null },
          guards: [
            claimGuard(actor.ownerId, first.id, first.revision),
            claimGuard(actor.ownerId, second.id, second.revision),
            ...comparisonGuards,
            guard,
          ],
          writes: [
            db
              .update(s.duplicatePairs)
              .set({ state: "Separate", revision: pair.revision + 1, rationale: input.rationale })
              .where(eq(s.duplicatePairs.id, pair.id)),
          ],
          history: [
            {
              entityId: pair.id,
              before: pair,
              after: {
                state: "Separate",
                rationale: input.rationale,
                ...(input.comparisonOrigin ? { comparisonOrigin: input.comparisonOrigin } : {}),
              },
            },
          ],
        };
      });
    },
  };
}
