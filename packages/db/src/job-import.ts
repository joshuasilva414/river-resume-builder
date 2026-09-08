import type { RetryJobImportRequest, StartJobImportRequest } from "@river/contracts";
import {
  type AiProfile,
  ApplicationError,
  type JobImportAnalysis,
  newId,
  type Principal,
} from "@river/domain";
import { and, eq, sql } from "drizzle-orm";
import { aiCapacityGuard } from "./ai-capacity";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

export function createJobImportRepository(db: Database) {
  const commands = createCommands(db);
  const get = async (ownerId: string, id: string) => {
    const row = (
      await db
        .select()
        .from(s.jobImports)
        .where(and(eq(s.jobImports.id, id), eq(s.jobImports.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!row) throw new ApplicationError({ code: "NotFound", message: "Job import not found." });
    return row;
  };
  const operationWrites = (ownerId: string, id: string, importId: string) => [
    db.insert(s.operations).values({
      id,
      ownerId,
      input: { type: "job-import" as const, importId },
      state: "Pending" as const,
      stage: "Retrieving job posting",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    db.insert(s.dispatches).values({ operationId: id }),
  ];
  const owner = (actor: Principal) => {
    if (actor.kind !== "owner")
      throw new ApplicationError({
        code: "Forbidden",
        message: "Only the account owner can import jobs.",
      });
  };
  return {
    async startJobImport(
      actor: Principal,
      request: StartJobImportRequest,
      profile: AiProfile | null,
    ) {
      owner(actor);
      return commands.commit(
        actor,
        "start-job-import",
        request.idempotencyKey,
        request,
        async () => {
          if (!profile)
            throw new ApplicationError({
              code: "Unavailable",
              message:
                "Choose a connected AI model before importing a job. You can also paste and save manually.",
            });
          if (!request.input.url && !request.input.text.trim())
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Enter a public posting URL or paste its text.",
            });
          const id = newId(),
            operationId = newId();
          return {
            result: { id, revision: 0, revisionId: operationId },
            guards: [aiCapacityGuard(db, actor.ownerId)],
            writes: [
              ...operationWrites(actor.ownerId, operationId, id),
              db.insert(s.jobImports).values({
                id,
                ownerId: actor.ownerId,
                input: request.input,
                profile,
                latestOperationId: operationId,
                createdAt: Date.now(),
              }),
            ],
            history: [
              {
                entityId: id,
                after: { operationId, source: request.input.text.trim() ? "paste" : "url" },
              },
            ],
          };
        },
      );
    },
    async inspectJobImport(ownerId: string, id: string) {
      const imported = await get(ownerId, id);
      const operation = (
        await db
          .select()
          .from(s.operations)
          .where(eq(s.operations.id, imported.latestOperationId))
          .limit(1)
      )[0];
      const { ownerId: _owner, ...safe } = imported;
      return { imported: safe, operation };
    },
    async retryJobImport(actor: Principal, request: RetryJobImportRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "retry-job-import",
        request.idempotencyKey,
        request,
        async () => {
          const row = await get(actor.ownerId, request.id);
          if (row.revision !== request.revision || row.attempts >= 3 || row.savedJobId)
            throw new ApplicationError({
              code: "Conflict",
              message:
                "This import changed or exhausted its retries. Start a new import or save the retained text manually.",
            });
          const operationId = newId();
          return {
            result: { id: row.id, revision: row.revision + 1, revisionId: operationId },
            guards: [
              aiCapacityGuard(db, actor.ownerId),
              conditionGuard(
                db,
                sql`EXISTS (SELECT 1 FROM job_imports i JOIN operations o ON o.id=i.latest_operation_id WHERE i.id=${row.id} AND i.revision=${row.revision} AND i.saved_job_id IS NULL AND o.state IN ('Failed','Cancelled'))`,
                "This import can no longer be retried.",
              ),
            ],
            writes: [
              ...operationWrites(actor.ownerId, operationId, row.id),
              db
                .update(s.jobImports)
                .set({
                  latestOperationId: operationId,
                  revision: row.revision + 1,
                  attempts: row.attempts + 1,
                })
                .where(eq(s.jobImports.id, row.id)),
            ],
            history: [{ entityId: row.id, after: { operationId, attempt: row.attempts + 1 } }],
          };
        },
      );
    },
    async retainJobImportText(
      ownerId: string,
      id: string,
      operationId: string,
      capture: { text: string; url: string | null; method: "html" | "browser" | "paste" },
    ) {
      await get(ownerId, id);
      return db
        .update(s.jobImports)
        .set({ text: capture.text, retrievedUrl: capture.url, retrievalMethod: capture.method })
        .where(
          and(
            eq(s.jobImports.id, id),
            eq(s.jobImports.latestOperationId, operationId),
            sql`EXISTS (SELECT 1 FROM operations WHERE id=${operationId} AND state IN ('Pending','Running'))`,
          ),
        )
        .returning({ id: s.jobImports.id });
    },
    async publishJobImport(
      ownerId: string,
      id: string,
      operationId: string,
      analysis: JobImportAnalysis,
    ) {
      const row = await get(ownerId, id);
      if (row.latestOperationId !== operationId) return false;
      const guardId = newId();
      try {
        await db.batch([
          db.insert(s.mutationGuards).values({
            id: guardId,
            passed: sql`EXISTS (SELECT 1 FROM job_imports i JOIN operations o ON o.id=i.latest_operation_id WHERE i.id=${id} AND o.id=${operationId} AND o.state IN ('Pending','Running'))`,
          }),
          db.update(s.jobImports).set({ analysis }).where(eq(s.jobImports.id, id)),
          db
            .update(s.operations)
            .set({
              state: "Succeeded",
              stage: "Ready to review",
              failure: null,
              updatedAt: Date.now(),
            })
            .where(eq(s.operations.id, operationId)),
          db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
        ]);
      } catch (error) {
        const current = (
          await db.select().from(s.operations).where(eq(s.operations.id, operationId)).limit(1)
        )[0];
        if (current && !["Pending", "Running"].includes(current.state)) return false;
        throw error;
      }
      return true;
    },
  };
}
