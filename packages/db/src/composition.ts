import type {
  ApplyLibraryRequest,
  BranchResumeRequest,
  CopyPlacementRequest,
  CreateResumeRequest,
  PreviewResumeRequest,
  RestoreCheckpointRequest,
  ResumeSearch,
  ReturnToStructuredRequest,
  SaveResumeRequest,
} from "@river/contracts";
import {
  ApplicationError,
  type Composition,
  canonicalJson,
  compositionEvidence,
  compositionReferences,
  copyBlock,
  copySection,
  newId,
  type Principal,
  placeBlock,
  placeSection,
  renderComposition,
  validateComposition,
} from "@river/domain";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { conditionGuard, createCommands, type Guard, type Write } from "./commands";
import type { Database } from "./index";
import { createLibraryRepository } from "./library";
import * as s from "./schema";
import { createTemplateRepository } from "./templates";

function owner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can change résumé drafts.",
    });
}
export function createCompositionRepository(db: Database) {
  const commands = createCommands(db);
  const library = createLibraryRepository(db);
  const templates = createTemplateRepository(db);
  const getResume = async (ownerId: string, id: string) =>
    (
      await db
        .select()
        .from(s.resumeDrafts)
        .where(and(eq(s.resumeDrafts.id, id), eq(s.resumeDrafts.ownerId, ownerId)))
        .limit(1)
    )[0];
  const observe = async (actor: Principal, id: string, revision: number) => {
    const draft = await getResume(actor.ownerId, id);
    if (!draft)
      throw new ApplicationError({ code: "NotFound", message: "Résumé draft not found." });
    if (draft.revision !== revision)
      throw new ApplicationError({
        code: "Conflict",
        message: "This draft changed elsewhere. Compare both versions before continuing.",
        expectedRevision: revision,
        observedRevision: draft.revision,
      });
    return draft;
  };
  const guard = (actor: Principal, id: string, revision: number): Guard => ({
    condition: sql`EXISTS (SELECT 1 FROM resume_drafts WHERE id = ${id} AND owner_id = ${actor.ownerId} AND revision = ${revision})`,
    check: async () => {
      await observe(actor, id, revision);
    },
  });
  const validate = async (actor: Principal, data: Composition) => {
    const graph = await library.libraryGraph(actor.ownerId, compositionReferences(data));
    validateComposition(data, graph);
    const refs = compositionEvidence(data, graph);
    const identities = new Map<string, string>();
    for (const ref of refs) {
      const claim = identities.get(ref.revisionId);
      if (claim && claim !== ref.claimId)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Evidence revision and claim identities must agree.",
        });
      identities.set(ref.revisionId, ref.claimId);
    }
    const unique = [...identities.entries()];
    if (unique.length > 500)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "The draft exceeds 500 distinct evidence references.",
      });
    for (let offset = 0; offset < unique.length; offset += 80) {
      const chunk = unique.slice(offset, offset + 80);
      const found = await db
        .select({ id: s.evidenceRevisions.id, claimId: s.claims.id })
        .from(s.evidenceRevisions)
        .innerJoin(s.claims, eq(s.claims.id, s.evidenceRevisions.claimId))
        .where(
          and(
            eq(s.claims.ownerId, actor.ownerId),
            inArray(
              s.evidenceRevisions.id,
              chunk.map(([id]) => id),
            ),
          ),
        );
      if (
        chunk.some(
          ([id, claimId]) => !found.some((row) => row.id === id && row.claimId === claimId),
        )
      )
        throw new ApplicationError({
          code: "NotFound",
          message: "A supporting Evidence Revision is unavailable.",
        });
    }
    return { graph, evidence: unique.map(([revisionId]) => revisionId), template: data.template };
  };
  const referenceWrites = (id: string, graph: Awaited<ReturnType<typeof validate>>): Write[] => {
    const writes: Write[] = [
      db.delete(s.resumeLibraryReferences).where(eq(s.resumeLibraryReferences.draftId, id)),
      db.delete(s.resumeTemplateReferences).where(eq(s.resumeTemplateReferences.draftId, id)),
      db.delete(s.resumeEvidenceReferences).where(eq(s.resumeEvidenceReferences.draftId, id)),
    ];
    if (graph.template)
      writes.push(
        db
          .insert(s.resumeTemplateReferences)
          .values({ draftId: id, revisionId: graph.template.revisionId }),
      );
    for (let offset = 0; offset < graph.graph.length; offset += 40)
      writes.push(
        db
          .insert(s.resumeLibraryReferences)
          .values(
            graph.graph
              .slice(offset, offset + 40)
              .map((node) => ({ draftId: id, revisionId: node.revision.id })),
          ),
      );
    for (let offset = 0; offset < graph.evidence.length; offset += 40)
      writes.push(
        db
          .insert(s.resumeEvidenceReferences)
          .values(
            graph.evidence
              .slice(offset, offset + 40)
              .map((revisionId) => ({ draftId: id, revisionId })),
          ),
      );
    return writes;
  };
  const updateWrites = async (
    actor: Principal,
    id: string,
    revision: number,
    data: Composition,
  ) => {
    const validated = await validate(actor, data);
    return [
      db
        .update(s.resumeDrafts)
        .set({ data, revision: revision + 1, updatedAt: Date.now() })
        .where(eq(s.resumeDrafts.id, id)),
      ...referenceWrites(id, validated),
    ];
  };
  const structuredReturnBase = async (ownerId: string, checkpointId: string) => {
    const source = (
      await db
        .select({ checkpoint: s.checkpoints, source: s.checkpointSources })
        .from(s.checkpoints)
        .innerJoin(s.checkpointSources, eq(s.checkpointSources.checkpointId, s.checkpoints.id))
        .where(and(eq(s.checkpoints.ownerId, ownerId), eq(s.checkpoints.id, checkpointId)))
        .limit(1)
    )[0];
    if (!source)
      throw new ApplicationError({
        code: "NotFound",
        message: "An accepted source checkpoint is required.",
      });
    const original = (
      await db
        .select({ base: s.checkpoints, jobId: s.jobSnapshots.jobId })
        .from(s.checkpoints)
        .innerJoin(s.jobSnapshots, eq(s.jobSnapshots.id, s.checkpoints.snapshotId))
        .where(
          and(
            eq(s.checkpoints.id, source.source.structuredBaseId),
            eq(s.checkpoints.ownerId, ownerId),
            sql`NOT EXISTS (SELECT 1 FROM checkpoint_source_overrides WHERE checkpoint_id=${s.checkpoints.id})`,
          ),
        )
        .limit(1)
    )[0];
    if (!original)
      throw new ApplicationError({
        code: "NotFound",
        message: "The original structured checkpoint is unavailable.",
      });
    return { ...source, ...original };
  };
  const checkpointBranchPlan = async (
    actor: Principal,
    base: typeof s.checkpoints.$inferSelect,
    jobId: string,
    fromCheckpointId: string,
    name: string,
    replacement?: RestoreCheckpointRequest["replacement"],
  ) => {
    if (!name.trim())
      throw new ApplicationError({ code: "InvalidInput", message: "Name the new branch." });
    if (replacement && !replacement.confirmed)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Review and confirm the replacement template before creating this branch.",
      });
    const data: Composition = {
      ...base.data,
      name: name.trim(),
      sections: base.data.sections.map(copySection),
      ...(replacement
        ? { theme: replacement.theme, template: replacement.template ?? undefined }
        : {}),
    };
    const template = await templates.compositionTemplate(actor.ownerId, data),
      validated = await validate(actor, data),
      id = newId(),
      now = Date.now();
    return {
      result: { id, revision: 0, revisionId: null },
      guards: template.guards,
      writes: [
        db.insert(s.resumeDrafts).values({
          id,
          ownerId: actor.ownerId,
          jobId,
          snapshotId: base.snapshotId,
          data,
          branchOf: base.draftId,
          branchRevision: base.draftRevision,
          createdAt: now,
          updatedAt: now,
        }),
        ...referenceWrites(id, validated),
        db
          .insert(s.resumeCheckpointBranches)
          .values({ draftId: id, fromCheckpointId, structuredBaseId: base.id }),
      ],
      history: [
        {
          entityId: id,
          after: {
            fromCheckpointId,
            structuredBaseId: base.id,
            templateChanged:
              canonicalJson({ theme: base.data.theme, template: base.data.template }) !==
              canonicalJson({ theme: data.theme, template: data.template }),
            data,
          },
        },
      ],
    };
  };
  const checkpointBranchSource = async (actor: Principal, checkpointId: string) => {
    owner(actor);
    const row = (
      await db
        .select({
          checkpoint: s.checkpoints,
          source: s.checkpointSources,
          jobId: s.jobSnapshots.jobId,
        })
        .from(s.checkpoints)
        .innerJoin(s.jobSnapshots, eq(s.jobSnapshots.id, s.checkpoints.snapshotId))
        .leftJoin(s.checkpointSources, eq(s.checkpointSources.checkpointId, s.checkpoints.id))
        .where(and(eq(s.checkpoints.id, checkpointId), eq(s.checkpoints.ownerId, actor.ownerId)))
        .limit(1)
    )[0];
    if (!row) throw new ApplicationError({ code: "NotFound", message: "Checkpoint not found." });
    return row;
  };
  return {
    getResume,
    observeResume: observe,
    resumeGuard: guard,
    resumeUpdateWrites: updateWrites,
    inspectStructuredReturn: structuredReturnBase,
    async inspectCheckpointBranch(actor: Principal, checkpointId: string) {
      const row = await checkpointBranchSource(actor, checkpointId);
      let templateIssue: string | null = null;
      try {
        await templates.compositionTemplate(actor.ownerId, row.checkpoint.data);
      } catch (error) {
        if (!(error instanceof ApplicationError)) throw error;
        templateIssue = error.message;
      }
      return { ...row, templateIssue, requiresRegeneration: Boolean(row.source) };
    },
    async restoreCheckpoint(actor: Principal, input: RestoreCheckpointRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "restore-checkpoint-branch",
        input.idempotencyKey,
        input,
        async () => {
          const row = await checkpointBranchSource(actor, input.checkpointId);
          if (row.source)
            throw new ApplicationError({
              code: "InvalidInput",
              message:
                "This checkpoint has accepted source changes. Use the complete structured-return review before creating its branch.",
            });
          return checkpointBranchPlan(
            actor,
            row.checkpoint,
            row.jobId,
            row.checkpoint.id,
            input.name,
            input.replacement,
          );
        },
      );
    },
    /** Recreate the original structured checkpoint as a new draft; source-only edits never enter its tree. */
    async returnToStructured(actor: Principal, input: ReturnToStructuredRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "return-to-structured",
        input.idempotencyKey,
        input,
        async () => {
          const { source, base, jobId } = await structuredReturnBase(
            actor.ownerId,
            input.checkpointId,
          );
          if (!input.regenerationConfirmed || !input.name.trim())
            throw new ApplicationError({
              code: "InvalidInput",
              message:
                "Name the new branch and confirm which source-only changes regeneration excludes.",
            });
          if (
            source.candidateDigest !== input.candidateDigest ||
            base.id !== input.structuredBaseId
          )
            throw new ApplicationError({
              code: "Conflict",
              message: "Review the exact accepted source checkpoint and original structured base.",
            });
          const plan = await checkpointBranchPlan(
            actor,
            base,
            jobId,
            input.checkpointId,
            input.name,
            input.replacement,
          );
          return {
            ...plan,
            guards: [
              ...plan.guards,
              conditionGuard(
                db,
                sql`EXISTS (SELECT 1 FROM checkpoint_source_overrides WHERE checkpoint_id=${input.checkpointId} AND structured_base_id=${base.id} AND candidate_digest=${input.candidateDigest})`,
                "The accepted source checkpoint identity changed.",
              ),
            ],
            history: plan.history.map((entry) => ({
              ...entry,
              after: {
                ...entry.after,
                candidateDigest: input.candidateDigest,
                regenerationConfirmed: true,
              },
            })),
          };
        },
      );
    },
    async listResumes(ownerId: string, input: ResumeSearch) {
      const rows = await db
        .select({
          id: s.resumeDrafts.id,
          revision: s.resumeDrafts.revision,
          data: s.resumeDrafts.data,
          snapshotId: s.resumeDrafts.snapshotId,
          updatedAt: s.resumeDrafts.updatedAt,
          branchOf: s.resumeDrafts.branchOf,
          fromCheckpointId: s.resumeCheckpointBranches.fromCheckpointId,
          branchName: sql<
            string | null
          >`(SELECT json_extract(parent.data, '$.name') FROM resume_drafts parent WHERE parent.id = ${s.resumeDrafts.branchOf})`,
          jobId: s.resumeDrafts.jobId,
          postingDetails: s.jobSnapshots.details,
          snapshotCreatedAt: s.jobSnapshots.createdAt,
        })
        .from(s.resumeDrafts)
        .innerJoin(s.jobSnapshots, eq(s.jobSnapshots.id, s.resumeDrafts.snapshotId))
        .leftJoin(
          s.resumeCheckpointBranches,
          eq(s.resumeCheckpointBranches.draftId, s.resumeDrafts.id),
        )
        .where(
          and(
            eq(s.resumeDrafts.ownerId, ownerId),
            input.jobId ? eq(s.resumeDrafts.jobId, input.jobId) : undefined,
            input.query
              ? sql`instr(lower(json_extract(${s.resumeDrafts.data}, '$.name') || ' ' || ${s.jobSnapshots.details}),lower(${input.query})) > 0`
              : undefined,
          ),
        )
        .orderBy(desc(s.resumeDrafts.updatedAt), desc(s.resumeDrafts.id))
        .limit(51)
        .offset(input.offset);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async inspectResume(ownerId: string, id: string) {
      const draft = await getResume(ownerId, id);
      if (!draft)
        throw new ApplicationError({ code: "NotFound", message: "Résumé draft not found." });
      const graph = await library.libraryGraph(ownerId, compositionReferences(draft.data));
      const snapshot = (
        await db
          .select()
          .from(s.jobSnapshots)
          .where(
            and(eq(s.jobSnapshots.id, draft.snapshotId), eq(s.jobSnapshots.jobId, draft.jobId)),
          )
          .limit(1)
      )[0];
      if (!snapshot)
        throw new ApplicationError({
          code: "NotFound",
          message: "The associated posting snapshot is unavailable.",
        });
      const operation = async (operationId: string | null) =>
        operationId
          ? ((
              await db
                .select()
                .from(s.operations)
                .where(and(eq(s.operations.id, operationId), eq(s.operations.ownerId, ownerId)))
                .limit(1)
            )[0] ?? null)
          : null;
      const template = await templates.compositionTemplate(ownerId, draft.data, draft.data);
      return {
        draft,
        templateIdentity: template.identity,
        templateGraph: template.graph ?? null,
        graph,
        snapshot,
        preview: await operation(draft.lastPreviewId),
        request: await operation(draft.previewRequestId),
      };
    },
    async createResume(actor: Principal, input: CreateResumeRequest) {
      owner(actor);
      return commands.commit(actor, "create-resume", input.idempotencyKey, input, async () => {
        const check = async () => {
          const job = (
            await db
              .select()
              .from(s.jobs)
              .where(and(eq(s.jobs.id, input.jobId), eq(s.jobs.ownerId, actor.ownerId)))
              .limit(1)
          )[0];
          if (!job)
            throw new ApplicationError({ code: "NotFound", message: "Job target not found." });
          if (
            job.revision !== input.jobRevision ||
            job.currentSnapshotId !== input.snapshotId ||
            job.archivedAt !== null
          )
            throw new ApplicationError({
              code: "Conflict",
              message: "The job or posting changed. Refresh it before creating a draft.",
            });
        };
        await check();
        const template = await templates.compositionTemplate(actor.ownerId, input.data);
        const validated = await validate(actor, input.data),
          id = newId(),
          now = Date.now();
        return {
          result: { id, revision: 0, revisionId: null },
          guards: [
            ...template.guards,
            {
              condition: sql`EXISTS (SELECT 1 FROM job_targets WHERE id = ${input.jobId} AND owner_id = ${actor.ownerId} AND revision = ${input.jobRevision} AND current_snapshot_id = ${input.snapshotId} AND archived_at IS NULL)`,
              check,
            },
          ],
          writes: [
            db.insert(s.resumeDrafts).values({
              id,
              ownerId: actor.ownerId,
              jobId: input.jobId,
              snapshotId: input.snapshotId,
              data: input.data,
              createdAt: now,
              updatedAt: now,
            }),
            ...referenceWrites(id, validated),
          ],
          history: [
            {
              entityId: id,
              after: { jobId: input.jobId, snapshotId: input.snapshotId, data: input.data },
            },
          ],
        };
      });
    },
    async saveResume(actor: Principal, input: SaveResumeRequest) {
      owner(actor);
      return commands.commit(actor, "save-resume", input.idempotencyKey, input, async () => {
        const previous = await observe(actor, input.id, input.revision);
        const template = await templates.compositionTemplate(
          actor.ownerId,
          input.data,
          previous.data,
        );
        return {
          result: { id: input.id, revision: input.revision + 1, revisionId: null },
          guards: [guard(actor, input.id, input.revision), ...template.guards],
          writes: await updateWrites(actor, input.id, input.revision, input.data),
          history: [
            {
              entityId: input.id,
              before: { revision: previous.revision, data: previous.data },
              after: { revision: input.revision + 1, data: input.data },
            },
          ],
        };
      });
    },
    async branchResume(actor: Principal, input: BranchResumeRequest) {
      owner(actor);
      return commands.commit(actor, "branch-resume", input.idempotencyKey, input, async () => {
        const source = await getResume(actor.ownerId, input.id);
        if (!source)
          throw new ApplicationError({
            code: "NotFound",
            message: "Original résumé draft not found.",
          });
        if (input.revision > source.revision)
          throw new ApplicationError({
            code: "InvalidInput",
            message: "The branch base revision has not been saved.",
          });
        const data = { ...input.data, sections: input.data.sections.map(copySection) };
        const template = await templates.compositionTemplate(actor.ownerId, data);
        const validated = await validate(actor, data),
          id = newId(),
          now = Date.now();
        return {
          result: { id, revision: 0, revisionId: null },
          guards: template.guards,
          writes: [
            db.insert(s.resumeDrafts).values({
              id,
              ownerId: actor.ownerId,
              jobId: source.jobId,
              snapshotId: source.snapshotId,
              data,
              branchOf: source.id,
              branchRevision: input.revision,
              createdAt: now,
              updatedAt: now,
            }),
            ...referenceWrites(id, validated),
          ],
          history: [
            { entityId: id, after: { branchOf: source.id, branchRevision: input.revision, data } },
          ],
        };
      });
    },
    async copyPlacement(actor: Principal, input: CopyPlacementRequest) {
      owner(actor);
      return commands.commit(actor, "copy-placement", input.idempotencyKey, input, async () => {
        const source = await observe(actor, input.sourceId, input.sourceRevision),
          destination = await observe(actor, input.destinationId, input.destinationRevision);
        const section = source.data.sections.find((section) => section.id === input.sectionId);
        if (!section)
          throw new ApplicationError({ code: "NotFound", message: "Source Section not found." });
        let data: Composition;
        if (input.blockId !== null) {
          const block = section.blocks.find((block) => block.id === input.blockId),
            target = destination.data.sections.find(
              (section) => section.id === input.destinationSectionId,
            );
          if (!block || !target)
            throw new ApplicationError({
              code: "NotFound",
              message: "Source Block or destination Section not found.",
            });
          if (block.type !== target.type || input.position > target.blocks.length)
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Choose a compatible Section and valid insertion position.",
            });
          const blocks = [...target.blocks];
          blocks.splice(input.position, 0, copyBlock(block));
          data = {
            ...destination.data,
            sections: destination.data.sections.map((section) =>
              section.id === target.id
                ? { ...target, blocks, reason: "Copied a Block into this résumé." }
                : section,
            ),
          };
        } else {
          if (
            input.destinationSectionId !== null ||
            input.position > destination.data.sections.length
          )
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Choose a valid Section insertion position.",
            });
          const sections = [...destination.data.sections];
          sections.splice(input.position, 0, copySection(section));
          data = { ...destination.data, sections };
        }
        return {
          result: { id: destination.id, revision: destination.revision + 1, revisionId: null },
          guards: [
            guard(actor, source.id, source.revision),
            guard(actor, destination.id, destination.revision),
          ],
          writes: await updateWrites(actor, destination.id, destination.revision, data),
          history: [
            {
              entityId: destination.id,
              before: { revision: destination.revision },
              after: {
                revision: destination.revision + 1,
                sourceId: source.id,
                sourceRevision: source.revision,
                data,
              },
            },
          ],
        };
      });
    },
    async applyLibraryUpdate(actor: Principal, input: ApplyLibraryRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "apply-library-update",
        input.idempotencyKey,
        input,
        async () => {
          const previous = await observe(actor, input.id, input.revision);
          const item = await library.observeLibrary(
            actor,
            input.reference.itemId,
            input.libraryRevision,
          );
          if (item.archivedAt !== null)
            throw new ApplicationError({
              code: "Conflict",
              message: "Restore this library item before applying it to a draft.",
            });
          if (item.currentRevisionId !== input.reference.revisionId)
            throw new ApplicationError({
              code: "Conflict",
              message: "Review the current library revision before applying it.",
            });
          const graph = await library.libraryGraph(actor.ownerId, [input.reference]);
          const section = previous.data.sections.find((section) => section.id === input.sectionId);
          if (!section)
            throw new ApplicationError({
              code: "NotFound",
              message: "The reviewed Section is unavailable.",
            });
          let data: Composition,
            local = false;
          if (input.contentId !== null) {
            const block = section.blocks.find((block) => block.id === input.blockId),
              content = block?.fields
                .flatMap((field) => field.contents)
                .find((content) => content.id === input.contentId);
            if (!block || !content)
              throw new ApplicationError({
                code: "NotFound",
                message: "The reviewed wording is unavailable.",
              });
            local = content.override !== null;
            data = {
              ...previous.data,
              sections: previous.data.sections.map((value) =>
                value.id !== section.id
                  ? value
                  : {
                      ...section,
                      blocks: section.blocks.map((value) =>
                        value.id !== block.id
                          ? value
                          : {
                              ...block,
                              reason: "Applied an explicitly reviewed Content Revision.",
                              fields: block.fields.map((field) => ({
                                ...field,
                                contents: field.contents.map((value) =>
                                  value.id !== content.id
                                    ? value
                                    : {
                                        id: content.id,
                                        reference: input.reference,
                                        override: null,
                                      },
                                ),
                              })),
                            },
                      ),
                    },
              ),
            };
          } else if (input.blockId !== null) {
            const block = section.blocks.find((block) => block.id === input.blockId);
            if (!block)
              throw new ApplicationError({
                code: "NotFound",
                message: "The reviewed Block is unavailable.",
              });
            local =
              block.reason !== null ||
              block.fields.some((field) =>
                field.contents.some((content) => content.override !== null),
              );
            const replacement = { ...placeBlock(input.reference, graph), id: block.id };
            data = {
              ...previous.data,
              sections: previous.data.sections.map((value) =>
                value.id !== section.id
                  ? value
                  : {
                      ...section,
                      reason: "Applied an explicitly reviewed Block Revision.",
                      blocks: section.blocks.map((value) =>
                        value.id === block.id ? replacement : value,
                      ),
                    },
              ),
            };
          } else {
            local =
              section.reason !== null ||
              section.blocks.some(
                (block) =>
                  block.reason !== null ||
                  block.fields.some((field) =>
                    field.contents.some((content) => content.override !== null),
                  ),
              );
            const replacement = { ...placeSection(input.reference, graph), id: section.id };
            data = {
              ...previous.data,
              sections: previous.data.sections.map((value) =>
                value.id === section.id ? replacement : value,
              ),
            };
          }
          if (local && !input.replaceLocal)
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Acknowledge the complete local changes this library update replaces.",
            });
          return {
            result: { id: previous.id, revision: previous.revision + 1, revisionId: null },
            guards: [
              guard(actor, previous.id, previous.revision),
              library.libraryGuard(actor, item.id, item.revision),
            ],
            writes: await updateWrites(actor, previous.id, previous.revision, data),
            history: [
              {
                entityId: previous.id,
                before: { revision: previous.revision, data: previous.data },
                after: { revision: previous.revision + 1, applied: input.reference, data },
              },
            ],
          };
        },
      );
    },
    async previewResume(
      actor: Principal,
      input: PreviewResumeRequest,
      requestedTemplateIdentity?: string,
    ) {
      owner(actor);
      return commands.commit(actor, "preview-resume", input.idempotencyKey, input, async () => {
        const draft = await observe(actor, input.id, input.revision);
        const template = await templates.compositionTemplate(actor.ownerId, draft.data, draft.data);
        const templateIdentity = draft.data.template
          ? template.identity
          : (requestedTemplateIdentity ?? template.identity);
        const previous = draft.previewRequestId
          ? (
              await db
                .select()
                .from(s.operations)
                .where(eq(s.operations.id, draft.previewRequestId))
                .limit(1)
            )[0]
          : undefined;
        if (
          previous &&
          "document" in previous.input &&
          previous.input.preview?.revision === draft.revision &&
          previous.input.templateIdentity === templateIdentity &&
          previous.state !== "Failed" &&
          previous.state !== "Cancelled" &&
          (previous.artifacts?.expiresAt ?? previous.createdAt + 7 * 24 * 60 * 60 * 1000) >
            Date.now()
        )
          return {
            result: { id: previous.id, revision: draft.revision, revisionId: null },
            writes: [],
            guards: [guard(actor, draft.id, draft.revision)],
            history: [],
          };
        const checkActive = async () => {
          const rows = await db
            .select({ id: s.operations.id })
            .from(s.operations)
            .where(
              and(
                eq(s.operations.ownerId, actor.ownerId),
                inArray(s.operations.state, ["Pending", "Running"]),
              ),
            )
            .limit(2);
          if (rows.length >= 2)
            throw new ApplicationError({
              code: "Unavailable",
              message:
                "Two document jobs are already active. Wait for one to finish and retry preview.",
            });
        };
        await checkActive();
        const validated = await validate(actor, draft.data),
          document = renderComposition(draft.data, validated.graph),
          id = newId(),
          now = Date.now();
        return {
          result: { id, revision: draft.revision, revisionId: null },
          guards: [
            guard(actor, draft.id, draft.revision),
            {
              condition: sql`(SELECT count(*) FROM operations WHERE owner_id = ${actor.ownerId} AND state IN ('Pending','Running')) < 2`,
              check: checkActive,
            },
            {
              condition: sql`(SELECT preview_request_id FROM resume_drafts WHERE id = ${draft.id}) IS ${draft.previewRequestId}`,
              check: async () => {
                throw new ApplicationError({
                  code: "Conflict",
                  message: "A preview was requested elsewhere. Refresh the draft preview state.",
                });
              },
            },
          ],
          writes: [
            db.insert(s.operations).values({
              id,
              ownerId: actor.ownerId,
              input: {
                document,
                theme: draft.data.theme,
                preview: { draftId: draft.id, revision: draft.revision },
                templateIdentity,
                ...(template.graph ? { templateGraph: template.graph } : {}),
              },
              state: "Pending",
              stage: "Waiting for document runtime",
              createdAt: now,
              updatedAt: now,
            }),
            db.insert(s.dispatches).values({ operationId: id }),
            db
              .update(s.resumeDrafts)
              .set({ previewRequestId: id })
              .where(eq(s.resumeDrafts.id, draft.id)),
          ],
          history: [
            { entityId: draft.id, after: { previewOperationId: id, revision: draft.revision } },
          ],
        };
      });
    },
    /** Late results cannot replace the last successful preview of a newer saved draft. */
    async publishResumePreview(operationId: string) {
      const operation = (
        await db.select().from(s.operations).where(eq(s.operations.id, operationId)).limit(1)
      )[0];
      if (
        operation?.state !== "Succeeded" ||
        !("document" in operation.input) ||
        !operation.input.preview
      )
        return;
      const { draftId, revision } = operation.input.preview;
      await db
        .update(s.resumeDrafts)
        .set({ lastPreviewId: operationId, lastPreviewRevision: revision })
        .where(
          and(
            eq(s.resumeDrafts.id, draftId),
            eq(s.resumeDrafts.revision, revision),
            eq(s.resumeDrafts.previewRequestId, operationId),
          ),
        );
    },
  };
}
