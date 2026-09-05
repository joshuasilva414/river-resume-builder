import type { InspectJobRequest, JobCommand, JobSearch } from "@river/contracts";
import {
  ApplicationError,
  canonicalJson,
  fingerprint,
  JobWorkspace,
  newId,
  type Principal,
  selectionIdentity,
} from "@river/domain";
import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { Schema } from "effect";
import { createCommands, type Guard, type Write } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";

const emptyWorkspace: JobWorkspace = { requirements: [], selections: [] };
export const jobCommandName = (input: JobCommand) => `job-${input.type}`;
export const jobWorkspaceWrites = (
  db: Database,
  actor: Principal,
  snapshotId: string,
  revisionId: string,
  data: JobWorkspace,
): Write[] => [
  db
    .insert(s.jobWorkspaceRevisions)
    .values({ id: revisionId, snapshotId, data, actorId: actor.id, createdAt: Date.now() }),
  db
    .insert(s.jobWorkspaces)
    .values({ snapshotId, currentRevisionId: revisionId })
    .onConflictDoUpdate({
      target: s.jobWorkspaces.snapshotId,
      set: { currentRevisionId: revisionId },
    }),
  ...data.selections.map((item) =>
    db.insert(s.jobEvidenceReferences).values({
      workspaceRevisionId: revisionId,
      claimId: item.claimId,
      evidenceRevisionId: item.evidenceRevisionId,
      association: item.requirementId ?? "general",
    }),
  ),
];

