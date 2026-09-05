import { ApplicationError } from "@river/domain";
import { sql } from "drizzle-orm";
import type { Guard } from "./commands";
import type { Database } from "./index";
import type * as s from "./schema";

type AiOperation = Extract<
  (typeof s.operations.$inferSelect)["input"],
  { type: `${string}-ai` | "source-refinement" }
>;
const types = {
  "job-ai": true,
  "wording-ai": true,
  "source-ai": true,
  "duplicate-ai": true,
  "template-ai": true,
  "source-refinement": true,
} satisfies Record<AiOperation["type"], true>;
/** All interactive AI profiles share one atomic Owner capacity limit. */
export function aiCapacityGuard(db: Database, ownerId: string): Guard {
  const condition = sql`(SELECT count(*) FROM operations WHERE owner_id=${ownerId} AND state IN ('Pending','Running') AND json_extract(input,'$.type') IN (SELECT value FROM json_each(${JSON.stringify(Object.keys(types))}))) < 2`;
  return {
    condition,
    check: async () => {
      if (!(await db.get<{ valid: number }>(sql`SELECT ${condition} AS valid`))?.valid)
        throw new ApplicationError({
          code: "Conflict",
          message: "Two AI tasks are already active. Wait or cancel before starting another.",
        });
    },
  };
}
