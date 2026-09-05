import type { StartTemplateAiRequest, TemplateConversationRequest } from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { type TemplateAiInput, TemplateScope } from "@river/templates";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { Schema } from "effect";
import { conditionGuard, type Write } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

export function createTemplateConversationRepository(db: Database) {
  const conversationById = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(s.templateConversations)
        .where(
          and(eq(s.templateConversations.id, id), eq(s.templateConversations.ownerId, ownerId)),
        )
        .limit(1)
    )[0] ?? null;

  return {
    async prepareTemplateTurn(ownerId: string, request: StartTemplateAiRequest) {
      const id = request.conversation?.id ?? request.reservedDesignId;
      const existing = await conversationById(ownerId, id);
      if (
        !existing &&
        (
          await db
            .select({ id: s.templateConversations.id })
            .from(s.templateConversations)
            .where(eq(s.templateConversations.id, id))
            .limit(1)
        ).length
      )
        throw new ApplicationError({
          code: "NotFound",
          message: "Template conversation not found.",
        });
      if (!existing && id !== request.reservedDesignId) {
        const design = (
          await db
            .select({ id: s.templateDesigns.id })
            .from(s.templateDesigns)
            .where(and(eq(s.templateDesigns.id, id), eq(s.templateDesigns.ownerId, ownerId)))
            .limit(1)
        )[0];
        if (!design)
          throw new ApplicationError({
            code: "NotFound",
            message: "Template conversation not found.",
          });
      }
      const revision = existing?.revision ?? 0;
      if (request.conversation && request.conversation.revision !== revision)
        throw new ApplicationError({
          code: "Conflict",
          message:
            "Another turn was added. Review the updated conversation and input before sending.",
        });
      const instruction =
        request.conversation?.instruction ??
        `Structure: ${request.brief.structure}\nDensity: ${request.brief.density}\nVisual character: ${request.brief.character}\nConstraints: ${request.brief.constraints}`;
      if (!instruction.trim())
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Write a design instruction before reviewing input.",
        });
      const ids = request.conversation?.priorTaskIds ?? [];
      if (ids.length > 100 || new Set(ids).size !== ids.length)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Select up to 100 distinct original instructions.",
        });
      // Keep each SQL statement below D1's bind-parameter limit.
      const selected: { taskId: string; instruction: string; position: number }[] = [];
      for (let offset = 0; offset < ids.length; offset += 50) {
        selected.push(
          ...(await db
            .select({
              taskId: s.templateConversationTurns.taskId,
              instruction: s.templateConversationTurns.instruction,
              position: s.templateConversationTurns.position,
            })
            .from(s.templateConversationTurns)
            .where(
              and(
                eq(s.templateConversationTurns.conversationId, id),
                inArray(s.templateConversationTurns.taskId, ids.slice(offset, offset + 50)),
              ),
            )),
        );
      }
      if (selected.length !== ids.length || selected.some((item) => item.position > revision))
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Selected instructions must belong to earlier turns in this conversation.",
        });
      const input: NonNullable<TemplateAiInput["conversation"]> = {
        id,
        turn: revision + 1,
        instruction,
        priorInstructions: selected
          .sort((a, b) => a.position - b.position)
          .map(({ taskId, instruction }) => ({ taskId, instruction })),
      };
      return {
        input,
        guard: conditionGuard(
          db,
          existing
            ? sql`EXISTS (SELECT 1 FROM template_conversations WHERE id=${id} AND owner_id=${ownerId} AND revision=${revision})`
            : sql`NOT EXISTS (SELECT 1 FROM template_conversations WHERE id=${id})`,
          "Another turn was added. Review the updated conversation and input before sending.",
        ),
        writes(taskId: string): Write[] {
          return [
            existing
              ? db
                  .update(s.templateConversations)
                  .set({ revision: revision + 1 })
                  .where(eq(s.templateConversations.id, id))
              : db
                  .insert(s.templateConversations)
                  .values({ id, ownerId, revision: 1, createdAt: Date.now() }),
            db
              .insert(s.templateConversationTurns)
              .values({ taskId, conversationId: id, position: input.turn, instruction }),
          ];
        },
      };
    },
    async readTemplateConversation(ownerId: string, request: TemplateConversationRequest) {
      const conversation = await conversationById(ownerId, request.id);
      const design =
        (
          await db
            .select()
            .from(s.templateDesigns)
            .where(
              and(eq(s.templateDesigns.id, request.id), eq(s.templateDesigns.ownerId, ownerId)),
            )
            .limit(1)
        )[0] ?? null;
      if (!conversation && !design)
        throw new ApplicationError({
          code: "NotFound",
          message: "Template conversation not found.",
        });
      const rows = await db
        .select({
          id: s.templateAiTasks.id,
          name: s.templateAiTasks.name,
          position: s.templateConversationTurns.position,
          instruction: s.templateConversationTurns.instruction,
          base: s.templateAiTasks.base,
          scope: sql`json_extract(${s.templateAiTasks.input},'$.scope')`.mapWith((value) =>
            Schema.decodeUnknownSync(TemplateScope)(JSON.parse(String(value))),
          ),
          createdAt: s.templateAiTasks.createdAt,
          state: s.templateAiProposals.state,
          resultRevisionId: s.templateAiProposals.resultRevisionId,
          operationState: s.operations.state,
          stage: s.operations.stage,
        })
        .from(s.templateConversationTurns)
        .innerJoin(s.templateAiTasks, eq(s.templateAiTasks.id, s.templateConversationTurns.taskId))
        .innerJoin(s.operations, eq(s.operations.id, s.templateAiTasks.latestOperationId))
        .leftJoin(s.templateAiProposals, eq(s.templateAiProposals.taskId, s.templateAiTasks.id))
        .where(
          and(
            eq(s.templateConversationTurns.conversationId, request.id),
            eq(s.templateAiTasks.ownerId, ownerId),
            request.before === null
              ? undefined
              : lt(s.templateConversationTurns.position, request.before),
          ),
        )
        .orderBy(desc(s.templateConversationTurns.position))
        .limit(21);
      const defaults = await db
        .select({ taskId: s.templateConversationTurns.taskId })
        .from(s.templateConversationTurns)
        .innerJoin(s.templateAiTasks, eq(s.templateAiTasks.id, s.templateConversationTurns.taskId))
        .innerJoin(s.templateAiProposals, eq(s.templateAiProposals.taskId, s.templateAiTasks.id))
        .where(
          and(
            eq(s.templateConversationTurns.conversationId, request.id),
            eq(s.templateAiTasks.ownerId, ownerId),
            eq(s.templateAiProposals.state, "Accepted"),
            sql`json_extract(${s.templateAiTasks.input},'$.scope.level')=${request.scope.level}`,
            sql`json_extract(${s.templateAiTasks.input},'$.scope.type') IS ${request.scope.type}`,
          ),
        );
      const items = rows.slice(0, 20);
      return {
        id: request.id,
        revision: conversation?.revision ?? 0,
        design,
        items,
        nextBefore: rows.length > 20 ? (items.at(-1)?.position ?? null) : null,
        defaultTaskIds: defaults.map((item) => item.taskId),
      };
    },
  };
}
