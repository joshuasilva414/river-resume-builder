import type {
  RetryScoringRequest,
  ScoringHistoryRequest,
  StartScoringRequest,
} from "@river/contracts";
import {
  ApplicationError,
  canonicalJson,
  fingerprint,
  newId,
  type Principal,
  type ScoringProfile,
  type ScoringProviderVersion,
  scoringPreflight,
  scoringProfile,
  validateScoringResponse,
} from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  RENDERER_VERSION,
  SOURCE_RENDERER_VERSION,
} from "@river/templates";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { conditionGuard, createCommands, type Write } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";
import type { ScoringFailure, ScoringInput, ScoringResult } from "./scoring-types";

function owner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can score checkpoints.",
    });
}
const unavailableDocument = () =>
  new ApplicationError({
    code: "InvalidInput",
    message:
      "This checkpoint needs a complete, validated retained document before scoring. Review or retry compilation, then start a new score run.",
  });

export function createScoringRepository(db: Database) {
  const commands = createCommands(db);
  const get = async (ownerId: string, id: string) => {
    const row = (
      await db
        .select()
        .from(s.scoringRuns)
        .where(and(eq(s.scoringRuns.ownerId, ownerId), eq(s.scoringRuns.id, id)))
        .limit(1)
    )[0];
    if (!row) throw new ApplicationError({ code: "NotFound", message: "Scoring run not found." });
    return row;
  };
  const runtime = async (operationId: string) =>
    (
      await db
        .select({
          run: s.scoringRuns,
          operation: s.operations,
          attempt: s.scoringAttempts,
        })
        .from(s.scoringAttempts)
        .innerJoin(s.scoringRuns, eq(s.scoringRuns.id, s.scoringAttempts.runId))
        .innerJoin(s.operations, eq(s.operations.id, s.scoringAttempts.operationId))
        .where(eq(s.scoringAttempts.operationId, operationId))
        .limit(1)
    )[0] ?? null;
  const active = (row: Awaited<ReturnType<typeof runtime>>) =>
    Boolean(
      row &&
        row.run.operationId === row.operation.id &&
        !row.run.completedAt &&
        ["Pending", "Running"].includes(row.operation.state),
    );
  const activeCondition = (operationId: string) => sql`EXISTS (
    SELECT 1 FROM scoring_runs r JOIN operations o ON o.id=r.operation_id
    WHERE o.id=${operationId} AND r.completed_at IS NULL AND o.state IN ('Pending','Running'))`;
  const capacity = (ownerId: string) =>
    conditionGuard(
      db,
      sql`(
    SELECT count(*) FROM scoring_runs r JOIN operations o ON o.id=r.operation_id
    WHERE r.owner_id=${ownerId} AND o.state IN ('Pending','Running')) < 2`,
      "Two scoring runs are already active. Wait or cancel before starting another.",
    );
  /** A late provider response cannot overwrite cancellation, a retry, or completion. */
  const commitRuntime = async (operationId: string, writes: readonly Write[]) => {
    const id = newId();
    try {
      await db.batch([
        db.insert(s.mutationGuards).values({ id, passed: activeCondition(operationId) }),
        ...writes,
        db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, id)),
      ]);
      return true;
    } catch (error) {
      if (!active(await runtime(operationId))) return false;
      throw error;
    }
  };

  return {
    async startScoring(actor: Principal, input: StartScoringRequest, profile: ScoringProfile) {
      owner(actor);
      // Pin the server-selected adapter settings, never request-supplied URLs or limits.
      if (canonicalJson(profile) !== canonicalJson(scoringProfile(profile.origin)))
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Unsupported scoring adapter settings.",
        });
      return commands.commit(actor, "start-scoring", input.idempotencyKey, input, async () => {
        const row = (
          await db
            .select({ checkpoint: s.checkpoints, state: s.checkpointState })
            .from(s.checkpoints)
            .innerJoin(s.checkpointState, eq(s.checkpointState.checkpointId, s.checkpoints.id))
            .where(
              and(
                eq(s.checkpoints.id, input.checkpointId),
                eq(s.checkpoints.ownerId, actor.ownerId),
              ),
            )
            .limit(1)
        )[0];
        if (!row)
          throw new ApplicationError({ code: "NotFound", message: "Checkpoint not found." });
        const guard = conditionGuard(
          db,
          sql`EXISTS (SELECT 1 FROM checkpoint_state WHERE checkpoint_id=${input.checkpointId} AND revision=${input.revision} AND operation_id=${row.state.operationId})`,
          "The checkpoint changed. Refresh before starting scoring.",
        );
        await guard.check();
        const limit = capacity(actor.ownerId);
        await limit.check();
        const id = newId(),
          operationId = newId(),
          now = Date.now();
        return {
          result: { id, revision: 0, revisionId: operationId },
          guards: [guard, limit],
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
              checkpointId: input.checkpointId,
              snapshotId: row.checkpoint.snapshotId,
              documentOperationId: row.state.operationId,
              operationId,
              profile,
              createdAt: now,
            }),
            db
              .insert(s.scoringAttempts)
              .values({ operationId, runId: id, ordinal: 1, createdAt: now }),
            db.insert(s.dispatches).values({ operationId }),
          ],
          history: [
            {
              entityId: id,
              after: {
                checkpointId: input.checkpointId,
                snapshotId: row.checkpoint.snapshotId,
                operationId,
                profile,
              },
            },
          ],
        };
      });
    },
    async retryScoring(actor: Principal, input: RetryScoringRequest) {
      owner(actor);
      return commands.commit(actor, "retry-scoring", input.idempotencyKey, input, async () => {
        const run = await get(actor.ownerId, input.id),
          previous = await runtime(run.operationId);
        if (!previous)
          throw new ApplicationError({ code: "NotFound", message: "Scoring attempt not found." });
        const retryAt = previous.attempt.failure?.retryAt ?? 0;
        const guard = conditionGuard(
          db,
          sql`EXISTS (SELECT 1 FROM scoring_runs r JOIN operations o ON o.id=r.operation_id
          WHERE r.id=${input.id} AND r.revision=${input.revision} AND r.completed_at IS NULL AND r.attempts < 3
          AND o.state IN ('Failed','Cancelled')) AND ${Date.now()} >= ${retryAt}`,
          "This run changed, is still active, has exhausted its three attempts, or is waiting for the provider's retry time.",
        );
        await guard.check();
        const limit = capacity(actor.ownerId);
        await limit.check();
        const operationId = newId(),
          now = Date.now();
        return {
          result: { id: run.id, revision: run.revision + 1, revisionId: operationId },
          guards: [guard, limit],
          writes: [
            db.insert(s.operations).values({
              id: operationId,
              ownerId: actor.ownerId,
              input: { type: "checkpoint-score", runId: run.id },
              state: "Pending",
              stage: run.result ? "Recovering retained scoring result" : "Waiting to retry scoring",
              createdAt: now,
              updatedAt: now,
            }),
            db
              .update(s.scoringRuns)
              .set({ revision: run.revision + 1, attempts: run.attempts + 1, operationId })
              .where(eq(s.scoringRuns.id, run.id)),
            db
              .insert(s.scoringAttempts)
              .values({ operationId, runId: run.id, ordinal: run.attempts + 1, createdAt: now }),
            db.insert(s.dispatches).values({ operationId }),
          ],
          history: [
            {
              entityId: run.id,
              after: {
                operationId,
                attempt: run.attempts + 1,
                recoveringResult: Boolean(run.result),
              },
            },
          ],
        };
      });
    },
    async inspectScoring(actor: Principal, id: string) {
      owner(actor);
      const run = await get(actor.ownerId, id);
      const attempts = await db
        .select({ attempt: s.scoringAttempts, operation: s.operations })
        .from(s.scoringAttempts)
        .innerJoin(s.operations, eq(s.operations.id, s.scoringAttempts.operationId))
        .where(eq(s.scoringAttempts.runId, id))
        .orderBy(asc(s.scoringAttempts.ordinal));
      return { run, attempts };
    },
    async listScoring(actor: Principal, input: ScoringHistoryRequest) {
      owner(actor);
      const items = await db
        .select({ run: s.scoringRuns, operation: s.operations })
        .from(s.scoringRuns)
        .innerJoin(s.operations, eq(s.operations.id, s.scoringRuns.operationId))
        .where(
          and(
            eq(s.scoringRuns.ownerId, actor.ownerId),
            eq(s.scoringRuns.checkpointId, input.checkpointId),
          ),
        )
        .orderBy(desc(s.scoringRuns.createdAt), desc(s.scoringRuns.id))
        .limit(21)
        .offset(input.offset);
      return {
        items: items.slice(0, 20),
        nextOffset: items.length > 20 ? input.offset + 20 : null,
      };
    },
    getScoringRuntime: runtime,
    async scoringDocument(operationId: string) {
      const row = await runtime(operationId);
      if (!active(row) || !row) return { state: "Stopped" as const };
      if (row.run.input) return { state: "Prepared" as const };
      const document = (
        await db
          .select()
          .from(s.operations)
          .where(eq(s.operations.id, row.run.documentOperationId))
          .limit(1)
      )[0];
      if (!document || document.ownerId !== row.run.ownerId) throw unavailableDocument();
      if (["Pending", "Running"].includes(document.state)) return { state: "Waiting" as const };
      const checkpoint = (
        await db
          .select({ checkpoint: s.checkpoints, source: s.checkpointSources })
          .from(s.checkpoints)
          .leftJoin(s.checkpointSources, eq(s.checkpointSources.checkpointId, s.checkpoints.id))
          .where(eq(s.checkpoints.id, row.run.checkpointId))
          .limit(1)
      )[0];
      const artifact = document.artifacts;
      const renderer = checkpoint?.source
        ? SOURCE_RENDERER_VERSION
        : checkpoint?.checkpoint.templateGraph
          ? CUSTOM_RENDERER_VERSION
          : RENDERER_VERSION;
      if (
        document.state !== "Succeeded" ||
        !checkpoint ||
        !artifact ||
        !artifact.validationPassed ||
        artifact.expiresAt ||
        !artifact.objectDigests?.text ||
        artifact.templateIdentity !== checkpoint.checkpoint.templateIdentity ||
        artifact.rendererVersion !== renderer
      )
        throw unavailableDocument();
      return { state: "Ready" as const, artifact };
    },
    async prepareScoringInput(operationId: string, resumeText: string) {
      const row = await runtime(operationId);
      if (!active(row) || !row) return false;
      if (row.run.input) return true;
      const document = await this.scoringDocument(operationId);
      if (document.state !== "Ready") throw unavailableDocument();
      const posting = (
        await db
          .select()
          .from(s.jobSnapshots)
          .where(eq(s.jobSnapshots.id, row.run.snapshotId))
          .limit(1)
      )[0];
      if (!posting || !scoringPreflight(resumeText, posting.text).allowed)
        throw new ApplicationError({
          code: "InvalidInput",
          message:
            "The complete saved résumé or job text exceeds the scoring provider's effective limits, or is empty. Export remains available.",
        });
      const textDigest = await fingerprint(resumeText);
      if (
        textDigest !== document.artifact.objectDigests?.text ||
        !document.artifact.rendererVersion
      )
        throw unavailableDocument();
      const input: ScoringInput = {
        resumeText,
        jobDescription: posting.text,
        textKey: document.artifact.text,
        textDigest,
        snapshotDigest: posting.digest,
        documentFingerprint: document.artifact.fingerprint,
        rendererVersion: document.artifact.rendererVersion,
        submissionDigest: await fingerprint(
          canonicalJson({
            profile: row.run.profile,
            checkpointId: row.run.checkpointId,
            snapshotId: row.run.snapshotId,
            resumeText,
            jobDescription: posting.text,
          }),
        ),
      };
      return commitRuntime(operationId, [
        db
          .update(s.scoringRuns)
          .set({ input })
          .where(and(eq(s.scoringRuns.id, row.run.id), sql`${s.scoringRuns.input} IS NULL`)),
      ]);
    },
    async observeScoringProvider(operationId: string, version: ScoringProviderVersion) {
      return commitRuntime(operationId, [
        db
          .update(s.scoringAttempts)
          .set({ observation: { version, observedAt: Date.now() } })
          .where(
            and(
              eq(s.scoringAttempts.operationId, operationId),
              sql`${s.scoringAttempts.observation} IS NULL`,
            ),
          ),
      ]);
    },
    async retainScoringResult(operationId: string, raw: unknown) {
      const row = await runtime(operationId);
      if (!active(row) || !row) return false;
      if (row.run.result) return true;
      if (!row.run.input || !row.attempt.observation || !row.attempt.submittedAt)
        throw new Error("Scoring input and provider observation must be retained before results.");
      const serialized = canonicalJson(raw);
      if (new TextEncoder().encode(serialized).byteLength > row.run.profile.maxResponseBytes)
        throw new Error("Scoring result exceeds its retention limit.");
      const result: ScoringResult = {
        raw,
        response: validateScoringResponse(
          raw,
          row.run.input.resumeText,
          row.run.input.jobDescription,
        ),
        digest: await fingerprint(serialized),
        operationId,
        receivedAt: Date.now(),
      };
      return commitRuntime(operationId, [
        db
          .update(s.scoringRuns)
          .set({ result })
          .where(and(eq(s.scoringRuns.id, row.run.id), sql`${s.scoringRuns.result} IS NULL`)),
      ]);
    },
    async claimScoringSubmission(operationId: string) {
      const rows = await db
        .update(s.scoringAttempts)
        .set({ submittedAt: Date.now() })
        .where(
          and(
            eq(s.scoringAttempts.operationId, operationId),
            sql`${s.scoringAttempts.submittedAt} IS NULL`,
            sql`${s.scoringAttempts.observation} IS NOT NULL`,
            activeCondition(operationId),
            sql`EXISTS (SELECT 1 FROM scoring_runs WHERE operation_id=${operationId} AND input IS NOT NULL AND result IS NULL)`,
          ),
        )
        .returning({ id: s.scoringAttempts.operationId });
      return rows.length === 1;
    },
    async completeScoring(operationId: string) {
      const row = await runtime(operationId);
      if (!active(row) || !row) return false;
      if (!row.run.result || !row.run.input)
        throw new Error("A complete retained score is required before publication.");
      const now = Date.now();
      return commitRuntime(operationId, [
        db
          .update(s.scoringRuns)
          .set({ completedAt: now, revision: row.run.revision + 1 })
          .where(eq(s.scoringRuns.id, row.run.id)),
        db
          .update(s.operations)
          .set({
            state: "Succeeded",
            stage: "All six simulations saved",
            failure: null,
            updatedAt: now,
          })
          .where(eq(s.operations.id, operationId)),
        db.insert(s.audit).values({
          id: newId(),
          actorId: row.run.ownerId,
          command: "complete-scoring",
          entityId: row.run.id,
          after: {
            operationId,
            resultOperationId: row.run.result.operationId,
            resultDigest: row.run.result.digest,
            submissionDigest: row.run.input.submissionDigest,
          },
          createdAt: now,
        }),
      ]);
    },
    async failScoring(operationId: string, failure: ScoringFailure) {
      const row = await runtime(operationId);
      if (!active(row) || !row) return false;
      return commitRuntime(operationId, [
        db
          .update(s.scoringAttempts)
          .set({ failure })
          .where(eq(s.scoringAttempts.operationId, operationId)),
        db
          .update(s.operations)
          .set({
            state: "Failed",
            stage: "Scoring interrupted; checkpoint preserved",
            failure: failure.message,
            updatedAt: Date.now(),
          })
          .where(eq(s.operations.id, operationId)),
      ]);
    },
  };
}
