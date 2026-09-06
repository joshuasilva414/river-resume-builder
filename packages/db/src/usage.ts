import { ApplicationError } from "@river/domain";
import { sql } from "drizzle-orm";
import type { Database } from "./index";

const messages = {
  river_usage_owner_active:
    "Four tasks are already active in your workspace. Wait or cancel a task before starting another.",
  river_usage_global_active:
    "River is processing its current task limit. Please try again shortly.",
  river_usage_owner_daily:
    "Your workspace has reached its daily limit of 100 tasks. It resets at midnight UTC.",
  river_usage_global_daily:
    "River has reached its daily processing limit. Please try again after midnight UTC.",
} as const;

/** Translate only the database's fixed quota markers; SQL, inputs and causes stay private. */
export function usageFailure(error: unknown): ApplicationError | null {
  let cause = error;
  for (let depth = 0; cause instanceof Error && depth < 8; depth++) {
    for (const [marker, message] of Object.entries(messages))
      if (cause.message.includes(marker))
        return new ApplicationError({ code: "RateLimited", message });
    cause = cause.cause;
  }
  return null;
}

export function createUsageRepository(db: Database) {
  return {
    async readUsage(ownerId: string) {
      const counts = await db.get<{ active: number; today: number }>(sql`
        SELECT
          COALESCE(SUM(state IN ('Pending', 'Running')), 0) AS active,
          COALESCE(SUM(created_at >= unixepoch('now', 'start of day') * 1000), 0) AS today
        FROM operations WHERE owner_id = ${ownerId}
          AND COALESCE(json_extract(input, '$.type'), '') <> 'database-backup'`);
      const reset = new Date();
      reset.setUTCHours(24, 0, 0, 0);
      return {
        active: counts?.active ?? 0,
        today: counts?.today ?? 0,
        activeLimit: 4,
        dailyLimit: 100,
        resetsAt: reset.toISOString(),
      };
    },
  };
}
