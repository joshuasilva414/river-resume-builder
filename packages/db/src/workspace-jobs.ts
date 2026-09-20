import { ApplicationError } from "@river/domain";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "./index";
import { jobSnapshots, jobs } from "./schema";
export function createWorkspaceJobRepository(db: Database) {
  return {
    async listWorkspaceJobs(ownerId: string, query = "") {
      return db
        .select({ id: jobs.id, details: jobs.details })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerId, ownerId),
            isNull(jobs.archivedAt),
            query
              ? or(
                  sql`instr(lower(json_extract(${jobs.details}, '$.role')),lower(${query}))>0`,
                  sql`instr(lower(json_extract(${jobs.details}, '$.company')),lower(${query}))>0`,
                )
              : undefined,
          ),
        )
        .orderBy(desc(jobs.updatedAt))
        .limit(100);
    },
    async getWorkspaceJob(ownerId: string, id: string) {
      const row = (
        await db
          .select({
            id: jobs.id,
            details: jobs.details,
            snapshotId: jobSnapshots.id,
            description: jobSnapshots.text,
          })
          .from(jobs)
          .innerJoin(jobSnapshots, eq(jobSnapshots.id, jobs.currentSnapshotId))
          .where(and(eq(jobs.ownerId, ownerId), eq(jobs.id, id)))
          .limit(1)
      )[0];
      if (!row)
        throw new ApplicationError({ code: "NotFound", message: "Job target unavailable." });
      return row;
    },
  };
}
