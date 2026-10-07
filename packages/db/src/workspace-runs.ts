import { ApplicationError, newId, type Principal } from "@river/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import { conditionGuard, createCommands } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";
import { prepareScoringAllowance, releaseScoringAllowance, settleScoringAllowance } from "./usage";
import type { WorkspaceRunKind } from "./workspace-schema";

export function createWorkspaceRunRepository(db: Database) {
  const commands = createCommands(db);
  const get = async (ownerId: string, id: string) => {
    const run = (
      await db
        .select()
        .from(s.workspaceRuns)
        .where(and(eq(s.workspaceRuns.id, id), eq(s.workspaceRuns.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!run)
      throw new ApplicationError({ code: "NotFound", message: "This analysis is unavailable." });
    return run;
  };
  return {
    getWorkspaceRun: get,
    async listWorkspaceRuns(ownerId: string, targetId: string) {
      return db
        .select()
        .from(s.workspaceRuns)
        .where(and(eq(s.workspaceRuns.ownerId, ownerId), eq(s.workspaceRuns.targetId, targetId)))
        .orderBy(desc(s.workspaceRuns.createdAt))
        .limit(30);
    },
    async beginWorkspaceRun(
      actor: Principal,
      input: {
        idempotencyKey: string;
        kind: WorkspaceRunKind;
        targetId: string | null;
        input: string;
      },
    ) {
      const scoring = input.kind === "resume-score" || input.kind === "template-score";
      if (actor.kind !== "owner")
        throw new ApplicationError({
          code: "Forbidden",
          message: "Only the account owner can request content AI or scorecards.",
        });
      // Expired client requests release capacity. They never publish a late result.
      const expired = await db
        .select()
        .from(s.workspaceRuns)
        .where(
          and(
            eq(s.workspaceRuns.ownerId, actor.ownerId),
            eq(s.workspaceRuns.state, "Running"),
            sql`${s.workspaceRuns.createdAt}<${Date.now() - 240000}`,
          ),
        );
      for (const run of expired)
        await db.batch([
          db
            .update(s.workspaceRuns)
            .set({
              state: "Failed",
              error: "The request expired. Start a new request.",
              completedAt: Date.now(),
            })
            .where(and(eq(s.workspaceRuns.id, run.id), eq(s.workspaceRuns.state, "Running"))),
          db
            .update(s.operations)
            .set({ state: "Failed", stage: "Request expired", updatedAt: Date.now() })
            .where(and(eq(s.operations.id, run.operationId), eq(s.operations.state, "Running"))),
          ...Array.from({ length: run.kind === "template-score" ? 3 : 1 }, (_, index) =>
            releaseScoringAllowance(db, run.operationId, `${run.id}:${index}`),
          ),
        ]);
      return commands.commit(actor, "workspace.run", input.idempotencyKey, input, async () => {
        const id = newId(),
          operationId = newId(),
          now = Date.now();
        const allowance = prepareScoringAllowance(
          db,
          actor,
          operationId,
          scoring
            ? Array.from(
                { length: input.kind === "template-score" ? 3 : 1 },
                (_, index) => `${id}:${index}`,
              )
            : [],
        );
        return {
          result: { id, revision: 0, revisionId: operationId },
          guards: [
            conditionGuard(
              db,
              sql`(SELECT count(*) FROM workspace_runs WHERE owner_id=${actor.ownerId} AND state='Running')<2`,
              "Two analyses are already running. Wait before requesting another.",
            ),
            ...(input.kind === "template-score"
              ? [
                  conditionGuard(
                    db,
                    sql`NOT EXISTS(SELECT 1 FROM workspace_runs WHERE owner_id=${actor.ownerId} AND kind='template-score' AND state='Running')`,
                    "A template scorecard is already running.",
                  ),
                ]
              : []),
            ...allowance.guards,
          ],
          writes: [
            db.insert(s.operations).values({
              id: operationId,
              ownerId: actor.ownerId,
              state: "Running",
              stage: "Processing workspace analysis",
              input: { type: "workspace-task", runId: id },
              createdAt: now,
              updatedAt: now,
            }),
            db.insert(s.workspaceRuns).values({
              id,
              ownerId: actor.ownerId,
              operationId,
              kind: input.kind,
              targetId: input.targetId,
              input: input.input,
              state: "Running",
              createdAt: now,
            }),
            ...allowance.writes,
          ],
          history: [{ entityId: id, after: { kind: input.kind, targetId: input.targetId } }],
        };
      });
    },
    async finishWorkspaceRun(
      ownerId: string,
      id: string,
      outcome:
        | { result: string; metadata: string | null }
        | { error: string; metadata?: string | null },
    ) {
      const run = await get(ownerId, id);
      if (run.state !== "Running")
        throw new ApplicationError({
          code: "Conflict",
          message: "This request already finished or expired.",
        });
      const now = Date.now(),
        succeeded = "result" in outcome;
      const guardId = newId();
      const running = conditionGuard(
        db,
        sql`EXISTS(SELECT 1 FROM workspace_runs WHERE id=${id} AND owner_id=${ownerId} AND state='Running')`,
        "This request already finished or expired.",
      );
      await running.check();
      await db.batch([
        db.insert(s.mutationGuards).values({ id: guardId, passed: running.condition }),
        db
          .update(s.workspaceRuns)
          .set({
            state: succeeded ? "Complete" : "Failed",
            ...(succeeded ? outcome : { error: outcome.error, metadata: outcome.metadata ?? null }),
            completedAt: now,
          })
          .where(and(eq(s.workspaceRuns.id, id), eq(s.workspaceRuns.state, "Running"))),
        // Consume reservations before completing the operation: its terminal-state trigger releases any remaining slots.
        ...Array.from({ length: run.kind === "template-score" ? 3 : 1 }, (_, index) =>
          (succeeded ? settleScoringAllowance : releaseScoringAllowance)(
            db,
            run.operationId,
            `${run.id}:${index}`,
          ),
        ),
        db
          .update(s.operations)
          .set({
            state: succeeded ? "Succeeded" : "Failed",
            stage: succeeded ? "Analysis retained" : "Analysis failed",
            updatedAt: now,
          })
          .where(and(eq(s.operations.id, run.operationId), eq(s.operations.state, "Running"))),
        db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
      ]);
      return get(ownerId, id);
    },
  };
}
