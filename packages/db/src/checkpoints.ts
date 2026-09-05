import type {
  AcknowledgeCheckpointRequest,
  CaptureCheckpointRequest,
  CheckpointHistoryRequest,
  ExportCheckpointRequest,
  ReviewCheckpointRequest,
} from "@river/contracts";
import {
  ApplicationError,
  canonicalJson,
  compositionEvidence,
  type LibraryGraphNode,
  newId,
  type Principal,
  renderComposition,
  type ScoringProfile,
} from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  RENDERER_VERSION,
  SOURCE_RENDERER_VERSION,
} from "@river/templates";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createCheckpointReview, observeCheckpointEvidence } from "./checkpoint-review";
import { createCommands, type Guard, type Write } from "./commands";
import { createCompositionRepository } from "./composition";
import type { Database } from "./index";
import * as s from "./schema";
import { prepareScoringRun } from "./scoring-command";
import { createTemplateRepository } from "./templates";

const conflict = () => {
  throw new ApplicationError({
    code: "Conflict",
    message:
      "This checkpoint or its evidence changed. Refresh and review the current report before continuing.",
  });
};
function owner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can review or export résumé checkpoints.",
    });
}
export function createCheckpointRepository(db: Database) {
  const commands = createCommands(db),
    composition = createCompositionRepository(db);
  const get = async (ownerId: string, id: string) => {
    const row = (
      await db
        .select({
          checkpoint: s.checkpoints,
          state: s.checkpointState,
          source: s.checkpointSources,
        })
        .from(s.checkpoints)
        .innerJoin(s.checkpointState, eq(s.checkpointState.checkpointId, s.checkpoints.id))
        .leftJoin(s.checkpointSources, eq(s.checkpointSources.checkpointId, s.checkpoints.id))
        .where(and(eq(s.checkpoints.ownerId, ownerId), eq(s.checkpoints.id, id)))
        .limit(1)
    )[0];
    if (!row) throw new ApplicationError({ code: "NotFound", message: "Checkpoint not found." });
    return row;
  };
  const stateGuard = (actor: Principal, id: string, revision: number): Guard => ({
    condition: sql`EXISTS (SELECT 1 FROM checkpoint_state st JOIN resume_checkpoints c ON c.id = st.checkpoint_id WHERE c.id = ${id} AND c.owner_id = ${actor.ownerId} AND st.revision = ${revision})`,
    check: async () => {
      if ((await get(actor.ownerId, id)).state.revision !== revision) conflict();
    },
  });
  const activeGuard = (actor: Principal): Guard => ({
    condition: sql`(SELECT count(*) FROM operations WHERE owner_id = ${actor.ownerId} AND state IN ('Pending','Running')) < 2`,
    check: async () => {
      const active = await db
        .select({ id: s.operations.id })
        .from(s.operations)
        .where(
          and(
            eq(s.operations.ownerId, actor.ownerId),
            inArray(s.operations.state, ["Pending", "Running"]),
          ),
        )
        .limit(2);
      if (active.length >= 2)
        throw new ApplicationError({
          code: "Unavailable",
          message: "Two document jobs are active. Wait for a job to finish and retry.",
        });
    },
  });
  const observe = async (actor: Principal, input: ReviewCheckpointRequest) => {
    const row = await get(actor.ownerId, input.id);
    if (row.state.revision !== input.revision) conflict();
    const current = (
      await db
        .select()
        .from(s.checkpointReviews)
        .where(eq(s.checkpointReviews.id, row.state.reportId))
        .limit(1)
    )[0];
    if (!current)
      throw new ApplicationError({ code: "NotFound", message: "Review report not found." });
    const live = await observeCheckpointEvidence(db, actor.ownerId, row.checkpoint.evidence);
    const next = await createCheckpointReview(
      input.id,
      row.checkpoint.data,
      row.checkpoint.graph,
      row.checkpoint.evidence,
      live.statuses,
      row.source?.fields,
    );
    const changed = current.digest !== next.digest;
    return {
      ...row,
      current,
      next,
      changed,
      guards: [stateGuard(actor, input.id, input.revision), ...live.guards],
    };
  };
  const changedPlan = (row: Awaited<ReturnType<typeof observe>>) => ({
    result: { id: row.checkpoint.id, revision: row.state.revision + 1, revisionId: row.next.id },
    guards: row.guards,
    writes: [
      db.insert(s.checkpointReviews).values(row.next),
      db
        .update(s.checkpointState)
        .set({ revision: row.state.revision + 1, reportId: row.next.id })
        .where(eq(s.checkpointState.checkpointId, row.checkpoint.id)),
    ],
    history: [
      {
        entityId: row.checkpoint.id,
        after: { reviewChanged: true, reportId: row.next.id, digest: row.next.digest },
      },
    ],
  });
  const exported = async (id: string) =>
    (
      await db
        .select()
        .from(s.checkpointExports)
        .where(eq(s.checkpointExports.checkpointId, id))
        .limit(1)
    )[0];
  return {
    async captureCheckpoint(
      actor: Principal,
      input: CaptureCheckpointRequest,
      requestedTemplateIdentity?: string,
      score?: ScoringProfile,
    ) {
      owner(actor);
      return commands.commit(
        actor,
        score ? "capture-scored-checkpoint" : "capture-checkpoint",
        input.idempotencyKey,
        input,
        async () => {
          const draft = await composition.observeResume(actor, input.id, input.revision);
          const template = await createTemplateRepository(db).compositionTemplate(
            actor.ownerId,
            draft.data,
            draft.data,
          );
          const templateIdentity = draft.data.template
            ? template.identity
            : (requestedTemplateIdentity ?? template.identity);
          const detail = await composition.inspectResume(actor.ownerId, draft.id);
          if (detail.draft.revision !== draft.revision) conflict();
          const graph: LibraryGraphNode[] = detail.graph.map((node) => ({
            item: { id: node.item.id, currentRevisionId: node.revision.id },
            revision: { id: node.revision.id, data: node.revision.data },
          }));
          const live = await observeCheckpointEvidence(
            db,
            actor.ownerId,
            compositionEvidence(draft.data, graph),
          );
          const document = renderComposition(draft.data, graph),
            id = newId(),
            operationId = newId(),
            now = Date.now();
          const snapshot = {
            id,
            ownerId: actor.ownerId,
            draftId: draft.id,
            draftRevision: draft.revision,
            snapshotId: draft.snapshotId,
            data: draft.data,
            graph,
            evidence: live.captured,
            document,
            templateIdentity,
            templateGraph: template.graph ?? null,
            createdAt: now,
          };
          if (new TextEncoder().encode(canonicalJson(snapshot)).byteLength > 1500000)
            throw new ApplicationError({
              code: "InvalidInput",
              message:
                "The complete checkpoint exceeds 1.5 MB. Reduce the draft or its evidence links.",
            });
          const review = await createCheckpointReview(
              id,
              draft.data,
              graph,
              live.captured,
              live.statuses,
            ),
            active = activeGuard(actor);
          await active.check();
          const scoring = score
            ? await prepareScoringRun(
                db,
                actor,
                { id, snapshotId: draft.snapshotId, operationId },
                score,
              )
            : null;
          return {
            result: { id, revision: 0, revisionId: review.id },
            guards: [
              composition.resumeGuard(actor, draft.id, draft.revision),
              ...live.guards,
              active,
              ...(scoring?.guards ?? []),
            ],
            writes: [
              db.insert(s.checkpoints).values(snapshot),
              db.insert(s.checkpointReviews).values(review),
              db.insert(s.operations).values({
                id: operationId,
                ownerId: actor.ownerId,
                input: {
                  document,
                  theme: draft.data.theme,
                  checkpointId: id,
                  templateIdentity,
                  ...(template.graph ? { templateGraph: template.graph } : {}),
                },
                state: "Pending",
                stage: "Waiting for document runtime",
                createdAt: now,
                updatedAt: now,
              }),
              db.insert(s.dispatches).values({ operationId }),
              db
                .insert(s.checkpointState)
                .values({ checkpointId: id, reportId: review.id, operationId }),
              ...(scoring?.writes ?? []),
            ],
            history: [
              ...(scoring?.history ?? []),
              {
                entityId: id,
                after: {
                  draftId: draft.id,
                  revision: draft.revision,
                  reportId: review.id,
                  operationId,
                },
              },
            ],
          };
        },
      );
    },
    async inspectCheckpoint(ownerId: string, id: string) {
      const row = await get(ownerId, id);
      const [reviews, acknowledgments, operations, exports, postings] = await Promise.all([
        db
          .select()
          .from(s.checkpointReviews)
          .where(eq(s.checkpointReviews.checkpointId, id))
          .orderBy(desc(s.checkpointReviews.createdAt), desc(s.checkpointReviews.id))
          .limit(100),
        db
          .select()
          .from(s.checkpointAcknowledgments)
          .where(eq(s.checkpointAcknowledgments.reportId, row.state.reportId)),
        db.select().from(s.operations).where(eq(s.operations.id, row.state.operationId)).limit(1),
        db
          .select()
          .from(s.checkpointExports)
          .where(eq(s.checkpointExports.checkpointId, id))
          .limit(1),
        db
          .select()
          .from(s.jobSnapshots)
          .where(eq(s.jobSnapshots.id, row.checkpoint.snapshotId))
          .limit(1),
      ]);
      const current = reviews.find((review) => review.id === row.state.reportId);
      if (!current)
        throw new ApplicationError({
          code: "NotFound",
          message: "The checkpoint review is unavailable.",
        });
      return {
        ...row,
        report: current,
        previousReport: reviews.find((review) => review.id !== current.id) ?? null,
        acknowledgments,
        operation: operations[0] ?? null,
        exported: exports[0] ?? null,
        posting: postings[0] ?? null,
      };
    },
    async listCheckpoints(ownerId: string, input: CheckpointHistoryRequest) {
      if (!(await composition.getResume(ownerId, input.draftId)))
        throw new ApplicationError({ code: "NotFound", message: "Draft not found." });
      const rows = await db
        .select({
          id: s.checkpoints.id,
          createdAt: s.checkpoints.createdAt,
          draftRevision: s.checkpoints.draftRevision,
          state: s.operations.state,
          stage: s.operations.stage,
          exportedAt: s.checkpointExports.createdAt,
        })
        .from(s.checkpoints)
        .innerJoin(s.checkpointState, eq(s.checkpointState.checkpointId, s.checkpoints.id))
        .innerJoin(s.operations, eq(s.operations.id, s.checkpointState.operationId))
        .leftJoin(s.checkpointExports, eq(s.checkpointExports.checkpointId, s.checkpoints.id))
        .where(and(eq(s.checkpoints.ownerId, ownerId), eq(s.checkpoints.draftId, input.draftId)))
        .orderBy(desc(s.checkpoints.createdAt), desc(s.checkpoints.id))
        .limit(51)
        .offset(input.offset);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async reviewCheckpoint(actor: Principal, input: ReviewCheckpointRequest) {
      owner(actor);
      return commands.commit(actor, "review-checkpoint", input.idempotencyKey, input, async () => {
        const existing = await get(actor.ownerId, input.id);
        if (await exported(input.id))
          return {
            result: {
              id: input.id,
              revision: existing.state.revision,
              revisionId: existing.state.reportId,
            },
            writes: [],
            history: [],
          };
        const row = await observe(actor, input);
        if (row.changed) return changedPlan(row);
        return {
          result: { id: input.id, revision: input.revision, revisionId: row.current.id },
          guards: row.guards,
          writes: [],
          history: [],
        };
      });
    },
    async acknowledgeCheckpoint(actor: Principal, input: AcknowledgeCheckpointRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "acknowledge-checkpoint",
        input.idempotencyKey,
        input,
        async () => {
          if (await exported(input.id))
            throw new ApplicationError({
              code: "Conflict",
              message: "The original export review is already recorded.",
            });
          const row = await observe(actor, input);
          if (row.current.id !== input.reportId || row.current.digest !== input.digest) conflict();
          if (row.changed) return changedPlan(row);
          if (
            new Set(input.issueIds).size !== input.issueIds.length ||
            input.issueIds.some((id) => !row.current.issues.some((issue) => issue.id === id))
          )
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Acknowledge only issues in the exact displayed report.",
            });
          const writes: Write[] = [];
          for (let offset = 0; offset < input.issueIds.length; offset += 20)
            writes.push(
              db
                .insert(s.checkpointAcknowledgments)
                .values(
                  input.issueIds.slice(offset, offset + 20).map((issueId) => ({
                    reportId: input.reportId,
                    issueId,
                    actorId: actor.id,
                    createdAt: Date.now(),
                  })),
                )
                .onConflictDoNothing(),
            );
          writes.push(
            db
              .update(s.checkpointState)
              .set({ revision: input.revision + 1 })
              .where(eq(s.checkpointState.checkpointId, input.id)),
          );
          return {
            result: { id: input.id, revision: input.revision + 1, revisionId: input.reportId },
            guards: row.guards,
            writes,
            history: [
              {
                entityId: input.id,
                after: { reportId: input.reportId, acknowledgedIssues: input.issueIds },
              },
            ],
          };
        },
      );
    },
    async retryCheckpoint(actor: Principal, input: ReviewCheckpointRequest) {
      owner(actor);
      return commands.commit(actor, "retry-checkpoint", input.idempotencyKey, input, async () => {
        const row = await get(actor.ownerId, input.id);
        if (row.state.revision !== input.revision) conflict();
        if (row.source)
          throw new ApplicationError({
            code: "InvalidInput",
            message:
              "Accepted source checkpoints preserve their reviewed artifacts. Start a new source proposal to make a correction.",
          });
        if (await exported(input.id))
          throw new ApplicationError({
            code: "InvalidInput",
            message: "This checkpoint is already exported.",
          });
        const previous = (
          await db
            .select()
            .from(s.operations)
            .where(eq(s.operations.id, row.state.operationId))
            .limit(1)
        )[0];
        if (!previous || !["Failed", "Cancelled"].includes(previous.state))
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Wait for the current document attempt to finish.",
          });
        if (previous.artifacts?.validationPassed === false)
          throw new ApplicationError({
            code: "InvalidInput",
            message:
              "Text integrity failed. Correct the working draft and capture a new checkpoint.",
          });
        if (row.state.attempts >= 3)
          throw new ApplicationError({
            code: "Unavailable",
            message:
              "This checkpoint reached its three-attempt limit. Inspect diagnostics before capturing a corrected draft.",
          });
        const active = activeGuard(actor);
        await active.check();
        const operationId = newId(),
          now = Date.now();
        return {
          result: { id: input.id, revision: input.revision + 1, revisionId: row.state.reportId },
          guards: [stateGuard(actor, input.id, input.revision), active],
          writes: [
            db.insert(s.operations).values({
              id: operationId,
              ownerId: actor.ownerId,
              input: {
                document: row.checkpoint.document,
                theme: row.checkpoint.data.theme,
                checkpointId: input.id,
                templateIdentity: row.checkpoint.templateIdentity,
                ...(row.checkpoint.templateGraph
                  ? { templateGraph: row.checkpoint.templateGraph }
                  : {}),
              },
              state: "Pending",
              stage: "Waiting for document runtime",
              createdAt: now,
              updatedAt: now,
            }),
            db.insert(s.dispatches).values({ operationId }),
            db
              .update(s.checkpointState)
              .set({ revision: input.revision + 1, operationId, attempts: row.state.attempts + 1 })
              .where(eq(s.checkpointState.checkpointId, input.id)),
          ],
          history: [
            { entityId: input.id, after: { operationId, attempt: row.state.attempts + 1 } },
          ],
        };
      });
    },
    async exportCheckpoint(actor: Principal, input: ExportCheckpointRequest) {
      owner(actor);
      return commands.commit(actor, "export-checkpoint", input.idempotencyKey, input, async () => {
        const prior = await get(actor.ownerId, input.id);
        if (await exported(input.id))
          return {
            result: {
              id: input.id,
              revision: prior.state.revision,
              revisionId: prior.state.reportId,
            },
            writes: [],
            history: [],
          };
        const row = await observe(actor, input);
        if (row.current.id !== input.reportId || row.current.digest !== input.digest) conflict();
        if (row.changed) return changedPlan(row);
        const operation = (
          await db
            .select()
            .from(s.operations)
            .where(eq(s.operations.id, row.state.operationId))
            .limit(1)
        )[0];
        const renderer = row.source
          ? SOURCE_RENDERER_VERSION
          : row.checkpoint.templateGraph
            ? CUSTOM_RENDERER_VERSION
            : RENDERER_VERSION;
        if (
          operation?.state !== "Succeeded" ||
          !operation.artifacts ||
          operation.artifacts.validationPassed !== true ||
          operation.artifacts.rendererVersion !== renderer ||
          operation.artifacts.templateIdentity !== row.checkpoint.templateIdentity
        )
          throw new ApplicationError({
            code: "InvalidInput",
            message:
              "A complete checkpoint artifact set with passing document validation is required.",
          });
        const acknowledgments = await db
          .select()
          .from(s.checkpointAcknowledgments)
          .where(eq(s.checkpointAcknowledgments.reportId, row.current.id));
        if (
          row.current.issues.some(
            (issue) => !acknowledgments.some((ack) => ack.issueId === issue.id),
          )
        )
          throw new ApplicationError({
            code: "InvalidInput",
            message: "Save an acknowledgment for every applicable issue before export.",
          });
        return {
          result: { id: input.id, revision: input.revision + 1, revisionId: input.reportId },
          guards: [
            ...row.guards,
            {
              condition: sql`EXISTS (SELECT 1 FROM operations WHERE id = ${operation.id} AND state = 'Succeeded' AND artifacts IS NOT NULL AND json_extract(artifacts, '$.validationPassed') = 1 AND json_extract(artifacts, '$.rendererVersion') = ${renderer} AND json_extract(artifacts, '$.templateIdentity') = ${row.checkpoint.templateIdentity})`,
              check: async () => {
                conflict();
              },
            },
          ],
          writes: [
            db.insert(s.checkpointExports).values({
              checkpointId: input.id,
              reportId: input.reportId,
              operationId: operation.id,
              digest: input.digest,
              actorId: actor.id,
              createdAt: Date.now(),
            }),
            db
              .update(s.checkpointState)
              .set({ revision: input.revision + 1 })
              .where(eq(s.checkpointState.checkpointId, input.id)),
          ],
          history: [
            {
              entityId: input.id,
              after: {
                exported: true,
                operationId: operation.id,
                reportId: input.reportId,
                digest: input.digest,
              },
            },
          ],
        };
      });
    },
  };
}
