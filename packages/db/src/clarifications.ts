import type { AnswerClarificationRequest } from "@river/contracts";
import type { Principal } from "@river/domain";
import { ApplicationError } from "@river/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import { createCommands } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";
export function createClarificationRepository(db: Database) {
  const commands = createCommands(db);
  return {
    async listClarifications(ownerId: string, claimId: string) {
      const claim = (
        await db
          .select({ id: s.claims.id })
          .from(s.claims)
          .where(and(eq(s.claims.id, claimId), eq(s.claims.ownerId, ownerId)))
          .limit(1)
      )[0];
      if (!claim)
        throw new ApplicationError({ code: "NotFound", message: "Evidence Claim not found." });
      return db
        .select()
        .from(s.clarificationRequests)
        .where(
          and(
            eq(s.clarificationRequests.ownerId, ownerId),
            eq(s.clarificationRequests.claimId, claimId),
          ),
        )
        .orderBy(desc(s.clarificationRequests.createdAt))
        .limit(100);
    },
    async answerClarification(actor: Principal, input: AnswerClarificationRequest) {
      if (actor.kind !== "owner")
        throw new ApplicationError({
          code: "Forbidden",
          message: "Only the Owner can resolve a clarification question.",
        });
      return commands.commit(
        actor,
        "answer-clarification",
        input.idempotencyKey,
        input,
        async () => {
          const question = (
            await db
              .select()
              .from(s.clarificationRequests)
              .where(
                and(
                  eq(s.clarificationRequests.id, input.id),
                  eq(s.clarificationRequests.ownerId, actor.ownerId),
                ),
              )
              .limit(1)
          )[0];
          if (!question)
            throw new ApplicationError({
              code: "NotFound",
              message: "Clarification question not found.",
            });
          const claim = (
            await db
              .select()
              .from(s.claims)
              .where(and(eq(s.claims.id, question.claimId), eq(s.claims.ownerId, actor.ownerId)))
              .limit(1)
          )[0];
          const material = (
            await db
              .select()
              .from(s.evidenceRevisions)
              .where(
                and(
                  eq(s.evidenceRevisions.id, input.answerEvidenceRevisionId),
                  eq(s.evidenceRevisions.claimId, question.claimId),
                ),
              )
              .limit(1)
          )[0];
          const source = (
            await db
              .select()
              .from(s.sources)
              .where(
                and(eq(s.sources.id, input.answerSourceId), eq(s.sources.ownerId, actor.ownerId)),
              )
              .limit(1)
          )[0];
          if (!claim || !source || !material)
            throw new ApplicationError({
              code: "NotFound",
              message: "The answering source or Evidence Revision is unavailable.",
            });
          const condition = sql`EXISTS (SELECT 1 FROM clarification_requests q JOIN evidence_claims c ON c.id=q.claim_id WHERE q.id=${question.id} AND q.owner_id=${actor.ownerId} AND q.revision=${input.revision} AND q.answered_at IS NULL AND c.revision=${input.claimRevision} AND c.current_revision_id=${input.answerEvidenceRevisionId} AND c.archived_at IS NULL)`;
          const check = async () => {
            if (!(await db.get<{ valid: number }>(sql`SELECT ${condition} AS valid`))?.valid)
              throw new ApplicationError({
                code: "Conflict",
                message:
                  "This question or claim changed. Review its current revision before recording the answer.",
              });
          };
          await check();
          if (
            material.id === question.evidenceRevisionId ||
            !material.material.citations.some((citation) => citation.sourceId === source.id)
          )
            throw new ApplicationError({
              code: "InvalidInput",
              message:
                "First save a new Evidence Revision citing the answering source. Recording an answer does not verify the claim.",
            });
          return {
            result: { id: question.id, revision: question.revision + 1, revisionId: material.id },
            guards: [{ condition, check }],
            writes: [
              db
                .update(s.clarificationRequests)
                .set({
                  revision: question.revision + 1,
                  answerSourceId: source.id,
                  answerEvidenceRevisionId: material.id,
                  answeredAt: Date.now(),
                })
                .where(eq(s.clarificationRequests.id, question.id)),
            ],
            history: [
              {
                entityId: question.id,
                after: {
                  claimId: claim.id,
                  answerSourceId: source.id,
                  answerEvidenceRevisionId: material.id,
                },
              },
            ],
          };
        },
      );
    },
  };
}
