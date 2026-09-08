import type {
  BulkAddSourceEvidenceRequest,
  ExtractionResult,
  RetrySourceAiRequest,
  ReviewSourceCandidateRequest,
  StartSourceAiRequest,
} from "@river/contracts";
import {
  ApplicationError,
  canonicalJson,
  fingerprint,
  indexSourcePassages,
  newId,
  type Principal,
  type SourceAiInput,
  type SourceAiProfile,
  validateSourceCandidates,
} from "@river/domain";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { aiCapacityGuard } from "./ai-capacity";
import { createCommands, type Guard, type Write } from "./commands";
import { createEvidenceRepository } from "./evidence";
import type { Database } from "./index";
import * as s from "./schema";
import { createSourceRepository } from "./sources";

function conflict(message: string): never {
  throw new ApplicationError({ code: "Conflict", message });
}
function owner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the account owner can extract or add evidence.",
    });
}
export function createSourceAiRepository(db: Database) {
  const commands = createCommands(db),
    sources = createSourceRepository(db),
    evidence = createEvidenceRepository(db);
  const taskById = async (ownerId: string, id: string) => {
    const row = (
      await db
        .select()
        .from(s.sourceAiTasks)
        .where(and(eq(s.sourceAiTasks.id, id), eq(s.sourceAiTasks.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!row)
      throw new ApplicationError({ code: "NotFound", message: "Source analysis task not found." });
    return row;
  };
  const guarded = (condition: SQL, reason: string): Guard => ({
    condition,
    check: async () => {
      if (!(await db.get<{ valid: number }>(sql`SELECT ${condition} AS valid`))?.valid)
        conflict(reason);
    },
  });
  const conditions = (ownerId: string, input: SourceAiInput) => [
    {
      reason: "The source or current processing result changed.",
      condition: sql`EXISTS (SELECT 1 FROM sources WHERE id=${input.source.id} AND owner_id=${ownerId} AND revision=${input.source.revision} AND current_processing_id=${input.source.processingId} AND state='Ready' AND archived_at IS NULL)`,
    },
    {
      reason: "A selected context changed.",
      condition: sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(input.contexts.map((item) => ({ id: item.id, revision: item.aggregateRevision, revisionId: item.revisionId })))}) expected WHERE NOT EXISTS (SELECT 1 FROM contexts c WHERE c.id=json_extract(expected.value,'$.id') AND c.owner_id=${ownerId} AND c.revision=json_extract(expected.value,'$.revision') AND c.current_revision_id=json_extract(expected.value,'$.revisionId')))`,
    },
  ];
  const inputGuards = (ownerId: string, input: SourceAiInput) =>
    conditions(ownerId, input).map((item) => guarded(item.condition, item.reason));
  const staleReasons = async (ownerId: string, input: SourceAiInput) => {
    const reasons: string[] = [];
    for (const item of conditions(ownerId, input))
      if (!(await db.get<{ valid: number }>(sql`SELECT ${item.condition} AS valid`))?.valid)
        reasons.push(item.reason);
    return reasons;
  };

  const operationWrites = (ownerId: string, id: string, taskId: string): Write[] => [
    db.insert(s.operations).values({
      id,
      ownerId,
      input: { type: "source-ai", taskId },
      state: "Pending",
      stage: "Queued to extract evidence",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    db.insert(s.dispatches).values({ operationId: id }),
  ];
  const captureSourceAiInput = async (
    actor: Principal,
    request: StartSourceAiRequest,
    extraction: ExtractionResult,
    contract: SourceAiProfile["contract"] = "river-source-claims-v3",
  ) => {
    owner(actor);
    const source = await sources.getSource(actor.ownerId, request.sourceId),
      processing = await sources.getProcessingResult(
        actor.ownerId,
        request.sourceId,
        request.processingId,
      );
    if (!source || !processing)
      throw new ApplicationError({
        code: "NotFound",
        message: "Source or processing result not found.",
      });
    if (
      source.state !== "Ready" ||
      source.archivedAt !== null ||
      source.revision !== request.revision ||
      source.currentProcessingId !== request.processingId
    )
      conflict("Select the current processed source before extracting evidence.");
    if (
      extraction.parser !== processing.parser ||
      extraction.parserVersion !== processing.parserVersion ||
      extraction.text.length !== processing.characterCount
    )
      throw new ApplicationError({
        code: "Unavailable",
        message: "The extraction identity could not be confirmed.",
      });
    if (new Set(request.contexts.map((item) => item.id)).size !== request.contexts.length)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Select each context once.",
      });
    const contexts: SourceAiInput["contexts"][number][] = [];
    for (const ref of request.contexts) {
      const current = (
        await db
          .select({ record: s.contexts, revision: s.contextRevisions })
          .from(s.contexts)
          .innerJoin(s.contextRevisions, eq(s.contextRevisions.id, s.contexts.currentRevisionId))
          .where(and(eq(s.contexts.id, ref.id), eq(s.contexts.ownerId, actor.ownerId)))
          .limit(1)
      )[0];
      if (!current)
        throw new ApplicationError({
          code: "NotFound",
          message: "A selected context is unavailable.",
        });
      if (current.revision.id !== ref.revisionId)
        conflict("Select the current context before extracting evidence.");
      contexts.push({
        id: ref.id,
        revisionId: ref.revisionId,
        aggregateRevision: current.record.revision,
        data: current.revision.data,
      });
    }
    const input: SourceAiInput = {
      type: "source-claims",
      focus: request.focus,
      source: {
        id: source.id,
        revision: source.revision,
        digest: source.digest,
        title: source.title,
        kind: source.kind,
        processingId: processing.id,
        processingDigest: processing.digest,
        parser: processing.parser,
        parserVersion: processing.parserVersion,
        text: extraction.text,
        segments: extraction.segments.map(({ start, end, page, line }) => ({
          start,
          end,
          ...(page === undefined ? {} : { page }),
          ...(line === undefined ? {} : { line }),
        })),
      },
      contexts,
      ...(contract !== "river-source-claims-v1"
        ? { sourceAnchors: indexSourcePassages(extraction.text, source.id, processing.id) }
        : {}),
    };
    if (!input.source.text.trim())
      throw new ApplicationError({
        code: "InvalidInput",
        message: "This extraction has no text to review. Use manual intake or retry extraction.",
      });
    return input;
  };
  return {
    captureSourceAiInput,
    async addSourceEvidence(actor: Principal, request: BulkAddSourceEvidenceRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "add-source-evidence",
        request.idempotencyKey,
        request,
        async () => {
          const task = await taskById(actor.ownerId, request.taskId);
          const ids = new Set(request.items.map((item) => item.id));
          if (
            ids.size !== request.items.length ||
            request.items.some((item) => !item.assertion.trim())
          )
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Select each evidence item once and provide its text.",
            });
          const pending = await db
            .select()
            .from(s.sourceCandidates)
            .where(
              and(eq(s.sourceCandidates.taskId, task.id), eq(s.sourceCandidates.state, "Pending")),
            )
            .orderBy(s.sourceCandidates.ordinal);
          if (
            request.mode === "all" &&
            (pending.length !== ids.size || pending.some((item) => !ids.has(item.id)))
          )
            conflict("The extraction results changed. Refresh the results before using Add all.");
          const guards = inputGuards(actor.ownerId, task.input);
          // One JSON parameter keeps the atomic guard below D1's variable limit for large imports.
          guards.push(
            guarded(
              sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(request.items.map(({ id, revision, digest }) => ({ id, revision, digest })))}) expected LEFT JOIN source_ai_candidates current ON current.id=json_extract(expected.value,'$.id') AND current.task_id=${task.id} WHERE current.id IS NULL OR current.state != 'Pending' OR current.revision != json_extract(expected.value,'$.revision') OR current.digest != json_extract(expected.value,'$.digest'))`,
              "An extraction result changed. Refresh the results; nothing was added.",
            ),
          );
          if (request.mode === "all")
            guards.push(
              guarded(
                sql`(SELECT count(*) FROM source_ai_candidates WHERE task_id=${task.id} AND state='Pending')=${pending.length}`,
                "The extraction results changed. Refresh before using Add all.",
              ),
            );
          const writes: Write[] = [];
          const history: { entityId: string; after: unknown }[] = [];
          for (const item of request.items) {
            const candidate = pending.find((row) => row.id === item.id);
            if (
              !candidate?.payload ||
              candidate.revision !== item.revision ||
              candidate.digest !== item.digest
            )
              conflict(
                "An extraction result changed or was already added. Refresh the results; nothing was added.",
              );
            const created = await evidence.prepareEvidenceCreate(actor, item.metadata, {
              ...candidate.payload.material,
              assertion: item.assertion,
            });
            writes.push(
              ...created.writes,
              db
                .update(s.sourceCandidates)
                .set({
                  state: "Accepted",
                  revision: candidate.revision + 1,
                  reviewedAt: Date.now(),
                  claimId: created.result.id,
                  evidenceRevisionId: created.result.revisionId,
                })
                .where(eq(s.sourceCandidates.id, candidate.id)),
            );
            history.push(...created.history, {
              entityId: candidate.id,
              after: {
                decision: "Accepted",
                digest: candidate.digest,
                taskId: task.id,
                claimId: created.result.id,
                evidenceRevisionId: created.result.revisionId,
              },
            });
          }
          return {
            result: { id: task.id, revision: task.revision, revisionId: null },
            guards,
            writes,
            history,
          };
        },
      );
    },
    async startSourceAi(
      actor: Principal,
      request: StartSourceAiRequest,
      profile: SourceAiProfile | null,
      extraction: ExtractionResult,
    ) {
      owner(actor);
      return commands.commit(
        actor,
        "start-source-ai",
        request.idempotencyKey,
        request,
        async () => {
          if (!profile)
            throw new ApplicationError({
              code: "Unavailable",
              message:
                "Evidence extraction is unavailable. Add evidence manually or choose an active personal AI connection.",
            });
          const input = await captureSourceAiInput(actor, request, extraction, profile.contract);
          if (canonicalJson(input).length > profile.maxInputCharacters)
            throw new ApplicationError({
              code: "InvalidInput",
              message:
                "Complete source and context exceed the 160,000-character input limit. Use a smaller source or add evidence manually; nothing was truncated.",
            });
          const id = newId(),
            operationId = newId();
          return {
            result: { id, revision: 0, revisionId: operationId },
            guards: [...inputGuards(actor.ownerId, input), aiCapacityGuard(db, actor.ownerId)],
            writes: [
              ...operationWrites(actor.ownerId, operationId, id),
              db.insert(s.sourceAiTasks).values({
                id,
                ownerId: actor.ownerId,
                sourceId: input.source.id,
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
                  sourceId: input.source.id,
                  processingId: input.source.processingId,
                  profile,
                  operationId,
                },
              },
            ],
          };
        },
      );
    },
    async inspectSourceAi(ownerId: string, id: string) {
      const task = await taskById(ownerId, id),
        candidates = await db
          .select()
          .from(s.sourceCandidates)
          .where(eq(s.sourceCandidates.taskId, id))
          .orderBy(s.sourceCandidates.ordinal);
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
        candidates,
        operation,
        staleReasons: await staleReasons(ownerId, task.input),
      };
    },
    async listSourceAi(ownerId: string, sourceId: string, offset: number) {
      if (!(await sources.getSource(ownerId, sourceId)))
        throw new ApplicationError({ code: "NotFound", message: "Source not found." });
      const rows = await db
        .select({
          id: s.sourceAiTasks.id,
          createdAt: s.sourceAiTasks.createdAt,
          completedAt: s.sourceAiTasks.completedAt,
          state: s.operations.state,
          stage: s.operations.stage,
          pending: sql<number>`(SELECT count(*) FROM source_ai_candidates WHERE task_id=${s.sourceAiTasks.id} AND state='Pending')`,
          accepted: sql<number>`(SELECT count(*) FROM source_ai_candidates WHERE task_id=${s.sourceAiTasks.id} AND state='Accepted')`,
          rejected: sql<number>`(SELECT count(*) FROM source_ai_candidates WHERE task_id=${s.sourceAiTasks.id} AND state='Rejected')`,
        })
        .from(s.sourceAiTasks)
        .innerJoin(s.operations, eq(s.operations.id, s.sourceAiTasks.latestOperationId))
        .where(and(eq(s.sourceAiTasks.ownerId, ownerId), eq(s.sourceAiTasks.sourceId, sourceId)))
        .orderBy(desc(s.sourceAiTasks.createdAt), desc(s.sourceAiTasks.id))
        .limit(51)
        .offset(offset);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async retrySourceAi(
      actor: Principal,
      request: RetrySourceAiRequest,
      profile: SourceAiProfile | null,
    ) {
      owner(actor);
      return commands.commit(
        actor,
        "retry-source-ai",
        request.idempotencyKey,
        request,
        async () => {
          const task = await taskById(actor.ownerId, request.id);
          if (!profile)
            throw new ApplicationError({
              code: "Unavailable",
              message: "Evidence extraction is unavailable. Add evidence manually.",
            });
          if (
            request.revision !== task.revision ||
            canonicalJson(profile) !== canonicalJson(task.profile)
          )
            conflict("The task or profile changed. Generate a new task from current inputs.");
          if (task.attempts >= 3)
            conflict(
              "This task exhausted its three attempts. Continue manually or start a new task.",
            );
          const operationId = newId();
          return {
            result: { id: task.id, revision: task.revision + 1, revisionId: operationId },
            guards: [
              ...inputGuards(actor.ownerId, task.input),
              aiCapacityGuard(db, actor.ownerId),
              guarded(
                sql`EXISTS (SELECT 1 FROM source_ai_tasks t JOIN operations o ON o.id=t.latest_operation_id WHERE t.id=${task.id} AND t.revision=${task.revision} AND t.completed_at IS NULL AND o.state IN ('Failed','Cancelled'))`,
                "This task cannot be retried in its current state.",
              ),
            ],
            writes: [
              ...operationWrites(actor.ownerId, operationId, task.id),
              db
                .update(s.sourceAiTasks)
                .set({
                  latestOperationId: operationId,
                  revision: task.revision + 1,
                  attempts: task.attempts + 1,
                })
                .where(eq(s.sourceAiTasks.id, task.id)),
            ],
            history: [{ entityId: task.id, after: { operationId, attempt: task.attempts + 1 } }],
          };
        },
      );
    },
    async publishSourceAi(ownerId: string, taskId: string, operationId: string, output: unknown) {
      const task = await taskById(ownerId, taskId);
      if (task.latestOperationId !== operationId) return false;
      if (task.completedAt !== null) return true;
      const operation = (
        await db.select().from(s.operations).where(eq(s.operations.id, operationId)).limit(1)
      )[0];
      if (!operation || !["Pending", "Running"].includes(operation.state)) return false;
      const candidates = validateSourceCandidates(task.input, output),
        guardId = newId(),
        now = Date.now();
      const writes: Write[] = [];
      for (const [ordinal, payload] of candidates.entries())
        writes.push(
          db.insert(s.sourceCandidates).values({
            id: newId(),
            taskId,
            operationId,
            ordinal,
            payload,
            digest: await fingerprint(canonicalJson(payload)),
            state: "Pending",
            revision: 0,
            createdAt: now,
          }),
        );
      try {
        await db.batch([
          db.insert(s.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM source_ai_tasks t JOIN operations o ON o.id=t.latest_operation_id WHERE t.id=${taskId} AND t.completed_at IS NULL AND o.id=${operationId} AND o.state IN ('Pending','Running'))`,
          }),
          ...writes,
          db
            .update(s.sourceAiTasks)
            .set({ completedAt: now })
            .where(eq(s.sourceAiTasks.id, taskId)),
          db
            .update(s.operations)
            .set({
              state: "Succeeded",
              stage: candidates.length
                ? `${candidates.length} evidence items ready to add`
                : "No supported evidence found",
              failure: null,
              updatedAt: now,
            })
            .where(eq(s.operations.id, operationId)),
          db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const current = await taskById(ownerId, taskId);
        if (current.latestOperationId !== operationId) return false;
        if (current.completedAt !== null) return true;
        const state = (
          await db.select().from(s.operations).where(eq(s.operations.id, operationId)).limit(1)
        )[0]?.state;
        if (state && !["Pending", "Running"].includes(state)) return false;
        throw error;
      }
      return true;
    },
    async reviewSourceCandidate(actor: Principal, request: ReviewSourceCandidateRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "review-source-candidate",
        request.idempotencyKey,
        request,
        async () => {
          const candidate = (
            await db
              .select()
              .from(s.sourceCandidates)
              .where(eq(s.sourceCandidates.id, request.id))
              .limit(1)
          )[0];
          if (!candidate)
            throw new ApplicationError({ code: "NotFound", message: "Claim candidate not found." });
          const task = await taskById(actor.ownerId, candidate.taskId);
          if (
            candidate.state !== "Pending" ||
            candidate.revision !== request.revision ||
            candidate.digest !== request.digest ||
            !candidate.payload
          )
            conflict("This exact candidate changed or has already been reviewed.");
          const guards = [
            guarded(
              sql`EXISTS (SELECT 1 FROM source_ai_candidates WHERE id=${candidate.id} AND revision=${candidate.revision} AND state='Pending' AND digest=${request.digest})`,
              "This candidate was reviewed elsewhere.",
            ),
          ];
          const writes: Write[] = [],
            history: { entityId: string; after: unknown }[] = [];
          let claimId: string | null = null,
            evidenceRevisionId: string | null = null;
          if (request.decision === "Accepted") {
            guards.push(...inputGuards(actor.ownerId, task.input));
            const created = await evidence.prepareEvidenceCreate(
              actor,
              candidate.payload.metadata,
              candidate.payload.material,
            );
            claimId = created.result.id;
            evidenceRevisionId = created.result.revisionId;
            writes.push(...created.writes);
            history.push(
              ...created.history.map((item) => ({
                ...item,
                after: {
                  ...item.after,
                  sourceCandidateId: candidate.id,
                  sourceCandidateDigest: candidate.digest,
                },
              })),
            );
            if (!evidenceRevisionId) throw Error("Missing created Evidence Revision");
          }
          writes.push(
            db
              .update(s.sourceCandidates)
              .set({
                state: request.decision,
                revision: candidate.revision + 1,
                reviewedAt: Date.now(),
                claimId,
                evidenceRevisionId,
                ...(request.decision === "Rejected" ? { payload: null } : {}),
              })
              .where(eq(s.sourceCandidates.id, candidate.id)),
          );
          history.push({
            entityId: candidate.id,
            after: {
              decision: request.decision,
              digest: candidate.digest,
              taskId: task.id,
              claimId,
              evidenceRevisionId,
            },
          });
          return {
            result: {
              id: candidate.id,
              revision: candidate.revision + 1,
              revisionId: evidenceRevisionId,
            },
            guards,
            writes,
            history,
          };
        },
      );
    },
  };
}
