import type {
  RetryDuplicateAiRequest,
  ReviewDuplicateAiRequest,
  StartDuplicateAiRequest,
} from "@river/contracts";
import {
  ApplicationError,
  canonicalJson,
  type DuplicateAiProfile,
  fingerprint,
  newId,
  type Principal,
  validateDuplicateComparison,
} from "@river/domain";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { aiCapacityGuard } from "./ai-capacity";
import { createCommands, type Write } from "./commands";
import {
  captureDuplicateInput,
  duplicateGuard,
  duplicateInputGuards,
  duplicateStaleReasons,
} from "./duplicate-inputs";
import type { Database } from "./index";
import * as s from "./schema";

function owner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can generate or review AI comparisons.",
    });
}
export function createDuplicateAiRepository(db: Database) {
  const commands = createCommands(db);
  const taskById = async (ownerId: string, id: string) => {
    const task = (
      await db
        .select()
        .from(s.duplicateAiTasks)
        .where(and(eq(s.duplicateAiTasks.id, id), eq(s.duplicateAiTasks.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!task)
      throw new ApplicationError({ code: "NotFound", message: "AI comparison not found." });
    return task;
  };
  const operationWrites = (ownerId: string, id: string, taskId: string): Write[] => [
    db.insert(s.operations).values({
      id,
      ownerId,
      input: { type: "duplicate-ai", taskId },
      state: "Pending",
      stage: "Queued for duplicate comparison",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    db.insert(s.dispatches).values({ operationId: id }),
  ];
  return {
    async previewDuplicateAi(actor: Principal, request: StartDuplicateAiRequest) {
      owner(actor);
      const input = await captureDuplicateInput(db, actor.ownerId, request),
        characters = canonicalJson(input).length;
      return { input, characters, limit: 160000, allowed: characters <= 160000 };
    },
    async startDuplicateAi(
      actor: Principal,
      request: StartDuplicateAiRequest,
      profile: DuplicateAiProfile | null,
    ) {
      owner(actor);
      return commands.commit(
        actor,
        "start-duplicate-ai",
        request.idempotencyKey,
        request,
        async () => {
          if (!profile)
            throw new ApplicationError({
              code: "Unavailable",
              message: "AI comparison is unavailable. Compare the claims manually.",
            });
          const input = await captureDuplicateInput(db, actor.ownerId, request);
          if (canonicalJson(input).length > profile.maxInputCharacters)
            throw new ApplicationError({
              code: "InvalidInput",
              message:
                "The complete comparison exceeds 160,000 UTF-16 units. Continue manually; nothing was truncated.",
            });
          const id = newId(),
            operationId = newId();
          return {
            result: { id, revision: 0, revisionId: operationId },
            guards: [
              ...duplicateInputGuards(db, actor.ownerId, input),
              aiCapacityGuard(db, actor.ownerId),
            ],
            writes: [
              ...operationWrites(actor.ownerId, operationId, id),
              db.insert(s.duplicateAiTasks).values({
                id,
                ownerId: actor.ownerId,
                pairId: input.pair.id,
                firstClaimId: input.first.claimId,
                secondClaimId: input.second.claimId,
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
                  pairId: input.pair.id,
                  firstRevisionId: input.first.evidenceRevisionId,
                  secondRevisionId: input.second.evidenceRevisionId,
                  profile,
                  operationId,
                },
              },
            ],
          };
        },
      );
    },
    async inspectDuplicateAi(ownerId: string, id: string) {
      const task = await taskById(ownerId, id),
        proposal =
          (
            await db
              .select()
              .from(s.duplicateAiProposals)
              .where(eq(s.duplicateAiProposals.taskId, id))
              .limit(1)
          )[0] ?? null,
        operation = (
          await db
            .select()
            .from(s.operations)
            .where(eq(s.operations.id, task.latestOperationId))
            .limit(1)
        )[0];
      const pair = (
        await db
          .select()
          .from(s.duplicatePairs)
          .where(eq(s.duplicatePairs.id, task.pairId))
          .limit(1)
      )[0];
      const claims = await db
        .select()
        .from(s.claims)
        .where(or(eq(s.claims.id, task.firstClaimId), eq(s.claims.id, task.secondClaimId)));
      const first = claims.find((claim) => claim.id === task.firstClaimId);
      const second = claims.find((claim) => claim.id === task.secondClaimId);
      const pairState =
        !pair || !first || !second
          ? "Unavailable"
          : pair.state === "Separate"
            ? "Separate"
            : first.mergedIntoId === second.id || second.mergedIntoId === first.id
              ? "Merged"
              : first.archivedAt || second.archivedAt
                ? "Archived"
                : first.currentRevisionId !== pair.firstRevisionId ||
                    second.currentRevisionId !== pair.secondRevisionId
                  ? "Superseded"
                  : "Pending";
      const pairDecision =
        (
          await db
            .select({
              command: s.audit.command,
              actorId: s.audit.actorId,
              createdAt: s.audit.createdAt,
              rationale: sql<string | null>`json_extract(${s.audit.after}, '$.rationale')`,
            })
            .from(s.audit)
            .where(
              or(
                and(eq(s.audit.command, "dismiss-duplicate"), eq(s.audit.entityId, task.pairId)),
                and(
                  eq(s.audit.command, "merge-evidence"),
                  or(
                    and(
                      eq(s.audit.entityId, task.firstClaimId),
                      sql`json_extract(${s.audit.after}, '$.mergedFromId')=${task.secondClaimId}`,
                      sql`json_extract(${s.audit.before}, '$.currentRevisionId')=${task.input.first.evidenceRevisionId}`,
                    ),
                    and(
                      eq(s.audit.entityId, task.secondClaimId),
                      sql`json_extract(${s.audit.after}, '$.mergedFromId')=${task.firstClaimId}`,
                      sql`json_extract(${s.audit.before}, '$.currentRevisionId')=${task.input.second.evidenceRevisionId}`,
                    ),
                  ),
                ),
              ),
            )
            .orderBy(desc(s.audit.createdAt))
            .limit(1)
        )[0] ?? null;
      const { ownerId: _owner, ...safeTask } = task;
      return {
        task: safeTask,
        proposal,
        operation,
        pair,
        pairState,
        pairDecision,
        staleReasons: await duplicateStaleReasons(db, ownerId, task.input),
      };
    },
    async listDuplicateAi(ownerId: string, claimId: string, offset: number) {
      const claim = (
        await db
          .select({ id: s.claims.id })
          .from(s.claims)
          .where(and(eq(s.claims.id, claimId), eq(s.claims.ownerId, ownerId)))
          .limit(1)
      )[0];
      if (!claim) throw new ApplicationError({ code: "NotFound", message: "Claim not found." });
      const rows = await db
        .select({
          id: s.duplicateAiTasks.id,
          pairId: s.duplicateAiTasks.pairId,
          createdAt: s.duplicateAiTasks.createdAt,
          state: s.operations.state,
          stage: s.operations.stage,
          reviewState: s.duplicateAiProposals.state,
          firstClaimId: s.duplicateAiTasks.firstClaimId,
          secondClaimId: s.duplicateAiTasks.secondClaimId,
        })
        .from(s.duplicateAiTasks)
        .innerJoin(s.operations, eq(s.operations.id, s.duplicateAiTasks.latestOperationId))
        .leftJoin(s.duplicateAiProposals, eq(s.duplicateAiProposals.taskId, s.duplicateAiTasks.id))
        .where(
          and(
            eq(s.duplicateAiTasks.ownerId, ownerId),
            or(
              eq(s.duplicateAiTasks.firstClaimId, claimId),
              eq(s.duplicateAiTasks.secondClaimId, claimId),
            ),
          ),
        )
        .orderBy(desc(s.duplicateAiTasks.createdAt), desc(s.duplicateAiTasks.id))
        .limit(51)
        .offset(offset);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async retryDuplicateAi(
      actor: Principal,
      request: RetryDuplicateAiRequest,
      profile: DuplicateAiProfile | null,
    ) {
      owner(actor);
      return commands.commit(
        actor,
        "retry-duplicate-ai",
        request.idempotencyKey,
        request,
        async () => {
          const task = await taskById(actor.ownerId, request.id);
          if (!profile)
            throw new ApplicationError({
              code: "Unavailable",
              message: "AI comparison is unavailable. Continue manually.",
            });
          if (
            task.revision !== request.revision ||
            task.attempts >= 3 ||
            canonicalJson(profile) !== canonicalJson(task.profile)
          )
            throw new ApplicationError({
              code: "Conflict",
              message:
                "This task changed or exhausted its three attempts. Review current inputs before a new comparison.",
            });
          const id = newId();
          const guard = duplicateGuard(
            db,
            sql`EXISTS (SELECT 1 FROM duplicate_ai_tasks t JOIN operations o ON o.id=t.latest_operation_id WHERE t.id=${task.id} AND t.revision=${task.revision} AND o.state IN ('Failed','Cancelled')) AND NOT EXISTS (SELECT 1 FROM duplicate_ai_proposals WHERE task_id=${task.id})`,
            "This comparison cannot be retried in its current state.",
          );
          for (const item of [...duplicateInputGuards(db, actor.ownerId, task.input), guard])
            await item.check();
          return {
            result: { id: task.id, revision: task.revision + 1, revisionId: id },
            guards: [
              ...duplicateInputGuards(db, actor.ownerId, task.input),
              guard,
              aiCapacityGuard(db, actor.ownerId),
            ],
            writes: [
              ...operationWrites(actor.ownerId, id, task.id),
              db
                .update(s.duplicateAiTasks)
                .set({
                  latestOperationId: id,
                  attempts: task.attempts + 1,
                  revision: task.revision + 1,
                })
                .where(eq(s.duplicateAiTasks.id, task.id)),
            ],
            history: [
              { entityId: task.id, after: { operationId: id, attempt: task.attempts + 1 } },
            ],
          };
        },
      );
    },
    async publishDuplicateAi(
      ownerId: string,
      taskId: string,
      operationId: string,
      output: unknown,
    ) {
      const task = await taskById(ownerId, taskId);
      if (task.latestOperationId !== operationId) return null;
      const existing = (
        await db
          .select()
          .from(s.duplicateAiProposals)
          .where(eq(s.duplicateAiProposals.taskId, taskId))
          .limit(1)
      )[0];
      if (existing) return existing.id;
      const operation = (
        await db.select().from(s.operations).where(eq(s.operations.id, operationId)).limit(1)
      )[0];
      if (!operation || !["Pending", "Running"].includes(operation.state)) return null;
      const payload = validateDuplicateComparison(output),
        digest = await fingerprint(canonicalJson(payload)),
        id = newId(),
        guardId = newId(),
        now = Date.now();
      try {
        await db.batch([
          db.insert(s.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM duplicate_ai_tasks t JOIN operations o ON o.id=t.latest_operation_id WHERE t.id=${taskId} AND o.id=${operationId} AND o.state IN ('Pending','Running'))`,
          }),
          db.insert(s.duplicateAiProposals).values({
            id,
            taskId,
            operationId,
            digest,
            payload,
            state: "Pending",
            revision: 0,
            createdAt: now,
          }),
          db
            .update(s.operations)
            .set({
              state: "Succeeded",
              stage: "Comparison ready for review",
              failure: null,
              updatedAt: now,
            })
            .where(eq(s.operations.id, operationId)),
          db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const persisted = (
          await db
            .select()
            .from(s.duplicateAiProposals)
            .where(eq(s.duplicateAiProposals.taskId, taskId))
            .limit(1)
        )[0];
        if (persisted) return persisted.id;
        const current = await taskById(ownerId, taskId),
          state = (
            await db.select().from(s.operations).where(eq(s.operations.id, operationId)).limit(1)
          )[0]?.state;
        if (
          current.latestOperationId !== operationId ||
          (state && !["Pending", "Running"].includes(state))
        )
          return null;
        throw error;
      }
      return id;
    },
    async reviewDuplicateAi(actor: Principal, request: ReviewDuplicateAiRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "review-duplicate-ai",
        request.idempotencyKey,
        request,
        async () => {
          const proposal = (
            await db
              .select()
              .from(s.duplicateAiProposals)
              .where(eq(s.duplicateAiProposals.id, request.id))
              .limit(1)
          )[0];
          if (!proposal)
            throw new ApplicationError({
              code: "NotFound",
              message: "AI comparison proposal not found.",
            });
          const task = await taskById(actor.ownerId, proposal.taskId);
          if (
            proposal.state !== "Pending" ||
            proposal.revision !== request.revision ||
            proposal.digest !== request.digest ||
            !proposal.payload
          )
            throw new ApplicationError({
              code: "Conflict",
              message: "The exact comparison changed or was already reviewed.",
            });
          const guards = [
            duplicateGuard(
              db,
              sql`EXISTS (SELECT 1 FROM duplicate_ai_proposals WHERE id=${proposal.id} AND revision=${proposal.revision} AND state='Pending' AND digest=${request.digest})`,
              "This comparison was reviewed elsewhere.",
            ),
            ...(request.decision === "Accepted"
              ? duplicateInputGuards(db, actor.ownerId, task.input)
              : []),
          ];
          for (const guard of guards) await guard.check();
          return {
            result: { id: proposal.id, revision: proposal.revision + 1, revisionId: null },
            guards,
            writes: [
              db
                .update(s.duplicateAiProposals)
                .set({
                  state: request.decision,
                  revision: proposal.revision + 1,
                  reviewedAt: Date.now(),
                  ...(request.decision === "Rejected" ? { payload: null } : {}),
                })
                .where(eq(s.duplicateAiProposals.id, proposal.id)),
            ],
            history: [
              {
                entityId: proposal.id,
                after: {
                  taskId: task.id,
                  pairId: task.pairId,
                  digest: proposal.digest,
                  decision: request.decision,
                },
              },
            ],
          };
        },
      );
    },
  };
}
