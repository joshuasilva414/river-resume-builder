import type { RetryJobAiRequest, ReviewJobAiRequest, StartJobAiRequest } from "@river/contracts";
import {
  type AiEvidenceCandidate,
  type AiProfile,
  ApplicationError,
  canonicalJson,
  type JobAiInput,
  type JobAiProposal,
  JobWorkspace,
  newId,
  type Principal,
  validateJobProposal,
} from "@river/domain";
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { Schema } from "effect";
import { aiCapacityGuard } from "./ai-capacity";
import { createCommands, type Guard, type Write } from "./commands";
import type { Database } from "./index";
import { createJobRepository, jobWorkspaceWrites } from "./jobs";
import * as s from "./schema";

const ownerOnly = (actor: Principal) => {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can run or review AI proposals.",
    });
};
function conflict(message: string): never {
  throw new ApplicationError({ code: "Conflict", message });
}
export function createJobAiRepository(db: Database) {
  const commands = createCommands(db);
  const jobs = createJobRepository(db);
  const taskById = async (ownerId: string, id: string) => {
    const task = (
      await db
        .select()
        .from(s.aiTasks)
        .where(and(eq(s.aiTasks.id, id), eq(s.aiTasks.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!task) throw new ApplicationError({ code: "NotFound", message: "AI task not found." });
    return task;
  };
  const conditions = (
    ownerId: string,
    input: JobAiInput,
  ): readonly { reason: string; condition: SQL }[] => {
    const candidates = input.candidates.map((item) => ({
      id: item.claimId,
      revision: item.aggregateRevision,
    }));
    const contexts = [
      ...new Map(
        input.candidates
          .flatMap((item) => item.contexts)
          .map((item) => [item.id, { id: item.id, revision: item.aggregateRevision }]),
      ).values(),
    ];
    return [
      {
        reason: "The job, posting, or Requirement Map changed.",
        condition: sql`EXISTS (SELECT 1 FROM job_targets j JOIN job_workspaces w ON w.snapshot_id = j.current_snapshot_id WHERE j.id = ${input.jobId} AND j.owner_id = ${ownerId} AND j.revision = ${input.jobRevision} AND j.archived_at IS NULL AND j.current_snapshot_id = ${input.snapshotId} AND w.current_revision_id = ${input.workspaceRevisionId})`,
      },
      {
        reason: "Evidence material, review, metadata, or lifecycle changed.",
        condition: sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(candidates)}) expected WHERE NOT EXISTS (SELECT 1 FROM evidence_claims c WHERE c.id = json_extract(expected.value, '$.id') AND c.owner_id = ${ownerId} AND c.revision = json_extract(expected.value, '$.revision') AND c.archived_at IS NULL))`,
      },
      {
        reason: "A referenced context changed.",
        condition: sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(contexts)}) expected WHERE NOT EXISTS (SELECT 1 FROM contexts c WHERE c.id = json_extract(expected.value, '$.id') AND c.owner_id = ${ownerId} AND c.revision = json_extract(expected.value, '$.revision')))`,
      },
    ];
  };
  const inputsChanged = async (ownerId: string, input: JobAiInput) => {
    const reasons: string[] = [];
    for (const item of conditions(ownerId, input)) {
      const value = await db.get<{ valid: number }>(sql`SELECT ${item.condition} AS valid`);
      if (!value?.valid) reasons.push(item.reason);
    }
    return reasons;
  };
  const guarded = (condition: SQL, message: string): Guard => ({
    condition,
    check: async () => {
      const value = await db.get<{ valid: number }>(sql`SELECT ${condition} AS valid`);
      if (!value?.valid) conflict(message);
    },
  });
  const inputGuards = (ownerId: string, input: JobAiInput) =>
    conditions(ownerId, input).map((item) => guarded(item.condition, item.reason));
  const operationWrite = (ownerId: string, id: string, taskId: string): Write[] => [
    db.insert(s.operations).values({
      id,
      ownerId,
      input: { type: "job-ai", taskId },
      state: "Pending",
      stage: "Queued for reviewed job analysis",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    db.insert(s.dispatches).values({ operationId: id }),
  ];

  return {
    async startJobAi(actor: Principal, request: StartJobAiRequest, profile: AiProfile | null) {
      ownerOnly(actor);
      return commands.commit(actor, "start-job-ai", request.idempotencyKey, request, async () => {
        if (!profile)
          throw new ApplicationError({
            code: "Unavailable",
            message:
              "This AI task profile is unavailable. Continue using manual requirements and evidence selection.",
          });
        const detail = await jobs.inspectJob(actor.ownerId, { id: request.jobId });
        if (
          detail.job.revision !== request.revision ||
          detail.job.currentSnapshotId !== request.snapshotId ||
          detail.job.archivedAt !== null
        )
          conflict("The job changed. Review the current posting before generating a proposal.");
        if (
          request.requirementId &&
          !detail.workspace.data.requirements.some((item) => item.id === request.requirementId)
        )
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Choose a current requirement.",
          });
        if (request.task === "extract-requirements" && request.requirementId)
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Extraction proposes one complete Requirement Map.",
          });
        if (request.task === "rank-evidence" && !detail.workspace.data.requirements.length)
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Add or review requirements before ranking evidence.",
          });
        const requirements = detail.workspace.data.requirements.filter(
          (item) => !request.requirementId || item.id === request.requirementId,
        );
        const keywords =
          requirements.flatMap((item) => item.keywords).join(" ") || detail.job.details.role;
        const terms = [...new Set(keywords.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])].slice(
          0,
          12,
        );
        const candidateQuery = terms.map((term) => `"${term}"*`).join(" OR ");
        const candidates: AiEvidenceCandidate[] = [];
        if (request.task === "rank-evidence") {
          const entries = await db
            .select({ claim: s.claims, evidence: s.evidenceRevisions, decision: s.reviewDecisions })
            .from(s.claims)
            .innerJoin(s.evidenceRevisions, eq(s.evidenceRevisions.id, s.claims.currentRevisionId))
            .leftJoin(s.reviewDecisions, eq(s.reviewDecisions.id, s.claims.currentDecisionId))
            .where(
              and(
                eq(s.claims.ownerId, actor.ownerId),
                isNull(s.claims.archivedAt),
                candidateQuery
                  ? sql`${s.claims.id} IN (SELECT claim_id FROM evidence_search WHERE evidence_search MATCH ${candidateQuery})`
                  : undefined,
              ),
            )
            .orderBy(desc(s.claims.updatedAt), desc(s.claims.id))
            .limit(30);
          for (const { claim, evidence, decision } of entries) {
            const contexts = [];
            for (const reference of evidence.material.contexts) {
              const context = (
                await db
                  .select({ aggregate: s.contexts, pinned: s.contextRevisions })
                  .from(s.contexts)
                  .innerJoin(
                    s.contextRevisions,
                    and(
                      eq(s.contextRevisions.contextId, s.contexts.id),
                      eq(s.contextRevisions.id, reference.revisionId),
                    ),
                  )
                  .where(
                    and(eq(s.contexts.id, reference.id), eq(s.contexts.ownerId, actor.ownerId)),
                  )
                  .limit(1)
              )[0];
              if (!context)
                throw new ApplicationError({
                  code: "Internal",
                  message: "A pinned context is unavailable.",
                });
              contexts.push({
                id: reference.id,
                pinnedRevisionId: reference.revisionId,
                currentRevisionId: context.aggregate.currentRevisionId,
                aggregateRevision: context.aggregate.revision,
                data: context.pinned.data,
              });
            }
            candidates.push({
              claimId: claim.id,
              evidenceRevisionId: evidence.id,
              aggregateRevision: claim.revision,
              material: evidence.material,
              reviewState: decision?.state ?? "Draft",
              decisionId: decision?.id ?? null,
              rationale: decision?.rationale ?? null,
              contexts,
            });
          }
        }
        const input: JobAiInput = {
          task: request.task,
          jobId: detail.job.id,
          jobRevision: detail.job.revision,
          snapshotId: detail.snapshot.id,
          workspaceRevisionId: detail.workspace.id,
          details: detail.job.details,
          posting: detail.snapshot.text,
          workspace: detail.workspace.data,
          requirementId: request.requirementId,
          candidateQuery: request.task === "rank-evidence" ? candidateQuery : "",
          candidates,
        };
        if (canonicalJson(input).length > profile.maxInputCharacters)
          throw new ApplicationError({
            code: "InvalidInput",
            message:
              "This task exceeds the reviewed AI input limit. Use a narrower requirement scope or continue manually.",
          });
        const id = newId(),
          operationId = newId();
        return {
          result: { id, revision: 0, revisionId: operationId },
          guards: [...inputGuards(actor.ownerId, input), aiCapacityGuard(db, actor.ownerId)],
          writes: [
            ...operationWrite(actor.ownerId, operationId, id),
            db.insert(s.aiTasks).values({
              id,
              ownerId: actor.ownerId,
              jobId: input.jobId,
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
                task: input.task,
                snapshotId: input.snapshotId,
                workspaceRevisionId: input.workspaceRevisionId,
                operationId,
                profile,
              },
            },
          ],
        };
      });
    },
    async inspectJobAi(ownerId: string, id: string) {
      const task = await taskById(ownerId, id);
      const proposal =
        (await db.select().from(s.aiProposals).where(eq(s.aiProposals.taskId, id)).limit(1))[0] ??
        null;
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
        staleReasons: await inputsChanged(ownerId, task.input),
      };
    },
    async listJobAi(ownerId: string, jobId: string, offset: number) {
      if (!(await jobs.getJob(ownerId, jobId)))
        throw new ApplicationError({ code: "NotFound", message: "Job not found." });
      const rows = await db
        .select({
          id: s.aiTasks.id,
          task: sql<JobAiInput["task"]>`json_extract(${s.aiTasks.input}, '$.task')`,
          createdAt: s.aiTasks.createdAt,
          operationState: s.operations.state,
          stage: s.operations.stage,
          reviewState: s.aiProposals.state,
        })
        .from(s.aiTasks)
        .innerJoin(s.operations, eq(s.operations.id, s.aiTasks.latestOperationId))
        .leftJoin(s.aiProposals, eq(s.aiProposals.taskId, s.aiTasks.id))
        .where(and(eq(s.aiTasks.ownerId, ownerId), eq(s.aiTasks.jobId, jobId)))
        .orderBy(desc(s.aiTasks.createdAt), desc(s.aiTasks.id))
        .limit(51)
        .offset(offset);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async retryJobAi(actor: Principal, request: RetryJobAiRequest, profile: AiProfile | null) {
      ownerOnly(actor);
      return commands.commit(actor, "retry-job-ai", request.idempotencyKey, request, async () => {
        if (!profile)
          throw new ApplicationError({
            code: "Unavailable",
            message: "This AI task profile is unavailable. Continue manually.",
          });
        const task = await taskById(actor.ownerId, request.id);
        if (task.revision !== request.revision)
          conflict("The task changed. Reload its execution state.");
        if (canonicalJson(profile) !== canonicalJson(task.profile))
          conflict("The task profile changed. Generate a new proposal from current inputs.");
        if (task.attempts >= 3)
          conflict(
            "This task exhausted its three attempts. Continue manually or generate a new proposal.",
          );
        const operationId = newId();
        return {
          result: { id: task.id, revision: task.revision + 1, revisionId: operationId },
          guards: [
            ...inputGuards(actor.ownerId, task.input),
            aiCapacityGuard(db, actor.ownerId),
            guarded(
              sql`EXISTS (SELECT 1 FROM ai_tasks t JOIN operations o ON o.id = t.latest_operation_id WHERE t.id = ${task.id} AND t.revision = ${task.revision} AND o.state IN ('Failed', 'Cancelled')) AND NOT EXISTS (SELECT 1 FROM ai_proposals WHERE task_id = ${task.id})`,
              "This task cannot be retried in its current state.",
            ),
          ],
          writes: [
            ...operationWrite(actor.ownerId, operationId, task.id),
            db
              .update(s.aiTasks)
              .set({
                latestOperationId: operationId,
                attempts: task.attempts + 1,
                revision: task.revision + 1,
              })
              .where(eq(s.aiTasks.id, task.id)),
          ],
          history: [{ entityId: task.id, after: { operationId, attempt: task.attempts + 1 } }],
        };
      });
    },
    async publishJobAi(ownerId: string, taskId: string, operationId: string, output: unknown) {
      const task = await taskById(ownerId, taskId);
      const existing = (
        await db.select().from(s.aiProposals).where(eq(s.aiProposals.taskId, taskId)).limit(1)
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
      const payload = validateJobProposal(task.input, output);
      if (canonicalJson(payload).length > 200000)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "The generated proposal exceeds its storage limit.",
        });
      const id = newId(),
        guardId = newId();
      try {
        await db.batch([
          db.insert(s.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM ai_tasks t JOIN operations o ON o.id = t.latest_operation_id WHERE t.id = ${taskId} AND o.id = ${operationId} AND o.state IN ('Pending', 'Running'))`,
          }),
          db.insert(s.aiProposals).values({
            id,
            taskId,
            operationId,
            payload,
            state: "Pending",
            revision: 0,
            createdAt: Date.now(),
          }),
          db
            .update(s.operations)
            .set({
              state: "Succeeded",
              stage: "Proposal ready for review",
              updatedAt: Date.now(),
              failure: null,
            })
            .where(eq(s.operations.id, operationId)),
          db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const published = (
          await db.select().from(s.aiProposals).where(eq(s.aiProposals.taskId, taskId)).limit(1)
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
    async reviewJobAi(actor: Principal, request: ReviewJobAiRequest) {
      ownerOnly(actor);
      return commands.commit(actor, "review-job-ai", request.idempotencyKey, request, async () => {
        const proposal = (
          await db.select().from(s.aiProposals).where(eq(s.aiProposals.id, request.id)).limit(1)
        )[0];
        if (!proposal)
          throw new ApplicationError({ code: "NotFound", message: "Proposal not found." });
        const task = await taskById(actor.ownerId, proposal.taskId);
        if (
          proposal.revision !== request.revision ||
          proposal.state !== "Pending" ||
          !proposal.payload
        )
          conflict("This proposal has already been reviewed.");
        const guards = [
          guarded(
            sql`EXISTS (SELECT 1 FROM ai_proposals WHERE id = ${proposal.id} AND revision = ${proposal.revision} AND state = 'Pending')`,
            "The proposal changed during review.",
          ),
        ];
        const writes: Write[] = [
          db
            .update(s.aiProposals)
            .set({
              state: request.decision,
              revision: proposal.revision + 1,
              reviewedAt: Date.now(),
              ...(request.decision === "Rejected" ? { payload: null } : {}),
            })
            .where(eq(s.aiProposals.id, proposal.id)),
        ];
        let revisionId: string | null = null;
        if (request.decision === "Accepted") {
          const changed = await inputsChanged(actor.ownerId, task.input);
          if (changed.length)
            conflict(
              `${changed.join(" ")} Nothing was applied. Generate and review an updated proposal.`,
            );
          guards.push(...inputGuards(actor.ownerId, task.input));
          const payload: JobAiProposal = proposal.payload;
          if (payload.type === "requirements") {
            const ids = new Set(payload.requirements.map((item) => item.id));
            const removed = task.input.workspace.selections.filter(
              (selection) => selection.requirementId !== null && !ids.has(selection.requirementId),
            );
            if (removed.length && !request.acknowledgeRemovedAssociations)
              throw new ApplicationError({
                code: "InvalidInput",
                message: "Review and acknowledge every removed requirement-specific association.",
              });
            const data = Schema.decodeUnknownSync(JobWorkspace)({
              requirements: payload.requirements,
              selections: task.input.workspace.selections.filter(
                (selection) => selection.requirementId === null || ids.has(selection.requirementId),
              ),
            });
            revisionId = newId();
            writes.push(
              db
                .update(s.jobs)
                .set({ revision: task.input.jobRevision + 1, updatedAt: Date.now() })
                .where(eq(s.jobs.id, task.jobId)),
              ...jobWorkspaceWrites(db, actor, task.input.snapshotId, revisionId, data),
            );
          }
        }
        // Only identifiers and decisions enter permanent receipts/audit. Rejection leaves no generated payload copy there.
        return {
          result: { id: proposal.id, revision: proposal.revision + 1, revisionId },
          guards,
          writes,
          history: [
            {
              entityId: proposal.id,
              after: {
                decision: request.decision,
                taskId: task.id,
                jobId: task.jobId,
                workspaceRevisionId: revisionId,
              },
            },
          ],
        };
      });
    },
  };
}
