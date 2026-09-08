import type {
  RetryWordingRequest,
  ReviewWordingBatchRequest,
  ReviewWordingRequest,
  StartWordingRequest,
} from "@river/contracts";
import {
  ApplicationError,
  applyWordingProposal,
  canonicalJson,
  captureWordingTarget,
  fingerprint,
  newId,
  type Principal,
  validateWordingProposal,
  type WordingEvidence,
  type WordingInput,
  type WordingProfile,
  wordingTargetDigest,
} from "@river/domain";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { aiCapacityGuard } from "./ai-capacity";
import { createCommands, type Guard, type Write } from "./commands";
import { createCompositionRepository } from "./composition";
import type { Database } from "./index";
import * as s from "./schema";

function conflict(message: string): never {
  throw new ApplicationError({ code: "Conflict", message });
}
function owner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can generate or review résumé wording.",
    });
}
export function createWordingRepository(db: Database) {
  const commands = createCommands(db),
    resumes = createCompositionRepository(db);
  const taskById = async (ownerId: string, id: string) => {
    const task = (
      await db
        .select()
        .from(s.wordingTasks)
        .where(and(eq(s.wordingTasks.id, id), eq(s.wordingTasks.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!task) throw new ApplicationError({ code: "NotFound", message: "Wording task not found." });
    return task;
  };
  const guarded = (condition: SQL, reason: string): Guard => ({
    condition,
    check: async () => {
      if (!(await db.get<{ valid: number }>(sql`SELECT ${condition} AS valid`))?.valid)
        conflict(reason);
    },
  });
  const conditions = (ownerId: string, input: WordingInput) => {
    const evidence = input.evidence.map((item) => ({
      id: item.claimId,
      revisionId: item.currentRevisionId,
      archived: item.archived,
    }));
    const contexts = [
      ...new Map(
        input.evidence
          .flatMap((item) => item.contexts)
          .map((item) => [
            `${item.id}:${item.aggregateRevision}`,
            { id: item.id, revision: item.aggregateRevision },
          ]),
      ).values(),
    ];
    return [
      {
        reason: "The draft's posting snapshot changed.",
        condition: sql`EXISTS (SELECT 1 FROM resume_drafts WHERE id = ${input.draftId} AND owner_id = ${ownerId} AND snapshot_id = ${input.snapshot.id})`,
      },
      {
        reason: "Supporting evidence changed.",
        condition: sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(evidence)}) expected WHERE NOT EXISTS (SELECT 1 FROM evidence_claims c WHERE c.id = json_extract(expected.value, '$.id') AND c.owner_id = ${ownerId} AND c.current_revision_id = json_extract(expected.value, '$.revisionId') AND (c.archived_at IS NOT NULL)=json_extract(expected.value,'$.archived')))`,
      },
      {
        reason: "A supporting context changed.",
        condition: sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(contexts)}) expected WHERE NOT EXISTS (SELECT 1 FROM contexts c WHERE c.id = json_extract(expected.value, '$.id') AND c.owner_id = ${ownerId} AND c.revision = json_extract(expected.value, '$.revision')))`,
      },
    ];
  };
  const inputGuards = (ownerId: string, input: WordingInput) =>
    conditions(ownerId, input).map((item) => guarded(item.condition, item.reason));
  const currentTarget = async (ownerId: string, input: WordingInput) => {
    const detail = await resumes.inspectResume(ownerId, input.draftId);
    const target = captureWordingTarget(detail.draft.data, detail.graph, input.target.path);
    if ((await wordingTargetDigest(target)) !== input.targetDigest)
      conflict("The target wording, support selection, or placement binding changed.");
    return detail;
  };
  const staleReasons = async (ownerId: string, input: WordingInput) => {
    const reasons: string[] = [];
    try {
      await currentTarget(ownerId, input);
    } catch (error) {
      if (!(error instanceof ApplicationError)) throw error;
      reasons.push(error.message);
    }
    for (const item of conditions(ownerId, input))
      if (!(await db.get<{ valid: number }>(sql`SELECT ${item.condition} AS valid`))?.valid)
        reasons.push(item.reason);
    return reasons;
  };

  const operationWrites = (ownerId: string, id: string, taskId: string): Write[] => [
    db.insert(s.operations).values({
      id,
      ownerId,
      input: { type: "wording-ai", taskId },
      state: "Pending",
      stage: "Queued for reviewed wording",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    db.insert(s.dispatches).values({ operationId: id }),
  ];
  return {
    async startWording(
      actor: Principal,
      request: StartWordingRequest,
      profile: WordingProfile | null,
    ) {
      owner(actor);
      return commands.commit(actor, "start-wording", request.idempotencyKey, request, async () => {
        if (!profile)
          throw new ApplicationError({
            code: "Unavailable",
            message: "Wording assistance is unavailable. Continue editing manually.",
          });
        const detail = await resumes.inspectResume(actor.ownerId, request.draftId);
        if (detail.draft.revision !== request.revision)
          conflict("Save and review the current draft before requesting wording.");
        const target = captureWordingTarget(detail.draft.data, detail.graph, request.path),
          evidence: WordingEvidence[] = [];
        for (const reference of target.content.evidence) {
          if (
            evidence.some(
              (item) =>
                item.evidenceRevisionId === reference.revisionId &&
                item.claimId === reference.claimId,
            )
          )
            continue;
          const row = (
            await db
              .select({ claim: s.claims, revision: s.evidenceRevisions })
              .from(s.claims)
              .innerJoin(s.evidenceRevisions, eq(s.evidenceRevisions.claimId, s.claims.id))
              .where(
                and(
                  eq(s.claims.id, reference.claimId),
                  eq(s.claims.ownerId, actor.ownerId),
                  eq(s.evidenceRevisions.id, reference.revisionId),
                ),
              )
              .limit(1)
          )[0];
          if (!row)
            throw new ApplicationError({
              code: "NotFound",
              message: "A selected Evidence Revision is unavailable.",
            });
          // An older pinned revision retains its own last review. The claim's current decision may concern different material.
          const decision = (
            await db
              .select()
              .from(s.reviewDecisions)
              .where(
                and(
                  eq(s.reviewDecisions.claimId, row.claim.id),
                  eq(s.reviewDecisions.revisionId, row.revision.id),
                ),
              )
              .orderBy(desc(s.reviewDecisions.createdAt), desc(s.reviewDecisions.id))
              .limit(1)
          )[0];
          const contexts: WordingEvidence["contexts"][number][] = [];
          for (const ref of row.revision.material.contexts) {
            const context = (
              await db
                .select({ aggregate: s.contexts, pinned: s.contextRevisions })
                .from(s.contexts)
                .innerJoin(s.contextRevisions, eq(s.contextRevisions.contextId, s.contexts.id))
                .where(
                  and(
                    eq(s.contexts.id, ref.id),
                    eq(s.contexts.ownerId, actor.ownerId),
                    eq(s.contextRevisions.id, ref.revisionId),
                  ),
                )
                .limit(1)
            )[0];
            if (!context)
              throw new ApplicationError({
                code: "NotFound",
                message: "A selected context revision is unavailable.",
              });
            contexts.push({
              id: context.aggregate.id,
              pinnedRevisionId: context.pinned.id,
              currentRevisionId: context.aggregate.currentRevisionId,
              aggregateRevision: context.aggregate.revision,
              data: context.pinned.data,
            });
          }
          evidence.push({
            claimId: row.claim.id,
            evidenceRevisionId: row.revision.id,
            currentRevisionId: row.claim.currentRevisionId,
            aggregateRevision: row.claim.revision,
            archived: row.claim.archivedAt !== null,
            material: row.revision.material,
            reviewState: decision?.state ?? "Draft",
            decisionId: decision?.id ?? null,
            rationale: decision?.rationale ?? null,
            contexts,
          });
        }
        if (!request.goal.trim())
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Describe the wording change you want to review.",
          });
        const input: WordingInput = {
          type: "wording",
          draftId: detail.draft.id,
          target,
          targetDigest: await wordingTargetDigest(target),
          goal: request.goal,
          snapshot: {
            id: detail.snapshot.id,
            text: detail.snapshot.text,
            details: detail.snapshot.details,
          },
          evidence,
        };
        if (canonicalJson(input).length > profile.maxInputCharacters)
          throw new ApplicationError({
            code: "InvalidInput",
            message:
              "This wording task exceeds its input limit. Narrow the selected support or continue manually.",
          });
        const id = newId(),
          operationId = newId();
        return {
          result: { id, revision: 0, revisionId: operationId },
          guards: [
            resumes.resumeGuard(actor, detail.draft.id, detail.draft.revision),
            ...inputGuards(actor.ownerId, input),
            aiCapacityGuard(db, actor.ownerId),
          ],
          writes: [
            ...operationWrites(actor.ownerId, operationId, id),
            db.insert(s.wordingTasks).values({
              id,
              ownerId: actor.ownerId,
              draftId: detail.draft.id,
              draftRevision: detail.draft.revision,
              input,
              profile,
              latestOperationId: operationId,
              attempts: 1,
              revision: 0,
              createdAt: Date.now(),
            }),
          ],
          history: [
            {
              entityId: id,
              after: {
                draftId: detail.draft.id,
                targetDigest: input.targetDigest,
                snapshotId: input.snapshot.id,
                operationId,
                profile,
              },
            },
          ],
        };
      });
    },
    async inspectWording(ownerId: string, id: string) {
      const task = await taskById(ownerId, id);
      const proposal =
        (
          await db
            .select()
            .from(s.wordingProposals)
            .where(eq(s.wordingProposals.taskId, id))
            .limit(1)
        )[0] ?? null;
      const operation = (
        await db
          .select()
          .from(s.operations)
          .where(eq(s.operations.id, task.latestOperationId))
          .limit(1)
      )[0];
      const { ownerId: _owner, ...safeTask } = task;
      return {
        task: safeTask,
        proposal,
        operation,
        staleReasons:
          proposal && proposal.state !== "Pending" ? [] : await staleReasons(ownerId, task.input),
      };
    },
    async listWording(ownerId: string, draftId: string, offset: number) {
      if (!(await resumes.getResume(ownerId, draftId)))
        throw new ApplicationError({ code: "NotFound", message: "Résumé draft not found." });
      const rows = await db
        .select({
          id: s.wordingTasks.id,
          createdAt: s.wordingTasks.createdAt,
          operationState: s.operations.state,
          stage: s.operations.stage,
          reviewState: s.wordingProposals.state,
          goal: sql<string>`json_extract(${s.wordingTasks.input},'$.goal')`,
        })
        .from(s.wordingTasks)
        .innerJoin(s.operations, eq(s.operations.id, s.wordingTasks.latestOperationId))
        .leftJoin(s.wordingProposals, eq(s.wordingProposals.taskId, s.wordingTasks.id))
        .where(and(eq(s.wordingTasks.ownerId, ownerId), eq(s.wordingTasks.draftId, draftId)))
        .orderBy(desc(s.wordingTasks.createdAt), desc(s.wordingTasks.id))
        .limit(51)
        .offset(offset);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async retryWording(
      actor: Principal,
      request: RetryWordingRequest,
      profile: WordingProfile | null,
    ) {
      owner(actor);
      return commands.commit(actor, "retry-wording", request.idempotencyKey, request, async () => {
        const task = await taskById(actor.ownerId, request.id);
        if (!profile)
          throw new ApplicationError({
            code: "Unavailable",
            message: "Wording assistance is unavailable. Continue manually.",
          });
        if (
          task.revision !== request.revision ||
          canonicalJson(profile) !== canonicalJson(task.profile)
        )
          conflict(
            "The task or model profile changed. Generate a new proposal from current inputs.",
          );
        if (task.attempts >= 3)
          conflict(
            "This task exhausted its three attempts. Continue manually or start a new task.",
          );
        const detail = await currentTarget(actor.ownerId, task.input),
          operationId = newId();
        return {
          result: { id: task.id, revision: task.revision + 1, revisionId: operationId },
          guards: [
            resumes.resumeGuard(actor, detail.draft.id, detail.draft.revision),
            ...inputGuards(actor.ownerId, task.input),
            aiCapacityGuard(db, actor.ownerId),
            guarded(
              sql`EXISTS (SELECT 1 FROM wording_tasks t JOIN operations o ON o.id=t.latest_operation_id WHERE t.id=${task.id} AND t.revision=${task.revision} AND o.state IN ('Failed','Cancelled')) AND NOT EXISTS (SELECT 1 FROM wording_proposals WHERE task_id=${task.id})`,
              "This task cannot be retried in its current state.",
            ),
          ],
          writes: [
            ...operationWrites(actor.ownerId, operationId, task.id),
            db
              .update(s.wordingTasks)
              .set({
                latestOperationId: operationId,
                attempts: task.attempts + 1,
                revision: task.revision + 1,
              })
              .where(eq(s.wordingTasks.id, task.id)),
          ],
          history: [{ entityId: task.id, after: { operationId, attempt: task.attempts + 1 } }],
        };
      });
    },
    async publishWording(ownerId: string, taskId: string, operationId: string, output: unknown) {
      const task = await taskById(ownerId, taskId);
      const existing = (
        await db
          .select()
          .from(s.wordingProposals)
          .where(eq(s.wordingProposals.taskId, taskId))
          .limit(1)
      )[0];
      if (existing?.operationId === operationId) return existing.id;
      const operation = (
        await db.select().from(s.operations).where(eq(s.operations.id, operationId)).limit(1)
      )[0];
      if (
        task.latestOperationId !== operationId ||
        !operation ||
        !["Pending", "Running"].includes(operation.state)
      )
        return null;
      const payload = validateWordingProposal(task.input, output),
        digest = await fingerprint(canonicalJson(payload)),
        id = newId(),
        guardId = newId();
      try {
        await db.batch([
          db.insert(s.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM wording_tasks t JOIN operations o ON o.id=t.latest_operation_id WHERE t.id=${taskId} AND o.id=${operationId} AND o.state IN ('Pending','Running'))`,
          }),
          db.insert(s.wordingProposals).values({
            id,
            taskId,
            operationId,
            digest,
            payload,
            state: "Pending",
            revision: 0,
            createdAt: Date.now(),
          }),
          db
            .update(s.operations)
            .set({
              state: "Succeeded",
              stage: "Wording ready for review",
              failure: null,
              updatedAt: Date.now(),
            })
            .where(eq(s.operations.id, operationId)),
          db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const published = (
          await db
            .select()
            .from(s.wordingProposals)
            .where(eq(s.wordingProposals.taskId, taskId))
            .limit(1)
        )[0];
        if (published?.operationId === operationId) return published.id;
        const current = (
          await db.select().from(s.operations).where(eq(s.operations.id, operationId)).limit(1)
        )[0];
        if (current && !["Pending", "Running"].includes(current.state)) return null;
        throw error;
      }
      return id;
    },
    async listPendingWording(ownerId: string, draftId: string) {
      if (!(await resumes.getResume(ownerId, draftId)))
        throw new ApplicationError({ code: "NotFound", message: "Résumé not found." });
      return db
        .select({
          id: s.wordingProposals.id,
          revision: s.wordingProposals.revision,
          digest: s.wordingProposals.digest,
          payload: s.wordingProposals.payload,
          taskId: s.wordingTasks.id,
          input: s.wordingTasks.input,
        })
        .from(s.wordingTasks)
        .innerJoin(s.wordingProposals, eq(s.wordingProposals.taskId, s.wordingTasks.id))
        .where(
          and(
            eq(s.wordingTasks.ownerId, ownerId),
            eq(s.wordingTasks.draftId, draftId),
            eq(s.wordingProposals.state, "Pending"),
          ),
        )
        .orderBy(desc(s.wordingTasks.createdAt), desc(s.wordingTasks.id));
    },
    async reviewWordingBatch(actor: Principal, request: ReviewWordingBatchRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "review-wording-batch",
        request.idempotencyKey,
        request,
        async () => {
          const detail = await resumes.inspectResume(actor.ownerId, request.draftId);
          if (detail.draft.revision !== request.revision)
            conflict("The résumé changed. Refresh the wording choices before applying them.");
          let data = detail.draft.data;
          const guards = [resumes.resumeGuard(actor, request.draftId, request.revision)],
            writes: Write[] = [],
            paths = new Set<string>(),
            inputs: WordingInput[] = [];
          for (const item of request.items) {
            const proposal = (
              await db
                .select()
                .from(s.wordingProposals)
                .where(eq(s.wordingProposals.id, item.id))
                .limit(1)
            )[0];
            if (
              !proposal?.payload ||
              proposal.state !== "Pending" ||
              proposal.revision !== item.revision ||
              proposal.digest !== item.digest
            )
              conflict(
                "A wording choice changed or was already applied. Refresh before trying again; nothing was applied.",
              );
            const task = await taskById(actor.ownerId, proposal.taskId);
            if (task.draftId !== request.draftId)
              conflict("Every wording choice must belong to this résumé.");
            if (task.input.snapshot.id !== detail.snapshot.id)
              conflict("The job posting changed. Refresh these wording choices.");
            inputs.push(task.input);
            const path = canonicalJson(task.input.target.path);
            if (paths.has(path))
              conflict("Choose one wording alternative per entry before applying the batch.");
            paths.add(path);
            const current = await currentTarget(actor.ownerId, task.input);
            if (current.draft.revision !== request.revision)
              conflict("The résumé changed while reviewing choices. Refresh and try again.");
            if (!item.wording.trim())
              throw new ApplicationError({
                code: "InvalidInput",
                message: "Write the wording before applying this choice.",
              });
            const payload = { ...proposal.payload, wording: item.wording };
            data = applyWordingProposal(data, task.input.target.path, payload);
            writes.push(
              db
                .update(s.wordingProposals)
                .set({
                  state: "Accepted",
                  revision: proposal.revision + 1,
                  appliedRevision: request.revision + 1,
                  reviewedAt: Date.now(),
                  payload,
                })
                .where(eq(s.wordingProposals.id, proposal.id)),
            );
          }
          const first = inputs[0];
          if (!first)
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Select at least one wording choice.",
            });
          // A single JSON parameter keeps large batches below D1's bound-parameter limit.
          guards.push(
            ...inputGuards(actor.ownerId, {
              ...first,
              evidence: inputs.flatMap((input) => input.evidence),
            }),
            guarded(
              sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(request.items.map(({ id, revision, digest }) => ({ id, revision, digest })))}) expected WHERE NOT EXISTS (SELECT 1 FROM wording_proposals p WHERE p.id=json_extract(expected.value,'$.id') AND p.revision=json_extract(expected.value,'$.revision') AND p.digest=json_extract(expected.value,'$.digest') AND p.state='Pending'))`,
              "A wording choice was reviewed elsewhere. Refresh and try again.",
            ),
          );
          writes.push(
            ...(await resumes.resumeUpdateWrites(actor, request.draftId, request.revision, data)),
          );
          return {
            result: { id: request.draftId, revision: request.revision + 1, revisionId: null },
            guards,
            writes,
            history: [
              {
                entityId: request.draftId,
                after: {
                  wordingChoices: request.items.map((item) => item.id),
                  revision: request.revision + 1,
                },
              },
            ],
          };
        },
      );
    },
    async reviewWording(actor: Principal, request: ReviewWordingRequest) {
      owner(actor);
      return commands.commit(actor, "review-wording", request.idempotencyKey, request, async () => {
        const proposal = (
          await db
            .select()
            .from(s.wordingProposals)
            .where(eq(s.wordingProposals.id, request.id))
            .limit(1)
        )[0];
        if (!proposal)
          throw new ApplicationError({ code: "NotFound", message: "Wording proposal not found." });
        const task = await taskById(actor.ownerId, proposal.taskId);
        if (
          proposal.revision !== request.revision ||
          proposal.state !== "Pending" ||
          !proposal.payload ||
          proposal.digest !== request.digest
        )
          conflict("The exact proposal changed or has already been reviewed.");
        const guards = [
          guarded(
            sql`EXISTS (SELECT 1 FROM wording_proposals WHERE id=${proposal.id} AND revision=${proposal.revision} AND digest=${request.digest} AND state='Pending')`,
            "This proposal was reviewed elsewhere.",
          ),
        ];
        const writes: Write[] = [];
        let appliedRevision: number | null = null;
        if (request.decision === "Accepted") {
          const detail = await currentTarget(actor.ownerId, task.input);
          guards.push(
            resumes.resumeGuard(actor, detail.draft.id, detail.draft.revision),
            ...inputGuards(actor.ownerId, task.input),
          );
          const data = applyWordingProposal(detail.draft.data, task.input.target.path, {
            ...proposal.payload,
            wording: request.wording ?? proposal.payload.wording,
          });
          writes.push(
            ...(await resumes.resumeUpdateWrites(
              actor,
              detail.draft.id,
              detail.draft.revision,
              data,
            )),
          );
          appliedRevision = detail.draft.revision + 1;
        }
        writes.push(
          db
            .update(s.wordingProposals)
            .set({
              state: request.decision,
              revision: proposal.revision + 1,
              reviewedAt: Date.now(),
              appliedRevision,
              ...(request.decision === "Rejected"
                ? { payload: null }
                : request.wording
                  ? { payload: { ...proposal.payload, wording: request.wording } }
                  : {}),
            })
            .where(eq(s.wordingProposals.id, proposal.id)),
        );
        return {
          result: { id: proposal.id, revision: proposal.revision + 1, revisionId: null },
          guards,
          writes,
          history: [
            {
              entityId: proposal.id,
              after: {
                decision: request.decision,
                digest: proposal.digest,
                taskId: task.id,
                draftId: task.draftId,
                appliedRevision,
              },
            },
          ],
        };
      });
    },
  };
}
