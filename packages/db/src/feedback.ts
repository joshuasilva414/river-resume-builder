import type {
  FeedbackSearch,
  SubmitFeedbackRequest,
  UpdateFeedbackRequest,
} from "@river/contracts";
import { ApplicationError, newId, type Principal, requireAdministrator } from "@river/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

function requireAccount(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({ code: "Forbidden", message: "Sign in to manage feedback." });
}

/** Feedback is deliberately shared with administrators; no other workspace records are exposed. */
export function createFeedbackRepository(db: Database) {
  const commands = createCommands(db);
  return {
    async listFeedback(actor: Principal, input: FeedbackSearch) {
      requireAccount(actor);
      if (input.inbox) requireAdministrator(actor);
      const rows = await db
        .select({
          report: s.feedback,
          reporterName: s.user.name,
          reporterEmail: s.user.email,
        })
        .from(s.feedback)
        .innerJoin(s.user, eq(s.user.id, s.feedback.ownerId))
        .where(
          and(
            input.inbox ? undefined : eq(s.feedback.ownerId, actor.ownerId),
            input.kind ? eq(s.feedback.kind, input.kind) : undefined,
            input.status ? eq(s.feedback.status, input.status) : undefined,
          ),
        )
        .orderBy(desc(s.feedback.createdAt), desc(s.feedback.id))
        .limit(21)
        .offset(input.offset);
      return {
        items: rows.slice(0, 20).map(({ report, ...reporter }) => ({
          ...report,
          ...reporter,
          createdAt: new Date(report.createdAt).toISOString(),
          updatedAt: new Date(report.updatedAt).toISOString(),
        })),
        hasMore: rows.length > 20,
      };
    },
    async submitFeedback(actor: Principal, input: SubmitFeedbackRequest) {
      requireAccount(actor);
      const title = input.title.trim(),
        description = input.description.trim();
      if (!title || !description)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Enter a title and description.",
        });
      return commands.commit(actor, "submit-feedback", input.idempotencyKey, input, async () => {
        const id = newId(),
          now = Date.now();
        return {
          result: { id, revision: 0, revisionId: null },
          writes: [
            db.insert(s.feedback).values({
              id,
              ownerId: actor.ownerId,
              kind: input.kind,
              title,
              description,
              createdAt: now,
              updatedAt: now,
            }),
          ],
          history: [{ entityId: id, after: { kind: input.kind, status: "New" } }],
        };
      });
    },
    async updateFeedback(actor: Principal, input: UpdateFeedbackRequest) {
      // Check before idempotency replay so a revoked administrator cannot recover a private result.
      requireAdministrator(actor);
      return commands.commit(actor, "update-feedback", input.idempotencyKey, input, async () => {
        const current = (
          await db.select().from(s.feedback).where(eq(s.feedback.id, input.id)).limit(1)
        )[0];
        if (!current)
          throw new ApplicationError({ code: "NotFound", message: "Feedback not found." });
        const guard = conditionGuard(
          db,
          sql`EXISTS (SELECT 1 FROM feedback WHERE id=${input.id} AND revision=${input.revision})`,
          "This report changed. Refresh the list and review the latest update before saving.",
        );
        await guard.check();
        const revision = input.revision + 1;
        return {
          result: { id: input.id, revision, revisionId: null },
          guards: [guard],
          writes: [
            db
              .update(s.feedback)
              .set({
                status: input.status,
                response: input.response.trim(),
                revision,
                updatedAt: Date.now(),
              })
              .where(and(eq(s.feedback.id, input.id), eq(s.feedback.revision, input.revision))),
          ],
          history: [
            {
              entityId: input.id,
              before: { status: current.status, revision: current.revision },
              after: { status: input.status, revision },
            },
          ],
        };
      });
    },
  };
}
