import type {
  ArtifactManifest,
  RetrySourceRefinementRequest,
  ReviewSourceRefinementRequest,
  SourceRefinementList,
  StartSourceRefinementRequest,
} from "@river/contracts";
import { ApplicationError, canonicalJson, fingerprint, newId, type Principal } from "@river/domain";
import {
  captureSourceCandidate,
  compareSourceCandidate,
  refinedSourceIdentity,
  SOURCE_RENDERER_VERSION,
  type SourceRefinementProfile,
  sourceCandidateDigest,
  structuredSourceFields,
  validateSourceFields,
  validateTextManifest,
} from "@river/templates";
import { and, desc, eq, sql } from "drizzle-orm";
import { aiCapacityGuard } from "./ai-capacity";
import { createCheckpointReview, observeCheckpointEvidence } from "./checkpoint-review";
import { createCheckpointRepository } from "./checkpoints";
import { conditionGuard, createCommands, type Write } from "./commands";
import type { Database } from "./index";
import type { RefinementBaseArtifacts, SourceRefinementInput } from "./refinement-types";
import * as s from "./schema";

function fail(code: "Conflict" | "InvalidInput" | "Unavailable", message: string): never {
  throw new ApplicationError({ code, message });
}
function owner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can refine or review résumé source.",
    });
}
export function createSourceRefinementRepository(db: Database) {
  const commands = createCommands(db),
    checkpoints = createCheckpointRepository(db);
  const get = async (ownerId: string, id: string) => {
    const row = (
      await db
        .select({ task: s.sourceRefinementTasks, proposal: s.sourceRefinementProposals })
        .from(s.sourceRefinementTasks)
        .leftJoin(
          s.sourceRefinementProposals,
          eq(s.sourceRefinementProposals.taskId, s.sourceRefinementTasks.id),
        )
        .where(
          and(eq(s.sourceRefinementTasks.ownerId, ownerId), eq(s.sourceRefinementTasks.id, id)),
        )
        .limit(1)
    )[0];
    if (!row)
      throw new ApplicationError({
        code: "NotFound",
        message: "Source refinement task not found.",
      });
    return row;
  };
  type Detail = Awaited<ReturnType<typeof get>>;
  const taskGuard = (row: Detail) =>
    conditionGuard(
      db,
      sql`EXISTS (SELECT 1 FROM source_refinement_tasks WHERE id=${row.task.id} AND owner_id=${row.task.ownerId} AND revision=${row.task.revision} AND latest_operation_id=${row.task.latestOperationId})`,
      "This refinement changed. Refresh before continuing.",
    );
  const inputGuards = (task: Detail["task"]) => [
    conditionGuard(
      db,
      sql`EXISTS (SELECT 1 FROM checkpoint_state st JOIN resume_checkpoints c ON c.id=st.checkpoint_id JOIN operations o ON o.id=st.operation_id WHERE c.id=${task.baseCheckpointId} AND c.owner_id=${task.ownerId} AND o.id=${task.input.checkpoint.operationId} AND o.state='Succeeded' AND json_extract(o.artifacts,'$.fingerprint')=${task.input.checkpoint.artifacts.fingerprint})`,
      "The base checkpoint artifact identity changed.",
    ),
    ...(
      [
        ["evidence_claims", task.dependencies.claims],
        ["contexts", task.dependencies.contexts],
      ] as const
    ).map(([table, observed]) =>
      conditionGuard(
        db,
        sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(observed)}) expected WHERE NOT EXISTS (SELECT 1 FROM ${sql.raw(table)} current WHERE current.id=json_extract(expected.value,'$.id') AND current.owner_id=${task.ownerId} AND current.revision=json_extract(expected.value,'$.revision')))`,
        "Evidence, verification, context or lifecycle supplied to this proposal changed.",
      ),
    ),
  ];
  const pendingGuard = (row: Detail) =>
    conditionGuard(
      db,
      sql`EXISTS (SELECT 1 FROM source_refinement_proposals WHERE id=${row.proposal?.id ?? ""} AND task_id=${row.task.id} AND state='Pending' AND candidate_digest=${row.proposal?.candidateDigest ?? ""})`,
      "The exact Pending source proposal is no longer available.",
    );
  const operationGuard = (id: string) =>
    conditionGuard(
      db,
      sql`EXISTS (SELECT 1 FROM operations WHERE id=${id} AND state IN ('Pending','Running'))`,
      "This source operation was cancelled or already finished.",
    );
  const operationWrites = (
    ownerId: string,
    id: string,
    taskId: string,
    accepting = false,
  ): Write[] => [
    db.insert(s.operations).values({
      id,
      ownerId,
      input: { type: accepting ? "source-refinement-accept" : "source-refinement", taskId },
      state: "Pending",
      stage: accepting ? "Retaining reviewed checkpoint artifacts" : "Queued for source refinement",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    db.insert(s.dispatches).values({ operationId: id }),
  ];
  const operation = async (id: string) =>
    (await db.select().from(s.operations).where(eq(s.operations.id, id)).limit(1))[0];
  return {
    async startSourceRefinement(
      actor: Principal,
      request: StartSourceRefinementRequest,
      base: RefinementBaseArtifacts,
      profile: SourceRefinementProfile | null,
    ) {
      owner(actor);
      return commands.commit(
        actor,
        "start-source-refinement",
        request.idempotencyKey,
        request,
        async () => {
          if (!profile)
            fail(
              "Unavailable",
              "Source refinement is unavailable. Existing review and export remain available.",
            );
          const original = await checkpoints.inspectCheckpoint(actor.ownerId, request.checkpointId);
          if (
            original.state.operationId !== request.operationId ||
            base.operationId !== request.operationId ||
            original.operation?.state !== "Succeeded" ||
            !original.operation.artifacts?.validationPassed ||
            canonicalJson(base.artifacts) !== canonicalJson(original.operation.artifacts)
          )
            fail("Conflict", "Refinement requires the exact successful checkpoint artifact set.");
          const fields =
            original.source?.fields ??
            structuredSourceFields(original.checkpoint.data, original.checkpoint.graph);
          validateSourceFields(fields);
          if (original.source && original.source.source !== base.source)
            fail(
              "InvalidInput",
              "The retained source differs from its immutable checkpoint override.",
            );
          if (!validateTextManifest(fields, base.extractedText).passed)
            fail(
              "InvalidInput",
              "The base checkpoint text does not match its complete intended fields.",
            );
          const live = await observeCheckpointEvidence(
            db,
            actor.ownerId,
            original.checkpoint.evidence,
          );
          const input: SourceRefinementInput = {
            type: "source-refinement",
            goal: request.goal,
            checkpoint: {
              id: original.checkpoint.id,
              structuredBaseId: original.source?.structuredBaseId ?? original.checkpoint.id,
              snapshotId: original.checkpoint.snapshotId,
              operationId: request.operationId,
              source: base.source,
              extractedText: base.extractedText,
              fields,
              baseTemplateIdentity:
                original.source?.baseTemplateIdentity ?? original.checkpoint.templateIdentity,
              artifacts: base.artifacts,
              digests: base.digests,
            },
            evidence: live.captured,
            statuses: live.statuses,
          };
          if (!request.goal.trim() || canonicalJson(input).length > profile.maxInputCharacters)
            fail(
              "InvalidInput",
              "Provide a refinement instruction within the complete task input limit; River does not truncate checkpoint context.",
            );
          const id = newId(),
            operationId = newId(),
            capacity = aiCapacityGuard(db, actor.ownerId);
          await capacity.check();
          const task = {
            id,
            ownerId: actor.ownerId,
            baseCheckpointId: request.checkpointId,
            input,
            dependencies: live.dependencies,
            profile,
            latestOperationId: operationId,
            generationAttempts: 1,
            previewAttempts: 1,
            revision: 0,
            createdAt: Date.now(),
          };
          return {
            result: { id, revision: 0, revisionId: operationId },
            guards: [...inputGuards(task), ...live.guards, capacity],
            writes: [
              ...operationWrites(actor.ownerId, operationId, id),
              db.insert(s.sourceRefinementTasks).values(task),
            ],
            history: [
              {
                entityId: id,
                after: {
                  baseCheckpointId: request.checkpointId,
                  operationId,
                  profile: profile.contract,
                },
              },
            ],
          };
        },
      );
    },
    async inspectSourceRefinement(ownerId: string, id: string) {
      const row = await get(ownerId, id),
        staleReasons: string[] = [];
      for (const guard of inputGuards(row.task)) {
        try {
          await guard.check();
        } catch (error) {
          if (!(error instanceof ApplicationError)) throw error;
          staleReasons.push(error.message);
        }
      }
      return {
        ...row,
        staleReasons,
        operation: await operation(row.task.latestOperationId),
        acceptance: row.proposal?.acceptanceOperationId
          ? await operation(row.proposal.acceptanceOperationId)
          : null,
      };
    },
    async listSourceRefinements(ownerId: string, input: SourceRefinementList) {
      await checkpoints.inspectCheckpoint(ownerId, input.checkpointId);
      const rows = await db
        .select({
          id: s.sourceRefinementTasks.id,
          createdAt: s.sourceRefinementTasks.createdAt,
          revision: s.sourceRefinementTasks.revision,
          state: s.sourceRefinementProposals.state,
          operationId: s.sourceRefinementTasks.latestOperationId,
          resultCheckpointId: s.sourceRefinementProposals.resultCheckpointId,
        })
        .from(s.sourceRefinementTasks)
        .leftJoin(
          s.sourceRefinementProposals,
          eq(s.sourceRefinementProposals.taskId, s.sourceRefinementTasks.id),
        )
        .where(
          and(
            eq(s.sourceRefinementTasks.ownerId, ownerId),
            eq(s.sourceRefinementTasks.baseCheckpointId, input.checkpointId),
          ),
        )
        .orderBy(desc(s.sourceRefinementTasks.createdAt), desc(s.sourceRefinementTasks.id))
        .limit(21)
        .offset(input.offset);
      return { items: rows.slice(0, 20), hasMore: rows.length > 20 };
    },
    async publishSourceRefinementCandidate(
      ownerId: string,
      taskId: string,
      operationId: string,
      output: unknown,
    ) {
      const row = await get(ownerId, taskId),
        actor: Principal = { kind: "owner", id: ownerId, ownerId };
      if (row.proposal || row.task.latestOperationId !== operationId) return false;
      const id = newId(),
        candidate = captureSourceCandidate(
          row.task.input.checkpoint.fields,
          row.task.input.evidence,
          id,
          output,
        ),
        digest = await sourceCandidateDigest(candidate);
      try {
        await commands.commit(
          actor,
          "publish-source-refinement",
          operationId,
          { taskId, operationId },
          async () => ({
            result: { id: taskId, revision: row.task.revision + 1, revisionId: id },
            guards: [taskGuard(row), operationGuard(operationId), ...inputGuards(row.task)],
            writes: [
              db.insert(s.sourceRefinementProposals).values({
                id,
                taskId,
                state: "Pending",
                payload: candidate,
                candidateDigest: digest,
                createdAt: Date.now(),
              }),
              db
                .update(s.sourceRefinementTasks)
                .set({ revision: row.task.revision + 1 })
                .where(eq(s.sourceRefinementTasks.id, taskId)),
            ],
            history: [{ entityId: id, after: { taskId, candidateDigest: digest } }],
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof ApplicationError && error.code === "Conflict") return false;
        throw error;
      }
    },
    async publishSourceRefinementPreview(
      ownerId: string,
      taskId: string,
      operationId: string,
      artifacts: ArtifactManifest,
      extractedText: string,
      reportDigest: string,
    ) {
      const row = await get(ownerId, taskId),
        proposal = row.proposal;
      if (
        row.task.latestOperationId !== operationId ||
        proposal?.state !== "Pending" ||
        !proposal.payload
      )
        return false;
      const expectedIdentity = await refinedSourceIdentity(
        proposal.payload.source,
        proposal.payload.fields,
        row.task.input.checkpoint.baseTemplateIdentity,
      );
      if (
        artifacts.rendererVersion !== SOURCE_RENDERER_VERSION ||
        artifacts.templateIdentity !== expectedIdentity ||
        artifacts.validationPassed !==
          validateTextManifest(proposal.payload.fields, extractedText).passed ||
        !artifacts.expiresAt ||
        artifacts.expiresAt <= Date.now()
      )
        fail(
          "InvalidInput",
          "The source preview does not match the candidate's pinned renderer and input.",
        );
      const comparison = compareSourceCandidate(
        row.task.input.checkpoint,
        proposal.payload,
        extractedText,
      );
      if (
        new TextEncoder().encode(canonicalJson({ candidate: proposal.payload, comparison }))
          .byteLength > 1500000
      )
        fail(
          "InvalidInput",
          "The complete source review exceeds its storage limit. Reduce the candidate and generate a new proposal.",
        );
      const reviewDigest = await fingerprint(
        canonicalJson({
          candidateDigest: proposal.candidateDigest,
          comparison,
          artifacts,
          reportDigest,
        }),
      );
      const actor: Principal = { kind: "owner", id: ownerId, ownerId };
      try {
        await commands.commit(
          actor,
          "publish-source-preview",
          operationId,
          { taskId, operationId },
          async () => ({
            result: { id: taskId, revision: row.task.revision + 1, revisionId: proposal.id },
            guards: [
              taskGuard(row),
              pendingGuard(row),
              operationGuard(operationId),
              ...inputGuards(row.task),
            ],
            writes: [
              db
                .update(s.sourceRefinementProposals)
                .set({
                  comparison,
                  previewArtifacts: artifacts,
                  previewOperationId: operationId,
                  reviewDigest,
                })
                .where(eq(s.sourceRefinementProposals.id, proposal.id)),
              db
                .update(s.sourceRefinementTasks)
                .set({ revision: row.task.revision + 1 })
                .where(eq(s.sourceRefinementTasks.id, taskId)),
              db
                .update(s.operations)
                .set({
                  artifacts,
                  state: artifacts.validationPassed ? "Succeeded" : "Failed",
                  stage: artifacts.validationPassed
                    ? "Source proposal ready for review"
                    : "Source text integrity failed",
                  updatedAt: Date.now(),
                })
                .where(eq(s.operations.id, operationId)),
            ],
            history: [
              {
                entityId: proposal.id,
                after: {
                  previewOperationId: operationId,
                  reviewDigest,
                  validationPassed: artifacts.validationPassed,
                },
              },
            ],
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof ApplicationError && error.code === "Conflict") return false;
        throw error;
      }
    },
    async retrySourceRefinement(
      actor: Principal,
      request: RetrySourceRefinementRequest,
      profile: SourceRefinementProfile | null,
    ) {
      owner(actor);
      return commands.commit(
        actor,
        "retry-source-refinement",
        request.idempotencyKey,
        request,
        async () => {
          const row = await get(actor.ownerId, request.id),
            previous = await operation(row.task.latestOperationId);
          if (row.task.revision !== request.revision)
            fail("Conflict", "Refresh this refinement before retrying.");
          if (row.proposal && row.proposal.state !== "Pending")
            fail("Conflict", "This proposal already has a review decision.");
          if (row.proposal?.acceptanceOperationId)
            fail("Conflict", "Retry checkpoint publication from its acceptance action.");
          if (!previous || !["Failed", "Cancelled"].includes(previous.state))
            fail("Conflict", "Wait for the current source operation to finish.");
          const saved = Boolean(row.proposal?.payload);
          if (!saved && (!profile || canonicalJson(profile) !== canonicalJson(row.task.profile)))
            fail("Unavailable", "The original source task profile is unavailable.");
          if (row.task.previewAttempts >= 3 || (!saved && row.task.generationAttempts >= 3))
            fail("Unavailable", "This refinement reached its three-attempt limit.");
          const id = newId(),
            capacity = aiCapacityGuard(db, actor.ownerId);
          await capacity.check();
          return {
            result: { id: row.task.id, revision: request.revision + 1, revisionId: id },
            guards: [taskGuard(row), ...inputGuards(row.task), capacity],
            writes: [
              ...operationWrites(actor.ownerId, id, row.task.id),
              db
                .update(s.sourceRefinementTasks)
                .set({
                  latestOperationId: id,
                  revision: request.revision + 1,
                  generationAttempts: row.task.generationAttempts + (saved ? 0 : 1),
                  previewAttempts: row.task.previewAttempts + 1,
                })
                .where(eq(s.sourceRefinementTasks.id, row.task.id)),
            ],
            history: [
              { entityId: row.task.id, after: { operationId: id, reusedCandidate: saved } },
            ],
          };
        },
      );
    },
    async reviewSourceRefinement(actor: Principal, request: ReviewSourceRefinementRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "review-source-refinement",
        request.idempotencyKey,
        request,
        async () => {
          const row = await get(actor.ownerId, request.id),
            proposal = row.proposal;
          if (
            row.task.revision !== request.revision ||
            proposal?.id !== request.proposalId ||
            proposal?.state !== "Pending" ||
            !proposal.payload ||
            proposal.candidateDigest !== request.candidateDigest
          )
            fail("Conflict", "Refresh and review the exact Pending source candidate.");
          if (proposal.acceptanceOperationId) {
            const acceptance = await operation(proposal.acceptanceOperationId);
            if (acceptance && ["Pending", "Running"].includes(acceptance.state))
              fail(
                "Conflict",
                "Checkpoint publication is active. Wait or cancel its operation first.",
              );
          }
          if (request.decision === "Rejected") {
            return {
              result: { id: row.task.id, revision: request.revision + 1, revisionId: proposal.id },
              guards: [taskGuard(row), pendingGuard(row)],
              writes: [
                db
                  .update(s.sourceRefinementProposals)
                  .set({
                    state: "Rejected",
                    payload: null,
                    comparison: null,
                    reviewedAt: Date.now(),
                  })
                  .where(eq(s.sourceRefinementProposals.id, proposal.id)),
                db
                  .update(s.sourceRefinementTasks)
                  .set({ revision: request.revision + 1 })
                  .where(eq(s.sourceRefinementTasks.id, row.task.id)),
              ],
              history: [
                {
                  entityId: proposal.id,
                  after: { state: "Rejected", candidateDigest: proposal.candidateDigest },
                },
              ],
            };
          }
          const preview = proposal.previewArtifacts;
          if (
            !request.coverageConfirmed ||
            !request.reviewDigest ||
            request.reviewDigest !== proposal.reviewDigest ||
            request.previewOperationId !== proposal.previewOperationId ||
            row.task.latestOperationId !== proposal.previewOperationId ||
            !proposal.comparison ||
            !preview?.validationPassed ||
            (preview.expiresAt ?? 0) <= Date.now()
          )
            fail(
              "InvalidInput",
              "Review the complete current source, intended text, extracted text, PDF and passing report, then confirm coverage for this candidate.",
            );
          if (proposal.acceptanceAttempts >= 3)
            fail(
              "Unavailable",
              "Checkpoint publication reached its three-attempt limit. Inspect recovery diagnostics.",
            );
          const id = newId(),
            checkpointId = proposal.resultCheckpointId ?? newId();
          const capacity = conditionGuard(
            db,
            sql`(SELECT count(*) FROM operations WHERE owner_id=${actor.ownerId} AND state IN ('Pending','Running')) < 2`,
            "Two operations are active. Wait or cancel before publishing this checkpoint.",
          );
          await capacity.check();
          return {
            result: { id: row.task.id, revision: request.revision + 1, revisionId: id },
            guards: [
              taskGuard(row),
              pendingGuard(row),
              ...inputGuards(row.task),
              capacity,
              conditionGuard(
                db,
                sql`EXISTS (SELECT 1 FROM source_refinement_proposals p JOIN operations o ON o.id=p.preview_operation_id WHERE p.id=${proposal.id} AND p.review_digest=${request.reviewDigest} AND o.state='Succeeded' AND json_extract(p.preview_artifacts,'$.expiresAt')>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`,
                "The reviewed preview expired or changed.",
              ),
            ],
            writes: [
              ...operationWrites(actor.ownerId, id, row.task.id, true),
              db
                .update(s.sourceRefinementProposals)
                .set({
                  acceptanceOperationId: id,
                  acceptanceAttempts: proposal.acceptanceAttempts + 1,
                  resultCheckpointId: checkpointId,
                })
                .where(eq(s.sourceRefinementProposals.id, proposal.id)),
              db
                .update(s.sourceRefinementTasks)
                .set({ revision: request.revision + 1 })
                .where(eq(s.sourceRefinementTasks.id, row.task.id)),
            ],
            history: [
              {
                entityId: proposal.id,
                after: {
                  coverageConfirmed: true,
                  reviewDigest: request.reviewDigest,
                  operationId: id,
                  reservedCheckpointId: checkpointId,
                },
              },
            ],
          };
        },
      );
    },
    /** Complete artifact publication first; one D1 batch then saves the checkpoint and review decision together. */
    async finalizeSourceRefinement(
      ownerId: string,
      taskId: string,
      operationId: string,
      retained: ArtifactManifest,
    ) {
      const actor: Principal = { kind: "owner", id: ownerId, ownerId };
      return commands.commit(
        actor,
        "finalize-source-refinement",
        operationId,
        { taskId, operationId, retained },
        async () => {
          const row = await get(ownerId, taskId),
            proposal = row.proposal;
          if (
            proposal?.state !== "Pending" ||
            !proposal.payload ||
            !proposal.comparison ||
            !proposal.reviewDigest ||
            !proposal.resultCheckpointId ||
            proposal.acceptanceOperationId !== operationId ||
            !proposal.previewArtifacts?.validationPassed
          )
            fail("Conflict", "The exact reviewed candidate is no longer awaiting publication.");
          const id = proposal.resultCheckpointId,
            now = Date.now(),
            candidate = proposal.payload;
          const expectedIdentity = await refinedSourceIdentity(
            candidate.source,
            candidate.fields,
            row.task.input.checkpoint.baseTemplateIdentity,
          );
          const prefix = `retained/checkpoints/${id}/${proposal.previewArtifacts.fingerprint}`;
          if (
            retained.expiresAt !== undefined ||
            !retained.validationPassed ||
            retained.rendererVersion !== SOURCE_RENDERER_VERSION ||
            retained.templateIdentity !== expectedIdentity ||
            retained.fingerprint !== proposal.previewArtifacts.fingerprint ||
            retained.pdf !== `${prefix}/resume.pdf` ||
            retained.tex !== `${prefix}/resume.tex` ||
            retained.text !== `${prefix}/resume.txt` ||
            retained.report !== `${prefix}/validation.json`
          )
            fail(
              "InvalidInput",
              "Checkpoint publication requires the exact complete retained artifact manifest.",
            );
          const original = await checkpoints.inspectCheckpoint(ownerId, row.task.baseCheckpointId),
            live = await observeCheckpointEvidence(db, ownerId, row.task.input.evidence);
          const checkpoint = {
              ...original.checkpoint,
              id,
              createdAt: now,
              templateIdentity: expectedIdentity,
            },
            report = await createCheckpointReview(
              id,
              checkpoint.data,
              checkpoint.graph,
              checkpoint.evidence,
              live.statuses,
              candidate.fields,
            );
          return {
            result: { id, revision: 0, revisionId: report.id },
            guards: [
              taskGuard(row),
              pendingGuard(row),
              operationGuard(operationId),
              ...inputGuards(row.task),
              ...live.guards,
              conditionGuard(
                db,
                sql`EXISTS (SELECT 1 FROM source_refinement_proposals WHERE id=${proposal.id} AND acceptance_operation_id=${operationId} AND result_checkpoint_id=${id} AND review_digest=${proposal.reviewDigest})`,
                "Checkpoint publication identity changed.",
              ),
            ],
            writes: [
              db.insert(s.checkpoints).values(checkpoint),
              db.insert(s.checkpointSources).values({
                checkpointId: id,
                baseCheckpointId: original.checkpoint.id,
                structuredBaseId: row.task.input.checkpoint.structuredBaseId,
                proposalId: proposal.id,
                source: candidate.source,
                fields: candidate.fields,
                candidateDigest: proposal.candidateDigest,
                reviewDigest: proposal.reviewDigest,
                baseTemplateIdentity: row.task.input.checkpoint.baseTemplateIdentity,
              }),
              db.insert(s.checkpointReviews).values(report),
              db
                .insert(s.checkpointState)
                .values({ checkpointId: id, reportId: report.id, operationId }),
              db
                .update(s.sourceRefinementProposals)
                .set({ state: "Accepted", reviewedAt: now })
                .where(eq(s.sourceRefinementProposals.id, proposal.id)),
              db
                .update(s.sourceRefinementTasks)
                .set({ revision: row.task.revision + 1 })
                .where(eq(s.sourceRefinementTasks.id, taskId)),
              db
                .update(s.operations)
                .set({
                  state: "Succeeded",
                  stage: "Refined checkpoint saved",
                  artifacts: retained,
                  updatedAt: now,
                })
                .where(eq(s.operations.id, operationId)),
            ],
            history: [
              {
                entityId: id,
                after: {
                  baseCheckpointId: original.checkpoint.id,
                  proposalId: proposal.id,
                  candidateDigest: proposal.candidateDigest,
                  reviewDigest: proposal.reviewDigest,
                },
              },
              { entityId: proposal.id, after: { state: "Accepted", checkpointId: id } },
            ],
          };
        },
      );
    },
  };
}