export function createJobRepository(db: Database) {
  const commands = createCommands(db);
  const getJob = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(s.jobs)
        .where(and(eq(s.jobs.ownerId, ownerId), eq(s.jobs.id, id)))
        .limit(1)
    )[0];
  const getSnapshot = async (jobId: string, id: string) =>
    (
      await db
        .select()
        .from(s.jobSnapshots)
        .where(and(eq(s.jobSnapshots.jobId, jobId), eq(s.jobSnapshots.id, id)))
        .limit(1)
    )[0];
  const getWorkspaceRevision = async (snapshotId: string, revisionId?: string) => {
    const pointer =
      revisionId ??
      (
        await db
          .select()
          .from(s.jobWorkspaces)
          .where(eq(s.jobWorkspaces.snapshotId, snapshotId))
          .limit(1)
      )[0]?.currentRevisionId;
    return pointer
      ? (
          await db
            .select()
            .from(s.jobWorkspaceRevisions)
            .where(
              and(
                eq(s.jobWorkspaceRevisions.snapshotId, snapshotId),
                eq(s.jobWorkspaceRevisions.id, pointer),
              ),
            )
            .limit(1)
        )[0]
      : undefined;
  };
  const observe = async (actor: Principal, id: string, revision: number) => {
    const job = await getJob(actor.ownerId, id);
    if (!job) throw new ApplicationError({ code: "NotFound", message: "Job target not found." });
    if (job.revision !== revision)
      throw new ApplicationError({
        code: "Conflict",
        message: "The job changed. Compare the saved version before trying again.",
        expectedRevision: revision,
        observedRevision: job.revision,
      });
    return job;
  };
  const guard = (actor: Principal, id: string, revision: number): Guard => ({
    condition: sql`EXISTS (SELECT 1 FROM job_targets WHERE id = ${id} AND owner_id = ${actor.ownerId} AND revision = ${revision})`,
    check: async () => {
      await observe(actor, id, revision);
    },
  });
  const postingWrites = async (
    actor: Principal,
    jobId: string,
    details: typeof s.jobs.$inferSelect.details,
    posting: Extract<JobCommand, { type: "snapshot" }>["posting"],
    snapshotId: string,
    workspaceId: string,
  ) => {
    if (!posting.text.trim())
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Paste the complete job posting.",
      });
    if (posting.url) {
      let url: URL;
      try {
        url = new URL(posting.url);
      } catch {
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Use a complete HTTP or HTTPS posting URL.",
        });
      }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Posting URLs must use HTTP or HTTPS without credentials.",
        });
    }
    return [
      db.insert(s.jobSnapshots).values({
        id: snapshotId,
        jobId,
        details,
        ...posting,
        digest: await fingerprint(canonicalJson({ details, ...posting })),
        actorId: actor.id,
        createdAt: Date.now(),
      }),
      ...jobWorkspaceWrites(db, actor, snapshotId, workspaceId, emptyWorkspace),
    ] satisfies Write[];
  };
  return {
    getJob,
    async listJobs(ownerId: string, input: JobSearch) {
      const query = input.query;
      const rows = await db
        .select()
        .from(s.jobs)
        .where(
          and(
            eq(s.jobs.ownerId, ownerId),
            input.archived ? isNotNull(s.jobs.archivedAt) : isNull(s.jobs.archivedAt),
            input.query
              ? or(
                  sql`instr(lower(json_extract(${s.jobs.details}, '$.role')), lower(${query})) > 0`,
                  sql`instr(lower(json_extract(${s.jobs.details}, '$.company')), lower(${query})) > 0`,
                  sql`instr(lower(json_extract(${s.jobs.details}, '$.location')), lower(${query})) > 0`,
                )
              : undefined,
          ),
        )
        .orderBy(desc(s.jobs.updatedAt), desc(s.jobs.id))
        .limit(51)
        .offset(input.offset);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async inspectJob(ownerId: string, input: InspectJobRequest) {
      const job = await getJob(ownerId, input.id);
      if (!job) throw new ApplicationError({ code: "NotFound", message: "Job target not found." });
      const snapshot = await getSnapshot(job.id, input.snapshotId ?? job.currentSnapshotId);
      if (!snapshot)
        throw new ApplicationError({ code: "NotFound", message: "Posting snapshot not found." });
      const workspace = await getWorkspaceRevision(snapshot.id, input.workspaceRevisionId);
      if (!workspace)
        throw new ApplicationError({
          code: "NotFound",
          message: "Requirement and selection revision not found.",
        });
      const currentWorkspace = await getWorkspaceRevision(snapshot.id);
      const snapshots = await db
        .select({
          id: s.jobSnapshots.id,
          details: s.jobSnapshots.details,
          createdAt: s.jobSnapshots.createdAt,
          url: s.jobSnapshots.url,
        })
        .from(s.jobSnapshots)
        .where(eq(s.jobSnapshots.jobId, job.id))
        .orderBy(desc(s.jobSnapshots.createdAt), desc(s.jobSnapshots.id))
        .limit(100);
      const history = await db
        .select({
          id: s.jobWorkspaceRevisions.id,
          actorId: s.jobWorkspaceRevisions.actorId,
          createdAt: s.jobWorkspaceRevisions.createdAt,
        })
        .from(s.jobWorkspaceRevisions)
        .where(eq(s.jobWorkspaceRevisions.snapshotId, snapshot.id))
        .orderBy(desc(s.jobWorkspaceRevisions.createdAt), desc(s.jobWorkspaceRevisions.id))
        .limit(100);
      // Resolve the pinned revisions in one query; later decisions on another revision cannot
      // make historical evidence appear verified. Reference rows are committed with the map.
      const entries = await db
        .select({
          reference: s.jobEvidenceReferences,
          claim: s.claims,
          evidence: s.evidenceRevisions,
          decision: s.reviewDecisions,
        })
        .from(s.jobEvidenceReferences)
        .innerJoin(s.claims, eq(s.claims.id, s.jobEvidenceReferences.claimId))
        .innerJoin(
          s.evidenceRevisions,
          eq(s.evidenceRevisions.id, s.jobEvidenceReferences.evidenceRevisionId),
        )
        .leftJoin(
          s.reviewDecisions,
          sql`${s.reviewDecisions.id} = (SELECT d.id FROM evidence_review_decisions d WHERE d.claim_id = ${s.claims.id} AND d.revision_id = ${s.evidenceRevisions.id} ORDER BY d.created_at DESC, d.id DESC LIMIT 1)`,
        )
        .where(
          and(
            eq(s.jobEvidenceReferences.workspaceRevisionId, workspace.id),
            eq(s.claims.ownerId, ownerId),
          ),
        );
      const bySelection = new Map(
        entries.map((entry) => [`${entry.claim.id}:${entry.reference.association}`, entry]),
      );
      const selected = workspace.data.selections.map((selection) => {
        const entry = bySelection.get(selectionIdentity(selection));
        if (!entry)
          throw new ApplicationError({
            code: "Internal",
            message: "A selected evidence revision is unavailable.",
          });
        const reviewState = entry.decision?.state ?? "Draft";
        return {
          ...selection,
          assertion: entry.evidence.material.assertion,
          material: entry.evidence.material,
          currentRevisionId: entry.claim.currentRevisionId,
          reviewState,
          rationale: entry.decision?.rationale ?? null,
          issues: [
            ...(reviewState === "Verified" ? [] : [reviewState]),
            ...(entry.claim.archivedAt !== null ? ["Archived"] : []),
            ...(entry.claim.currentRevisionId !== entry.evidence.id ? ["Stale"] : []),
            ...(!entry.evidence.material.citations.length ? ["Unsupported"] : []),
          ],
        };
      });
      return {
        job,
        snapshot,
        workspace,
        currentWorkspaceRevisionId: currentWorkspace?.id,
        snapshots,
        history,
        selected,
      };
    },
    async runJobCommand(actor: Principal, input: JobCommand) {
      return commands.commit(
        actor,
        jobCommandName(input),
        input.idempotencyKey,
        input,
        async () => {
          if ("details" in input && (!input.details.role.trim() || !input.details.company.trim()))
            throw new ApplicationError({
              code: "InvalidInput",
              message: "A role title and company are required.",
            });
          if (input.type === "create") {
            const id = newId(),
              snapshotId = newId(),
              revisionId = newId(),
              now = Date.now();
            const record = {
              id,
              ownerId: actor.ownerId,
              details: input.details,
              revision: 0,
              currentSnapshotId: snapshotId,
              createdAt: now,
              updatedAt: now,
            };
            return {
              result: { id, revision: 0, revisionId },
              writes: [
                db.insert(s.jobs).values(record),
                ...(await postingWrites(
                  actor,
                  id,
                  input.details,
                  input.posting,
                  snapshotId,
                  revisionId,
                )),
              ],
              history: [{ entityId: id, after: { ...record, snapshotId } }],
            };
          }
          const previous = await observe(actor, input.id, input.revision);
          const guards = [guard(actor, input.id, input.revision)];
          const revision = previous.revision + 1;
          const updated = { revision, updatedAt: Date.now() };
          if (previous.archivedAt !== null && input.type !== "archive")
            throw new ApplicationError({
              code: "Conflict",
              message: "Restore this job target before editing its work.",
            });
          if (input.type === "archive" || input.type === "details") {
            if (input.type === "archive" && !input.rationale.trim())
              throw new ApplicationError({
                code: "InvalidInput",
                message: "Explain the archive or restore decision.",
              });
            const next = {
              ...updated,
              ...(input.type === "archive"
                ? { archivedAt: input.archived ? Date.now() : null }
                : { details: input.details }),
            };
            return {
              result: { id: previous.id, revision, revisionId: previous.currentSnapshotId },
              guards,
              writes: [db.update(s.jobs).set(next).where(eq(s.jobs.id, previous.id))],
              history: [
                {
                  entityId: previous.id,
                  before: previous,
                  after: {
                    ...previous,
                    ...next,
                    ...(input.type === "archive" ? { rationale: input.rationale } : {}),
                  },
                },
              ],
            };
          }
          if (input.type === "snapshot") {
            const snapshotId = newId(),
              revisionId = newId();
            return {
              result: { id: previous.id, revision, revisionId },
              guards,
              writes: [
                db
                  .update(s.jobs)
                  .set({ ...updated, currentSnapshotId: snapshotId })
                  .where(eq(s.jobs.id, previous.id)),
                ...(await postingWrites(
                  actor,
                  previous.id,
                  previous.details,
                  input.posting,
                  snapshotId,
                  revisionId,
                )),
              ],
              history: [
                {
                  entityId: previous.id,
                  before: previous,
                  after: { ...previous, ...updated, currentSnapshotId: snapshotId },
                },
              ],
            };
          }
          if (input.snapshotId !== previous.currentSnapshotId)
            throw new ApplicationError({
              code: "Conflict",
              message:
                "The current posting changed. Earlier requirements and selections remain with their original snapshot.",
            });
          const workspace = await getWorkspaceRevision(input.snapshotId);
          const snapshot = await getSnapshot(previous.id, input.snapshotId);
          if (!workspace || !snapshot)
            throw new ApplicationError({ code: "NotFound", message: "Job workspace not found." });
          let data = workspace.data;
          if (input.type === "requirement") {
            if (!input.fields.text.trim() || !input.fields.category.trim())
              throw new ApplicationError({
                code: "InvalidInput",
                message: "Write the requirement and its category.",
              });
            if (input.requirementId && !data.requirements.some((r) => r.id === input.requirementId))
              throw new ApplicationError({ code: "NotFound", message: "Requirement not found." });
            for (const passage of input.fields.passages)
              if (
                passage.snapshotId !== snapshot.id ||
                passage.end <= passage.start ||
                snapshot.text.slice(passage.start, passage.end) !== passage.quote
              )
                throw new ApplicationError({
                  code: "InvalidInput",
                  message: "A supporting passage does not match this exact posting snapshot.",
                });
            const requirement = { id: input.requirementId ?? newId(), ...input.fields };
            data = {
              ...data,
              requirements: input.requirementId
                ? data.requirements.map((r) => (r.id === input.requirementId ? requirement : r))
                : [...data.requirements, requirement],
            };
          } else if (input.type === "remove-requirement") {
            if (!data.requirements.some((r) => r.id === input.requirementId))
              throw new ApplicationError({ code: "NotFound", message: "Requirement not found." });
            data = {
              requirements: data.requirements.filter((r) => r.id !== input.requirementId),
              selections: data.selections.filter((s) => s.requirementId !== input.requirementId),
            };
          } else {
            const selection = input.selection;
            if (
              selection.requirementId &&
              !data.requirements.some((r) => r.id === selection.requirementId)
            )
              throw new ApplicationError({
                code: "InvalidInput",
                message: "Choose a requirement from this posting's current map.",
              });
            const evidence = (
              await db
                .select({ id: s.evidenceRevisions.id })
                .from(s.evidenceRevisions)
                .innerJoin(s.claims, eq(s.claims.id, s.evidenceRevisions.claimId))
                .where(
                  and(
                    eq(s.claims.ownerId, actor.ownerId),
                    eq(s.claims.id, selection.claimId),
                    eq(s.evidenceRevisions.id, selection.evidenceRevisionId),
                  ),
                )
                .limit(1)
            )[0];
            if (!evidence)
              throw new ApplicationError({
                code: "NotFound",
                message: "Evidence revision not found.",
              });
            const selections = data.selections.filter(
              (item) => selectionIdentity(item) !== selectionIdentity(selection),
            );
            data = {
              ...data,
              selections: input.selected ? [...selections, selection] : selections,
            };
          }
          if (
            !Schema.is(JobWorkspace)(data) ||
            new TextEncoder().encode(canonicalJson(data)).byteLength > 1024 * 1024
          )
            throw new ApplicationError({
              code: "InvalidInput",
              message: "The workspace exceeds its 100-requirement, 300-selection, or 1 MiB limit.",
            });
          const revisionId = newId();
          return {
            result: { id: previous.id, revision, revisionId },
            guards,
            writes: [
              db.update(s.jobs).set(updated).where(eq(s.jobs.id, previous.id)),
              ...jobWorkspaceWrites(db, actor, snapshot.id, revisionId, data),
            ],
            history: [
              {
                entityId: previous.id,
                before: { revision: previous.revision, workspaceRevisionId: workspace.id },
                after: {
                  revision,
                  workspaceRevisionId: revisionId,
                  snapshotId: snapshot.id,
                  action: input.type,
                },
              },
            ],
          };
        },
      );
    },
  };
}
