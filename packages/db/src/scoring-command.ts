import {
  ApplicationError,
  canonicalJson,
  newId,
  type Principal,
  type ScoringProfile,
  scoringProfile,
} from "@river/domain";
import { sql } from "drizzle-orm";
import { conditionGuard } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";
import { prepareScoringAllowance } from "./usage";

export const scoringCapacity = (db: Database, ownerId: string) =>
  conditionGuard(
    db,
    sql`(
  SELECT count(*) FROM scoring_runs r JOIN operations o ON o.id=r.operation_id
  WHERE r.owner_id=${ownerId} AND o.state IN ('Pending','Running')) + (SELECT count(*) FROM template_scoring_runs t JOIN operations o ON o.id=t.operation_id WHERE t.owner_id=${ownerId} AND o.state IN ('Pending','Running')) < 2`,
    "Two checkpoint or template scoring runs are already active. Wait or cancel before starting another.",
  );

/** Shared transaction plan supports an existing checkpoint or one captured in the same batch. */
export async function prepareScoringRun(
  db: Database,
  actor: Principal,
  checkpoint: { id: string; snapshotId: string; operationId: string },
  profile: ScoringProfile,
) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can score checkpoints.",
    });
  if (canonicalJson(profile) !== canonicalJson(scoringProfile(profile.origin)))
    throw new ApplicationError({
      code: "InvalidInput",
      message: "Unsupported scoring adapter settings.",
    });
  const guard = scoringCapacity(db, actor.ownerId);
  await guard.check();
  const id = newId(),
    operationId = newId(),
    now = Date.now();
  const allowance = prepareScoringAllowance(db, actor, operationId, [`checkpoint:${id}`]);
  return {
    result: { id, revision: 0, revisionId: operationId },
    guards: [guard, ...allowance.guards],
    writes: [
      db.insert(s.operations).values({
        id: operationId,
        ownerId: actor.ownerId,
        input: { type: "checkpoint-score", runId: id },
        state: "Pending",
        stage: "Waiting for checkpoint document",
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(s.scoringRuns).values({
        id,
        ownerId: actor.ownerId,
        checkpointId: checkpoint.id,
        snapshotId: checkpoint.snapshotId,
        documentOperationId: checkpoint.operationId,
        operationId,
        profile,
        createdAt: now,
      }),
      db.insert(s.scoringAttempts).values({ operationId, runId: id, ordinal: 1, createdAt: now }),
      db.insert(s.dispatches).values({ operationId }),
      ...allowance.writes,
    ],
    history: [
      {
        entityId: id,
        after: {
          checkpointId: checkpoint.id,
          snapshotId: checkpoint.snapshotId,
          operationId,
          profile,
        },
      },
    ],
  };
}
