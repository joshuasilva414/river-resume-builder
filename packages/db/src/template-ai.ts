import type {
  ArtifactManifest,
  RetryTemplateAiRequest,
  ReviewTemplateAiRequest,
  StartTemplateAiRequest,
  TemplateAiList,
} from "@river/contracts";
import { ApplicationError, canonicalJson, fingerprint, newId, type Principal } from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  fixtureSetPayload,
  graphInventory,
  scopedTemplate,
  TEMPLATE_FIXTURE_VERSION,
  type TemplateAiInput,
  type TemplateAiProfile,
  TemplateScope,
  templateCandidate,
  templateFixtures,
} from "@river/templates";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { Schema } from "effect";
import { aiCapacityGuard } from "./ai-capacity";
import { conditionGuard, createCommands, type Guard, type Write } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";
import { createTemplateConversationRepository } from "./template-conversations";
import type { TemplateDependency } from "./template-types";
import { createTemplateRepository, requireTemplateOwner } from "./templates";

/** Template generation can read templates and canonical fixtures only, never workspace content. */
export function createTemplateAiRepository(db: Database) {
  const commands = createCommands(db),
    templates = createTemplateRepository(db),
    conversations = createTemplateConversationRepository(db);
  const taskById = async (ownerId: string, id: string) => {
    const task = (
      await db
        .select()
        .from(s.templateAiTasks)
        .where(and(eq(s.templateAiTasks.id, id), eq(s.templateAiTasks.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!task)
      throw new ApplicationError({
        code: "NotFound",
        message: "Template proposal task not found.",
      });
    return task;
  };
  const proposalFor = async (taskId: string) =>
    (
      await db
        .select()
        .from(s.templateAiProposals)
        .where(eq(s.templateAiProposals.taskId, taskId))
        .limit(1)
    )[0] ?? null;
  const operationById = async (id: string) =>
    (await db.select().from(s.operations).where(eq(s.operations.id, id)).limit(1))[0] ?? null;
  function inputGuards(
    task: Pick<
      typeof s.templateAiTasks.$inferSelect,
      "dependency" | "destinationId" | "destinationRevision" | "input"
    >,
  ): Guard[] {
    const guards: Guard[] = [];
    if (task.dependency) {
      const d = task.dependency;
      guards.push(
        conditionGuard(
          db,
          sql`EXISTS (SELECT 1 FROM template_revisions r JOIN template_designs d ON d.id=r.design_id WHERE r.id=${d.revisionId} AND r.review_revision=${d.reviewRevision} AND d.id=${d.designId} AND d.revision=${d.designRevision})`,
          "The captured base graph or its review state changed. Inspect it before generating a new proposal.",
        ),
      );
    }
    guards.push(
      task.destinationId
        ? conditionGuard(
            db,
            sql`EXISTS (SELECT 1 FROM template_designs WHERE id=${task.destinationId} AND revision=${task.destinationRevision})`,
            "The destination design changed. Generate a new proposal against its current revision.",
          )
        : conditionGuard(
            db,
            sql`NOT EXISTS (SELECT 1 FROM template_designs WHERE id=${task.input.destination.id})`,
            "The reserved design identity is already in use.",
          ),
    );
    return guards;
  }
  async function capture(ownerId: string, request: StartTemplateAiRequest) {
    if (request.id && request.reservedDesignId !== request.id)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "The reserved identity must match the destination design.",
      });
    if (!request.name.trim() || !request.brief.character.trim())
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Name the template and describe its visual character.",
      });
    const base = await templates.resolveTemplateBase(ownerId, request.base);
    let dependency: TemplateDependency | null = null;
    if (request.base.kind === "saved") {
      const row = await templates.getTemplateRevision(ownerId, request.base.revisionId);
      dependency = {
        revisionId: row.revision.id,
        reviewRevision: row.revision.reviewRevision,
        designId: row.design.id,
        designRevision: row.design.revision,
      };
    }
    if (request.id) {
      const design = (
        await db
          .select()
          .from(s.templateDesigns)
          .where(and(eq(s.templateDesigns.id, request.id), eq(s.templateDesigns.ownerId, ownerId)))
          .limit(1)
      )[0];
      if (!design)
        throw new ApplicationError({
          code: "NotFound",
          message: "Destination template not found.",
        });
      if (
        design.revision !== request.revision ||
        canonicalJson(design.scope) !== canonicalJson(request.scope)
      )
        throw new ApplicationError({
          code: "Conflict",
          message: "The template destination revision or scope changed.",
        });
    } else if (request.revision !== null)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "A new template has no existing revision.",
      });
    const turn = await conversations.prepareTemplateTurn(ownerId, request);
    const input: TemplateAiInput = {
      type: "template-generation",
      scope: request.scope,
      brief: request.brief,
      conversation: turn.input,
      baseGraph: base.graph,
      destination: {
        id: request.reservedDesignId,
        revision: request.revision ?? 0,
        manifestRevision: (request.revision ?? -1) + 2,
      },
      fixtureSet: {
        version: TEMPLATE_FIXTURE_VERSION,
        digest: await fingerprint(fixtureSetPayload()),
        fixtures: templateFixtures,
      },
    };
    return {
      input,
      dependency,
      base: request.base,
      destinationId: request.id,
      destinationRevision: request.revision,
      name: request.name,
      turn,
    };
  }
  const operationWrites = (
    ownerId: string,
    id: string,
    taskId: string,
    preview: boolean,
  ): Write[] => [
    db.insert(s.operations).values({
      id,
      ownerId,
      input: { type: "template-ai", taskId },
      state: "Pending",
      stage: preview ? "Queued for synthetic candidate preview" : "Queued for template proposal",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    db.insert(s.dispatches).values({ operationId: id }),
  ];
  const active = (taskId: string, operationId: string) =>
    sql`EXISTS (SELECT 1 FROM template_ai_tasks t JOIN operations o ON o.id=t.latest_operation_id WHERE t.id=${taskId} AND o.id=${operationId} AND o.state IN ('Pending','Running'))`;
  return {
    async previewTemplateAi(actor: Principal, request: StartTemplateAiRequest) {
      requireTemplateOwner(actor);
      const captured = await capture(actor.ownerId, request),
        characters = canonicalJson(captured.input).length;
      return {
        input: captured.input,
        digest: await fingerprint(canonicalJson(captured.input)),
        characters,
        limit: 160000,
        allowed: characters <= 160000,
      };
    },
    async startTemplateAi(
      actor: Principal,
      request: StartTemplateAiRequest,
      profile: TemplateAiProfile | null,
    ) {
      requireTemplateOwner(actor);
      return commands.commit(
        actor,
        "start-template-ai",
        request.idempotencyKey,
        request,
        async () => {
          if (!profile)
            throw new ApplicationError({
              code: "Unavailable",
              message: "Template AI is unavailable. Continue in the manual editor.",
            });
          const captured = await capture(actor.ownerId, request);
          if (request.expectedInputDigest !== (await fingerprint(canonicalJson(captured.input))))
            throw new ApplicationError({
              code: "Conflict",
              message: "Review the complete current synthetic input before generating.",
            });
          if (canonicalJson(captured.input).length > profile.maxInputCharacters)
            throw new ApplicationError({
              code: "InvalidInput",
              message:
                "The complete template input exceeds 160,000 UTF-16 units. Nothing was truncated.",
            });
          const id = newId(),
            operationId = newId(),
            inputDigest = await fingerprint(canonicalJson(captured.input));
          const { turn, ...taskInput } = captured;
          return {
            result: { id, revision: 0, revisionId: operationId },
            guards: [
              ...inputGuards(captured),
              captured.turn.guard,
              aiCapacityGuard(db, actor.ownerId),
            ],
            writes: [
              ...operationWrites(actor.ownerId, operationId, id, false),
              db.insert(s.templateAiTasks).values({
                id,
                ownerId: actor.ownerId,
                ...taskInput,
                inputDigest,
                profile,
                latestOperationId: operationId,
                createdAt: Date.now(),
              }),
              ...turn.writes(id),
            ],
            history: [
              {
                entityId: id,
                after: {
                  inputDigest,
                  profile,
                  operationId,
                  base: request.base,
                  scope: request.scope,
                  conversationId: captured.turn.input.id,
                  turn: captured.turn.input.turn,
                },
              },
            ],
          };
        },
      );
    },
    async inspectTemplateAi(ownerId: string, id: string) {
      const task = await taskById(ownerId, id),
        proposal = await proposalFor(id),
        operation = await operationById(task.latestOperationId);
      const staleReasons: string[] = [];
      for (const guard of !proposal || proposal.state === "Pending" ? inputGuards(task) : []) {
        try {
          await guard.check();
        } catch (error) {
          if (error instanceof ApplicationError) staleReasons.push(error.message);
          else throw error;
        }
      }
      if (
        (!proposal || proposal.state === "Pending") &&
        task.input.fixtureSet.digest !== (await fingerprint(fixtureSetPayload()))
      )
        staleReasons.push("The canonical fixture set changed.");
      const currentBase =
        task.base.kind === "saved"
          ? await templates.getTemplateRevision(ownerId, task.base.revisionId)
          : null;
      const candidateGraphDigest = proposal?.payload
        ? await fingerprint(canonicalJson(proposal.payload.graph))
        : null;
      return { task, proposal, operation, staleReasons, currentBase, candidateGraphDigest };
    },
    async listTemplateAi(ownerId: string, request: TemplateAiList) {
      const designFilter = request.designId
        ? or(
            eq(s.templateAiTasks.destinationId, request.designId),
            sql`json_extract(${s.templateAiTasks.dependency},'$.designId')=${request.designId}`,
            sql`json_extract(${s.templateAiTasks.input},'$.destination.id')=${request.designId}`,
          )
        : undefined;
      const rows = await db
        .select({
          id: s.templateAiTasks.id,
          name: s.templateAiTasks.name,
          createdAt: s.templateAiTasks.createdAt,
          destinationId: s.templateAiTasks.destinationId,
          base: s.templateAiTasks.base,
          scope: sql`json_extract(${s.templateAiTasks.input},'$.scope')`.mapWith((value) =>
            Schema.decodeUnknownSync(TemplateScope)(JSON.parse(String(value))),
          ),
          state: s.templateAiProposals.state,
          operationState: s.operations.state,
          stage: s.operations.stage,
          expiresAt: sql<
            number | null
          >`json_extract(${s.templateAiProposals.previewArtifacts},'$.expiresAt')`,
          resultRevisionId: s.templateAiProposals.resultRevisionId,
          conversationId: s.templateConversationTurns.conversationId,
        })
        .from(s.templateAiTasks)
        .innerJoin(s.operations, eq(s.operations.id, s.templateAiTasks.latestOperationId))
        .leftJoin(s.templateAiProposals, eq(s.templateAiProposals.taskId, s.templateAiTasks.id))
        .leftJoin(
          s.templateConversationTurns,
          eq(s.templateConversationTurns.taskId, s.templateAiTasks.id),
        )
        .where(
          and(
            eq(s.templateAiTasks.ownerId, ownerId),
            designFilter,
            request.state
              ? sql`coalesce(${s.templateAiProposals.state},'Pending')=${request.state}`
              : undefined,
          ),
        )
        .orderBy(desc(s.templateAiTasks.createdAt), desc(s.templateAiTasks.id))
        .limit(51)
        .offset(request.offset);
      const counts = await db
        .select({
          state: sql<string>`coalesce(${s.templateAiProposals.state},'Pending')`,
          count: sql<number>`count(*)`,
        })
        .from(s.templateAiTasks)
        .leftJoin(s.templateAiProposals, eq(s.templateAiProposals.taskId, s.templateAiTasks.id))
        .where(and(eq(s.templateAiTasks.ownerId, ownerId), designFilter))
        .groupBy(sql`coalesce(${s.templateAiProposals.state},'Pending')`);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50, counts };
    },
    async retryTemplateAi(
      actor: Principal,
      request: RetryTemplateAiRequest,
      profile: TemplateAiProfile | null,
      documentConfigured: boolean,
    ) {
      requireTemplateOwner(actor);
      return commands.commit(
        actor,
        "retry-template-ai",
        request.idempotencyKey,
        request,
        async () => {
          const task = await taskById(actor.ownerId, request.id),
            proposal = await proposalFor(task.id),
            operation = await operationById(task.latestOperationId);
          if (request.revision !== task.revision || (proposal && proposal.state !== "Pending"))
            throw new ApplicationError({
              code: "Conflict",
              message: "This proposal changed or was already reviewed.",
            });
          const expired =
            !!proposal?.previewArtifacts?.validationPassed &&
            (proposal.previewArtifacts.expiresAt ?? 0) <= Date.now();
          if (!operation || (!["Failed", "Cancelled"].includes(operation.state) && !expired))
            throw new ApplicationError({
              code: "Conflict",
              message: "This task cannot be retried in its current state.",
            });
          if (proposal) {
            if (!documentConfigured || (!expired && proposal.previewAttempts >= 3))
              throw new ApplicationError({
                code: "Unavailable",
                message:
                  "Preview rendering is unavailable or this cycle exhausted its three attempts.",
              });
          } else if (
            !profile ||
            canonicalJson({ ...profile, contract: task.profile.contract }) !==
              canonicalJson(task.profile) ||
            task.attempts >= 3
          )
            throw new ApplicationError({
              code: "Unavailable",
              message:
                "The generation profile is unavailable or this task exhausted its three attempts.",
            });
          const guards = inputGuards(task);
          for (const guard of guards) await guard.check();
          const id = newId();
          return {
            result: { id: task.id, revision: task.revision + 1, revisionId: id },
            guards: [
              ...guards,
              aiCapacityGuard(db, actor.ownerId),
              conditionGuard(
                db,
                sql`EXISTS (SELECT 1 FROM template_ai_tasks WHERE id=${task.id} AND revision=${task.revision})`,
                "The task changed elsewhere.",
              ),
              conditionGuard(
                db,
                sql`EXISTS (SELECT 1 FROM operations WHERE id=${operation.id} AND state=${operation.state}) ${proposal ? sql`AND EXISTS (SELECT 1 FROM template_ai_proposals WHERE id=${proposal.id} AND revision=${proposal.revision} AND state='Pending')` : sql`AND NOT EXISTS (SELECT 1 FROM template_ai_proposals WHERE task_id=${task.id})`}`,
                "The proposal or operation changed.",
              ),
            ],
            writes: [
              ...operationWrites(actor.ownerId, id, task.id, !!proposal),
              db
                .update(s.templateAiTasks)
                .set({
                  latestOperationId: id,
                  revision: task.revision + 1,
                  attempts: task.attempts + (proposal ? 0 : 1),
                })
                .where(eq(s.templateAiTasks.id, task.id)),
              ...(proposal
                ? [
                    db
                      .update(s.templateAiProposals)
                      .set({
                        previewAttempts: expired ? 1 : proposal.previewAttempts + 1,
                        previewOperationId: null,
                        previewDigest: null,
                        previewArtifacts: null,
                        revision: proposal.revision + 1,
                      })
                      .where(eq(s.templateAiProposals.id, proposal.id)),
                  ]
                : []),
            ],
            history: [
              {
                entityId: task.id,
                after: {
                  operationId: id,
                  phase: proposal ? "preview" : "generation",
                  attempt: proposal
                    ? expired
                      ? 1
                      : proposal.previewAttempts + 1
                    : task.attempts + 1,
                  refreshedPreviewOperationId: expired ? proposal?.previewOperationId : null,
                  refreshedPreviewDigest: expired ? proposal?.previewDigest : null,
                },
              },
            ],
          };
        },
      );
    },
    async publishTemplateCandidate(
      ownerId: string,
      taskId: string,
      operationId: string,
      output: unknown,
    ) {
      const task = await taskById(ownerId, taskId),
        existing = await proposalFor(taskId);
      if (existing) return existing.id;
      if (
        task.latestOperationId !== operationId ||
        !(await operationById(operationId))?.state.match(/^(Pending|Running)$/)
      )
        return null;
      const payload = templateCandidate(task.input, output),
        digest = await fingerprint(canonicalJson(payload)),
        id = newId(),
        guardId = newId();
      try {
        await db.batch([
          db.insert(s.mutationGuards).values({ id: guardId, passed: active(taskId, operationId) }),
          db
            .insert(s.templateAiProposals)
            .values({ id, taskId, operationId, payload, digest, createdAt: Date.now() }),
          db
            .update(s.operations)
            .set({
              state: "Running",
              stage: "Rendering synthetic candidate preview",
              updatedAt: Date.now(),
            })
            .where(eq(s.operations.id, operationId)),
          db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const saved = await proposalFor(taskId);
        if (saved) return saved.id;
        const current = await operationById(operationId);
        if (current && !["Pending", "Running"].includes(current.state)) return null;
        throw error;
      }
      return id;
    },
    async publishTemplateCandidatePreview(
      ownerId: string,
      taskId: string,
      operationId: string,
      artifacts: ArtifactManifest,
      reportDigest: string,
    ) {
      const task = await taskById(ownerId, taskId),
        proposal = await proposalFor(taskId);
      if (
        !proposal?.payload ||
        proposal.state !== "Pending" ||
        task.latestOperationId !== operationId
      )
        return false;
      if (proposal.previewOperationId === operationId && proposal.previewDigest === reportDigest)
        return true;
      if (
        artifacts.rendererVersion !== CUSTOM_RENDERER_VERSION ||
        artifacts.templateIdentity !== canonicalJson(graphInventory(proposal.payload.graph)) ||
        !artifacts.expiresAt ||
        artifacts.expiresAt <= Date.now()
      )
        throw new Error("Candidate preview did not honor the exact graph or retention limit.");
      const guardId = newId();
      try {
        await db.batch([
          db.insert(s.mutationGuards).values({
            id: guardId,
            passed: sql`${active(taskId, operationId)} AND EXISTS (SELECT 1 FROM template_ai_proposals WHERE id=${proposal.id} AND state='Pending' AND revision=${proposal.revision})`,
          }),
          db
            .update(s.templateAiProposals)
            .set({
              previewOperationId: operationId,
              previewArtifacts: artifacts,
              previewDigest: reportDigest,
              revision: proposal.revision + 1,
            })
            .where(eq(s.templateAiProposals.id, proposal.id)),
          db
            .update(s.operations)
            .set({
              state: artifacts.validationPassed ? "Succeeded" : "Failed",
              stage: artifacts.validationPassed
                ? "Template proposal ready for review"
                : "Candidate text integrity failed",
              failure: artifacts.validationPassed
                ? null
                : "The synthetic candidate text failed validation. Inspect the report before revising the template.",
              updatedAt: Date.now(),
            })
            .where(eq(s.operations.id, operationId)),
          db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const current = await proposalFor(taskId);
        if (current?.previewOperationId === operationId) return true;
        if (
          current?.state !== "Pending" ||
          !["Pending", "Running"].includes((await operationById(operationId))?.state ?? "")
        )
          return false;
        throw error;
      }
      return true;
    },
    async reviewTemplateAi(actor: Principal, request: ReviewTemplateAiRequest) {
      requireTemplateOwner(actor);
      return commands.commit(
        actor,
        "review-template-ai",
        request.idempotencyKey,
        request,
        async () => {
          const proposal = (
            await db
              .select()
              .from(s.templateAiProposals)
              .where(eq(s.templateAiProposals.id, request.id))
              .limit(1)
          )[0];
          if (!proposal)
            throw new ApplicationError({
              code: "NotFound",
              message: "Template proposal not found.",
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
              message: "The exact template proposal changed or was reviewed elsewhere.",
            });
          const guards = [
            conditionGuard(
              db,
              sql`EXISTS (SELECT 1 FROM template_ai_proposals WHERE id=${proposal.id} AND revision=${proposal.revision} AND state='Pending' AND digest=${request.digest})`,
              "This proposal was reviewed or rerendered elsewhere.",
            ),
          ];
          const writes: Write[] = [],
            history: { entityId: string; after: unknown }[] = [];
          let resultRevisionId: string | null = null;
          if (request.decision === "Accepted") {
            const artifacts = proposal.previewArtifacts;
            if (
              !artifacts?.validationPassed ||
              !artifacts.expiresAt ||
              artifacts.expiresAt <= Date.now() ||
              proposal.previewOperationId !== request.previewOperationId ||
              proposal.previewDigest !== request.previewDigest ||
              !request.previewDigest ||
              !request.previewOperationId ||
              artifacts.rendererVersion !== CUSTOM_RENDERER_VERSION ||
              artifacts.templateIdentity !== canonicalJson(graphInventory(proposal.payload.graph))
            )
              throw new ApplicationError({
                code: "Conflict",
                message:
                  "Review a current passing synthetic preview for this exact candidate before accepting.",
              });
            if (task.input.fixtureSet.digest !== (await fingerprint(fixtureSetPayload())))
              throw new ApplicationError({
                code: "Conflict",
                message: "The canonical fixture set changed. Generate a new proposal.",
              });
            guards.push(...inputGuards(task));
            guards.push(
              conditionGuard(
                db,
                sql`EXISTS (SELECT 1 FROM template_ai_proposals p JOIN template_ai_tasks t ON t.id=p.task_id JOIN operations o ON o.id=t.latest_operation_id WHERE p.id=${proposal.id} AND p.preview_operation_id=${request.previewOperationId} AND p.preview_digest=${request.previewDigest} AND o.id=p.preview_operation_id AND o.state='Succeeded' AND json_extract(p.preview_artifacts,'$.expiresAt')>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`,
                "The reviewed preview expired or changed. Review its current replacement before accepting.",
              ),
            );
            for (const guard of guards) await guard.check();
            const graph = proposal.payload.graph;
            const plan = await templates.prepareTemplateRevision(
              actor,
              {
                id: task.destinationId,
                revision: task.destinationRevision,
                name: task.name,
                scope: task.input.scope,
              },
              (id, version) => {
                if (
                  id !== task.input.destination.id ||
                  version !== task.input.destination.manifestRevision
                )
                  throw new ApplicationError({
                    code: "Conflict",
                    message: "The captured template destination changed.",
                  });
                return graph;
              },
              [
                {
                  base: task.base,
                  scope: task.input.scope,
                  componentIdentity: await fingerprint(
                    canonicalJson(scopedTemplate(task.input.baseGraph, task.input.scope)),
                  ),
                },
              ],
              task.input.destination.id,
            );
            guards.push(...plan.guards);
            writes.push(...plan.writes);
            history.push(...plan.history);
            resultRevisionId = plan.result.revisionId;
          } else {
            writes.push(
              db
                .update(s.operations)
                .set({
                  state: "Cancelled",
                  stage: "Template proposal rejected",
                  updatedAt: Date.now(),
                })
                .where(
                  and(
                    eq(s.operations.id, task.latestOperationId),
                    or(eq(s.operations.state, "Pending"), eq(s.operations.state, "Running")),
                  ),
                ),
            );
          }
          writes.push(
            db
              .update(s.templateAiProposals)
              .set({
                state: request.decision,
                revision: proposal.revision + 1,
                reviewedAt: Date.now(),
                resultRevisionId,
                ...(request.decision === "Rejected"
                  ? { payload: null, previewArtifacts: null, previewDigest: null }
                  : {}),
              })
              .where(eq(s.templateAiProposals.id, proposal.id)),
          );
          history.push({
            entityId: proposal.id,
            after: {
              taskId: task.id,
              digest: proposal.digest,
              decision: request.decision,
              resultRevisionId,
              previewOperationId: request.previewOperationId,
              previewDigest: request.previewDigest,
            },
          });
          return {
            result: {
              id: proposal.id,
              revision: proposal.revision + 1,
              revisionId: resultRevisionId,
            },
            guards,
            writes,
            history,
          };
        },
      );
    },
    async rejectedTemplatePreviews(limit = 25) {
      return db
        .select({ taskId: s.templateAiProposals.taskId })
        .from(s.templateAiProposals)
        .where(
          and(
            eq(s.templateAiProposals.state, "Rejected"),
            sql`${s.templateAiProposals.reviewedAt}>${Date.now() - 8 * 24 * 60 * 60_000}`,
          ),
        )
        .orderBy(sql`coalesce(${s.templateAiProposals.previewCleanedAt},0)`)
        .limit(limit);
    },
    async markTemplatePreviewCleaned(taskId: string) {
      await db
        .update(s.templateAiProposals)
        .set({ previewCleanedAt: Date.now() })
        .where(
          and(
            eq(s.templateAiProposals.taskId, taskId),
            eq(s.templateAiProposals.state, "Rejected"),
          ),
        );
    },
  };
}
