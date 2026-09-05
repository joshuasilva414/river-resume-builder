import {
  ApplicationError,
  type CommandOutcome,
  canonicalJson,
  fingerprint,
  newId,
  type Principal,
} from "@river/domain";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "./index";
import * as schema from "./schema";

export type Write = BatchItem<"sqlite">;
export interface Guard {
  readonly condition: SQL;
  readonly check: () => Promise<void>;
}
export function conditionGuard(db: Database, condition: SQL, message: string): Guard {
  return {
    condition,
    check: async () => {
      if (!(await db.get<{ valid: number }>(sql`SELECT ${condition} AS valid`))?.valid)
        throw new ApplicationError({ code: "Conflict", message });
    },
  };
}
interface CommandPlan {
  result: CommandOutcome;
  writes: readonly Write[];
  guards?: readonly Guard[];
  history: readonly { entityId: string; before?: unknown; after: unknown }[];
}
export function createCommands(db: Database) {
  const replay = async (actorId: string, command: string, key: string, payload: unknown) => {
    const digest = await fingerprint(canonicalJson(payload));
    const receipt = (
      await db
        .select()
        .from(schema.receipts)
        .where(
          and(
            eq(schema.receipts.actorId, actorId),
            eq(schema.receipts.command, command),
            eq(schema.receipts.key, key),
          ),
        )
        .limit(1)
    )[0];
    if (receipt && receipt.fingerprint !== digest)
      throw new ApplicationError({
        code: "Conflict",
        message: "This idempotency key was already used with different input.",
      });
    return receipt?.outcome ?? null;
  };
  return {
    replayCommand: replay,
    async commit(
      actor: Principal,
      command: string,
      key: string,
      payload: unknown,
      prepare: () => Promise<CommandPlan>,
    ) {
      const existing = await replay(actor.id, command, key, payload);
      if (existing) return existing;
      const digest = await fingerprint(canonicalJson(payload));
      const guardId = newId();
      const now = Date.now();
      let guards: readonly Guard[] = [];
      try {
        const plan = await prepare();
        guards = plan.guards ?? [];
        await db.batch([
          db.insert(schema.mutationGuards).values({
            id: guardId,
            passed: guards.length
              ? sql`(${sql.join(
                  guards.map((guard) => guard.condition),
                  sql` AND `,
                )})`
              : 1,
          }),
          ...plan.writes,
          ...plan.history.map((entry) =>
            db
              .insert(schema.audit)
              .values({ id: newId(), actorId: actor.id, command, ...entry, createdAt: now }),
          ),
          db.insert(schema.receipts).values({
            actorId: actor.id,
            command,
            key,
            fingerprint: digest,
            resultId: plan.result.id,
            outcome: plan.result,
            createdAt: now,
          }),
          db.delete(schema.mutationGuards).where(eq(schema.mutationGuards.id, guardId)),
        ]);
        return plan.result;
      } catch (error) {
        const result = await replay(actor.id, command, key, payload);
        if (result) return result;
        for (const guard of guards) await guard.check();
        throw error;
      }
    },
  };
}
