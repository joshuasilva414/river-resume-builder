import type {
  ApproveTemplateRequest,
  MixTemplateRequest,
  PreviewWorkingTemplateRequest,
  RetireTemplateRequest,
  SaveTemplateRequest,
  StartTemplateValidationRequest,
  TemplateSearch,
} from "@river/contracts";
import {
  ApplicationError,
  type Composition,
  canonicalJson,
  fingerprint,
  newId,
  type Principal,
} from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  editedGraph,
  fixedPack,
  fixtureSetPayload,
  GRAPH_VALIDATOR_VERSION,
  graphInventory,
  replaceTemplate,
  schemaSampleDocument,
  scopedTemplate,
  type TemplateBase,
  type TemplateGraph,
  type TemplateOrigin,
  type TemplateScope,
  templateFixtures,
  templateInventory,
  validateGraph,
} from "@river/templates";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { conditionGuard, createCommands, type Guard, type Write } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";
import type { TemplateFixtureResult, TemplateValidationReport } from "./template-types";

export function requireTemplateOwner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can create or review templates.",
    });
}
function invalid(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  throw new ApplicationError({
    code: "InvalidInput",
    message: error instanceof Error ? error.message : "Invalid template graph.",
  });
}
export function createTemplateRepository(db: Database) {
  const commands = createCommands(db);
  async function revisionById(ownerId: string, id: string) {
    const row = (
      await db
        .select({ design: s.templateDesigns, revision: s.templateRevisions })
        .from(s.templateRevisions)
        .innerJoin(s.templateDesigns, eq(s.templateDesigns.id, s.templateRevisions.designId))
        .where(and(eq(s.templateRevisions.id, id), eq(s.templateDesigns.ownerId, ownerId)))
        .limit(1)
    )[0];
    if (!row)
      throw new ApplicationError({ code: "NotFound", message: "Template revision not found." });
    return row;
  }
  const lifecycleGuard = (revisionId: string, revision: number, state?: string) =>
    conditionGuard(
      db,
      sql`EXISTS (SELECT 1 FROM template_revisions WHERE id=${revisionId} AND review_revision=${revision} ${state ? sql`AND state=${state}` : sql``})`,
      "The template review state changed. Reload its current record.",
    );
  const designGuard = (id: string, revision: number) =>
    conditionGuard(
      db,
      sql`EXISTS (SELECT 1 FROM template_designs WHERE id=${id} AND revision=${revision} AND archived_at IS NULL)`,
      "The template design changed. Compare the latest revision before saving.",
    );
  async function resolveBase(ownerId: string, base: TemplateBase, approved = false) {
    if (base.kind === "fixed")
      return { graph: validateGraph(fixedPack(base.theme)), guards: [] as Guard[] };
    const row = await revisionById(ownerId, base.revisionId);
    if (row.design.archivedAt !== null)
      throw new ApplicationError({
        code: "Conflict",
        message: "Restore this template from Trash before using it for new work.",
      });
    if (approved && row.revision.state !== "Approved")
      throw new ApplicationError({
        code: "Conflict",
        message: "Choose an exact Approved graph as a donor.",
      });
    return {
      graph: row.revision.graph,
      guards: [
        conditionGuard(
          db,
          sql`EXISTS (SELECT 1 FROM template_designs WHERE id=${row.design.id} AND archived_at IS NULL)`,
          "This template was deleted. Restore it before continuing.",
        ),
        lifecycleGuard(
          row.revision.id,
          row.revision.reviewRevision,
          approved ? "Approved" : undefined,
        ),
      ],
    };
  }
  async function origin(
    base: TemplateBase,
    scope: TemplateScope,
    graph: TemplateGraph,
  ): Promise<TemplateOrigin> {
    return {
      base,
      scope,
      componentIdentity: await fingerprint(canonicalJson(scopedTemplate(graph, scope))),
    };
  }
  async function revisionPlan(
    actor: Principal,
    input: { id: string | null; revision: number | null; name: string; scope: TemplateScope },
    build: (id: string, version: number) => TemplateGraph,
    origins: readonly TemplateOrigin[],
    reservedDesignId?: string,
  ) {
    if (!input.name.trim())
      throw new ApplicationError({ code: "InvalidInput", message: "Name this template design." });
    let previous: typeof s.templateDesigns.$inferSelect | undefined;
    if (input.id) {
      previous = (
        await db
          .select()
          .from(s.templateDesigns)
          .where(
            and(eq(s.templateDesigns.id, input.id), eq(s.templateDesigns.ownerId, actor.ownerId)),
          )
          .limit(1)
      )[0];
      if (!previous)
        throw new ApplicationError({ code: "NotFound", message: "Template design not found." });
      if (previous.archivedAt !== null)
        throw new ApplicationError({
          code: "Conflict",
          message: "Restore this template from Trash before editing it.",
        });
      if (
        previous.revision !== input.revision ||
        canonicalJson(previous.scope) !== canonicalJson(input.scope)
      )
        throw new ApplicationError({
          code: "Conflict",
          message: "The template design revision or component scope changed.",
        });
    } else if (input.revision !== null)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "A new design cannot have an existing revision.",
      });
    const id = previous?.id ?? reservedDesignId ?? newId(),
      revision = (previous?.revision ?? -1) + 1,
      revisionId = newId(),
      version = revision + 1;
    let graph: TemplateGraph;
    try {
      graph = validateGraph(build(id, version));
    } catch (error) {
      return invalid(error);
    }
    const digest = await fingerprint(canonicalJson(graph)),
      now = Date.now();
    const writes: Write[] = [
      previous
        ? db
            .update(s.templateDesigns)
            .set({ name: input.name, currentRevisionId: revisionId, revision, updatedAt: now })
            .where(eq(s.templateDesigns.id, id))
        : db.insert(s.templateDesigns).values({
            id,
            ownerId: actor.ownerId,
            name: input.name,
            scope: input.scope,
            revision,
            currentRevisionId: revisionId,
            createdAt: now,
            updatedAt: now,
          }),
      db.insert(s.templateRevisions).values({
        id: revisionId,
        designId: id,
        version,
        graph,
        digest,
        origins,
        createdAt: now,
        actorId: actor.id,
      }),
    ];
    return {
      result: { id, revision, revisionId },
      guards: previous
        ? [designGuard(id, previous.revision)]
        : [
            conditionGuard(
              db,
              sql`NOT EXISTS (SELECT 1 FROM template_designs WHERE id=${id})`,
              "This template identity is already in use.",
            ),
          ],
      writes,
      history: [
        {
          entityId: id,
          before: previous
            ? {
                revision: previous.revision,
                currentRevisionId: previous.currentRevisionId,
                name: previous.name,
              }
            : null,
          after: {
            revision,
            revisionId,
            version,
            digest,
            name: input.name,
            scope: input.scope,
            origins,
          },
        },
      ],
    };
  }
  return {
    async compositionTemplate(ownerId: string, data: Composition, previous?: Composition) {
      if (!data.template)
        return {
          graph: undefined,
          identity: canonicalJson(templateInventory(data.theme)),
          guards: [] as Guard[],
        };
      const { design, revision } = await revisionById(ownerId, data.template.revisionId);
      if (design.id !== data.template.designId || revision.graph.theme !== data.theme)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "The selected template identity or theme does not match its saved graph.",
        });
      const existing =
        previous?.template && canonicalJson(previous.template) === canonicalJson(data.template);
      if (revision.state !== "Approved" && !(existing && revision.state === "Retired"))
        throw new ApplicationError({
          code: "Conflict",
          message:
            "Choose an exact Approved template for a new binding. Existing retired bindings can continue to render.",
        });
      return {
        graph: revision.graph,
        identity: canonicalJson(graphInventory(revision.graph)),
        guards: existing ? [] : [lifecycleGuard(revision.id, revision.reviewRevision, "Approved")],
      };
    },
    getTemplateRevision: revisionById,
    resolveTemplateBase: resolveBase,
    templateLifecycleGuard: lifecycleGuard,
    prepareTemplateRevision: revisionPlan,
    async previewWorkingTemplate(actor: Principal, input: PreviewWorkingTemplateRequest) {
      requireTemplateOwner(actor);
      return commands.commit(
        actor,
        "preview-working-template",
        input.idempotencyKey,
        input,
        async () => {
          const graph = validateGraph(input.graph),
            id = newId(),
            now = Date.now();
          return {
            result: { id, revision: 0, revisionId: null },
            writes: [
              db.insert(s.operations).values({
                id,
                ownerId: actor.ownerId,
                input: {
                  document: schemaSampleDocument(graph),
                  theme: graph.theme,
                  templateGraph: graph,
                  templateIdentity: canonicalJson(graphInventory(graph)),
                },
                state: "Pending",
                stage: "Rendering sample content",
                createdAt: now,
                updatedAt: now,
              }),
              db.insert(s.dispatches).values({ operationId: id }),
            ],
            history: [{ entityId: id, after: { samplePreview: true } }],
          };
        },
      );
    },
    async saveTemplate(actor: Principal, input: SaveTemplateRequest) {
      requireTemplateOwner(actor);
      return commands.commit(
        actor,
        "save-template-draft",
        input.idempotencyKey,
        input,
        async () => {
          const base = await resolveBase(actor.ownerId, input.base);
          const plan = await revisionPlan(
            actor,
            input,
            (id, version) =>
              editedGraph(
                input.workingGraph ? validateGraph(input.workingGraph) : base.graph,
                input.scope,
                id,
                version,
                input.source,
                input.overrides,
              ),
            [await origin(input.base, input.scope, base.graph)],
          );
          return { ...plan, guards: [...plan.guards, ...base.guards] };
        },
      );
    },
    async mixTemplate(actor: Principal, input: MixTemplateRequest) {
      requireTemplateOwner(actor);
      return commands.commit(actor, "mix-template-graph", input.idempotencyKey, input, async () => {
        const base = await resolveBase(actor.ownerId, input.base, true),
          guards = [...base.guards],
          origins: TemplateOrigin[] = [],
          scopes = new Set<string>();
        let graph = base.graph;
        for (const pick of input.picks) {
          const scope = canonicalJson(pick.scope);
          if (scopes.has(scope))
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Choose one donor per component position.",
            });
          scopes.add(scope);
          const donor = await resolveBase(actor.ownerId, pick.donor, true);
          guards.push(...donor.guards);
          origins.push(await origin(pick.donor, pick.scope, donor.graph));
          try {
            graph = replaceTemplate(graph, pick.scope, scopedTemplate(donor.graph, pick.scope));
          } catch (error) {
            invalid(error);
          }
        }
        const scope = { level: "document", type: null } as const;
        origins.unshift(await origin(input.base, scope, base.graph));
        const plan = await revisionPlan(
          actor,
          { id: null, revision: null, name: input.name, scope },
          (id, version) =>
            editedGraph(
              graph,
              scope,
              id,
              version,
              graph.document.source,
              graph.document.manifest.overrides,
            ),
          origins,
        );
        return { ...plan, guards: [...plan.guards, ...guards] };
      });
    },
    async listTemplates(ownerId: string, input: TemplateSearch) {
      const rows = await db
        .select({
          id: s.templateDesigns.id,
          designRevision: s.templateDesigns.revision,
          archivedAt: s.templateDesigns.archivedAt,
          name: s.templateDesigns.name,
          scope: s.templateDesigns.scope,
          revisionId: s.templateRevisions.id,
          version: s.templateRevisions.version,
          state: s.templateRevisions.state,
          reviewRevision: s.templateRevisions.reviewRevision,
          digest: s.templateRevisions.digest,
          createdAt: s.templateRevisions.createdAt,
        })
        .from(s.templateRevisions)
        .innerJoin(s.templateDesigns, eq(s.templateDesigns.id, s.templateRevisions.designId))
        .where(
          and(
            eq(s.templateDesigns.ownerId, ownerId),
            input.archived
              ? isNotNull(s.templateDesigns.archivedAt)
              : isNull(s.templateDesigns.archivedAt),
            input.state ? eq(s.templateRevisions.state, input.state) : undefined,
          ),
        )
        .orderBy(desc(s.templateRevisions.createdAt), desc(s.templateRevisions.id))
        .limit(51)
        .offset(input.offset);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async inspectTemplate(ownerId: string, id: string) {
      const row = await revisionById(ownerId, id);
      const validations = await db
        .select({ validation: s.templateValidations, operation: s.operations })
        .from(s.templateValidations)
        .innerJoin(s.operations, eq(s.operations.id, s.templateValidations.operationId))
        .where(eq(s.templateValidations.revisionId, id))
        .orderBy(desc(s.templateValidations.createdAt));
      const revisions = await db
        .select({
          id: s.templateRevisions.id,
          version: s.templateRevisions.version,
          state: s.templateRevisions.state,
          createdAt: s.templateRevisions.createdAt,
        })
        .from(s.templateRevisions)
        .where(eq(s.templateRevisions.designId, row.design.id))
        .orderBy(desc(s.templateRevisions.version));
      const activity = await db
        .select()
        .from(s.audit)
        .where(eq(s.audit.entityId, id))
        .orderBy(desc(s.audit.createdAt));
      return {
        ...row,
        revisions,
        validations,
        activity: activity.map((entry) => ({
          ...entry,
          before: canonicalJson(entry.before),
          after: canonicalJson(entry.after),
        })),
      };
    },
    async startTemplateValidation(
      actor: Principal,
      input: StartTemplateValidationRequest,
      configured = true,
    ) {
      requireTemplateOwner(actor);
      return commands.commit(actor, "validate-template", input.idempotencyKey, input, async () => {
        if (!configured)
          throw new ApplicationError({
            code: "Unavailable",
            message: "Template validation is not configured.",
          });
        const { revision } = await revisionById(actor.ownerId, input.revisionId);
        if (
          revision.reviewRevision !== input.revision ||
          revision.state !== "Draft" ||
          revision.validationAttempts >= 3
        )
          throw new ApplicationError({
            code: "Conflict",
            message:
              "Validation requires this current Draft review state and an unused attempt. Edit into a new Draft revision after three attempts.",
          });
        try {
          validateGraph(revision.graph);
        } catch (error) {
          invalid(error);
        }
        const id = newId(),
          operationId = newId(),
          now = Date.now();
        return {
          result: { id, revision: 0, revisionId: operationId },
          guards: [
            lifecycleGuard(revision.id, input.revision, "Draft"),
            conditionGuard(
              db,
              sql`NOT EXISTS (SELECT 1 FROM operations WHERE owner_id=${actor.ownerId} AND state IN ('Pending','Running') AND json_extract(input,'$.type')='template-validation')`,
              "A template validation is already active. Wait for it to finish or cancel it.",
            ),
          ],
          writes: [
            db.insert(s.operations).values({
              id: operationId,
              ownerId: actor.ownerId,
              state: "Pending",
              stage: "Queued for synthetic fixture validation",
              input: { type: "template-validation", validationId: id },
              createdAt: now,
              updatedAt: now,
            }),
            db.insert(s.dispatches).values({ operationId }),
            db.insert(s.templateValidations).values({
              approveOnSuccess: input.approveOnSuccess ?? false,
              id,
              revisionId: revision.id,
              operationId,
              graphDigest: revision.digest,
              fixtureSetDigest: await fingerprint(fixtureSetPayload()),
              renderer: CUSTOM_RENDERER_VERSION,
              validator: GRAPH_VALIDATOR_VERSION,
              createdAt: now,
            }),
            db
              .update(s.templateRevisions)
              .set({
                validationId: id,
                reviewRevision: revision.reviewRevision + 1,
                validationAttempts: revision.validationAttempts + 1,
              })
              .where(eq(s.templateRevisions.id, revision.id)),
          ],
          history: [
            {
              entityId: revision.id,
              after: {
                validationId: id,
                operationId,
                attempt: revision.validationAttempts + 1,
                graphDigest: revision.digest,
              },
            },
          ],
        };
      });
    },
    async inspectTemplateValidation(ownerId: string, id: string) {
      const validation = (
        await db
          .select()
          .from(s.templateValidations)
          .where(eq(s.templateValidations.id, id))
          .limit(1)
      )[0];
      if (!validation)
        throw new ApplicationError({ code: "NotFound", message: "Template validation not found." });
      const template = await revisionById(ownerId, validation.revisionId);
      const operation = (
        await db
          .select()
          .from(s.operations)
          .where(eq(s.operations.id, validation.operationId))
          .limit(1)
      )[0];
      const fixtures = await db
        .select()
        .from(s.templateValidationFixtures)
        .where(eq(s.templateValidationFixtures.validationId, id));
      return { validation, template, operation, fixtures };
    },
    async publishTemplateFixture(ownerId: string, id: string, result: TemplateFixtureResult) {
      const validation = (
        await db
          .select()
          .from(s.templateValidations)
          .where(eq(s.templateValidations.id, id))
          .limit(1)
      )[0];
      if (!validation)
        throw new ApplicationError({ code: "NotFound", message: "Template validation not found." });
      await revisionById(ownerId, validation.revisionId);
      if (!templateFixtures.some((fixture) => fixture.id === result.id))
        throw new Error("Unknown synthetic fixture.");
      const previous = (
        await db
          .select()
          .from(s.templateValidationFixtures)
          .where(
            and(
              eq(s.templateValidationFixtures.validationId, id),
              eq(s.templateValidationFixtures.fixtureId, result.id),
            ),
          )
          .limit(1)
      )[0];
      if (previous) return previous.result;
      const operation = (
        await db
          .select()
          .from(s.operations)
          .where(eq(s.operations.id, validation.operationId))
          .limit(1)
      )[0];
      if (!operation || !["Pending", "Running"].includes(operation.state)) return null;
      const guardId = newId();
      await db.batch([
        db.insert(s.mutationGuards).values({
          id: guardId,
          passed: sql`EXISTS (SELECT 1 FROM operations WHERE id=${validation.operationId} AND state IN ('Pending','Running'))`,
        }),
        db
          .insert(s.templateValidationFixtures)
          .values({ validationId: id, fixtureId: result.id, result })
          .onConflictDoNothing(),
        db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
      ]);
      return result;
    },
    async completeTemplateValidation(ownerId: string, id: string) {
      const validation = (
        await db
          .select()
          .from(s.templateValidations)
          .where(eq(s.templateValidations.id, id))
          .limit(1)
      )[0];
      if (!validation)
        throw new ApplicationError({ code: "NotFound", message: "Template validation not found." });
      const { revision } = await revisionById(ownerId, validation.revisionId);
      if (validation.reportDigest) return validation.report;
      const rows = await db
        .select()
        .from(s.templateValidationFixtures)
        .where(eq(s.templateValidationFixtures.validationId, id));
      const fixtures = templateFixtures.map(
        (fixture) => rows.find((row) => row.fixtureId === fixture.id)?.result,
      );
      if (fixtures.some((fixture) => !fixture))
        throw new Error("The complete fixture set has not finished.");
      const complete = fixtures.filter((fixture) => fixture !== undefined);
      const resources = complete[0]?.artifacts?.resources;
      const passed =
        validation.graphDigest === revision.digest &&
        validation.fixtureSetDigest === (await fingerprint(fixtureSetPayload())) &&
        validation.renderer === CUSTOM_RENDERER_VERSION &&
        validation.validator === GRAPH_VALIDATOR_VERSION &&
        complete.every(
          (fixture) =>
            fixture.passed &&
            fixture.validation?.passed &&
            fixture.firstFingerprint &&
            fixture.firstFingerprint === fixture.secondFingerprint &&
            fixture.artifacts?.fingerprint === fixture.firstFingerprint &&
            fixture.artifacts.rendererVersion === CUSTOM_RENDERER_VERSION &&
            fixture.artifacts.templateIdentity === canonicalJson(graphInventory(revision.graph)) &&
            resources &&
            canonicalJson(fixture.artifacts.resources) === canonicalJson(resources),
        );
      const report: TemplateValidationReport = {
        passed,
        graphDigest: validation.graphDigest,
        fixtureSetDigest: validation.fixtureSetDigest,
        renderer: validation.renderer,
        validator: validation.validator,
        fixtures: complete,
      };
      const digest = await fingerprint(canonicalJson(report)),
        guardId = newId(),
        now = Date.now();
      await db.batch([
        db.insert(s.mutationGuards).values({
          id: guardId,
          passed: sql`EXISTS (SELECT 1 FROM operations WHERE id=${validation.operationId} AND state IN ('Pending','Running')) AND EXISTS (SELECT 1 FROM template_revisions WHERE id=${revision.id} AND validation_id=${id} AND review_revision=${revision.reviewRevision} AND state='Draft') AND EXISTS (SELECT 1 FROM template_validations WHERE id=${id} AND report_digest IS NULL)`,
        }),
        db
          .update(s.templateValidations)
          .set({ report, reportDigest: digest, completedAt: now })
          .where(eq(s.templateValidations.id, id)),
        db
          .update(s.templateRevisions)
          .set({
            state: passed ? (validation.approveOnSuccess ? "Approved" : "Validated") : "Draft",
            reviewRevision: revision.reviewRevision + 1,
          })
          .where(eq(s.templateRevisions.id, revision.id)),
        db
          .update(s.operations)
          .set({
            state: passed ? "Succeeded" : "Failed",
            stage: passed
              ? validation.approveOnSuccess
                ? "Template saved"
                : "Synthetic fixtures passed; visual review required"
              : "Template fixture validation failed",
            failure: passed
              ? null
              : "One or more synthetic fixtures failed. Inspect each retained report before revising the Draft.",
            updatedAt: now,
          })
          .where(eq(s.operations.id, validation.operationId)),
        db.insert(s.audit).values({
          id: newId(),
          actorId: `workflow:${validation.operationId}`,
          command: "template-validation-result",
          entityId: revision.id,
          after: { validationId: id, reportDigest: digest, passed },
          createdAt: now,
        }),
        db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, guardId)),
      ]);
      return report;
    },
    async approveTemplate(actor: Principal, input: ApproveTemplateRequest) {
      requireTemplateOwner(actor);
      return commands.commit(actor, "approve-template", input.idempotencyKey, input, async () => {
        const { revision } = await revisionById(actor.ownerId, input.revisionId);
        const validation = (
          await db
            .select()
            .from(s.templateValidations)
            .where(eq(s.templateValidations.id, input.validationId))
            .limit(1)
        )[0];
        if (
          !input.visualReview ||
          revision.state !== "Validated" ||
          revision.reviewRevision !== input.revision ||
          revision.validationId !== input.validationId ||
          !validation?.report?.passed ||
          validation.reportDigest !== input.reportDigest ||
          validation.revisionId !== revision.id ||
          validation.graphDigest !== revision.digest ||
          validation.fixtureSetDigest !== (await fingerprint(fixtureSetPayload())) ||
          validation.renderer !== CUSTOM_RENDERER_VERSION ||
          validation.validator !== GRAPH_VALIDATOR_VERSION
        )
          throw new ApplicationError({
            code: "Conflict",
            message:
              "Approval requires the exact current successful fixture report and your visual review.",
          });
        return {
          result: {
            id: revision.id,
            revision: revision.reviewRevision + 1,
            revisionId: revision.id,
          },
          guards: [
            lifecycleGuard(revision.id, input.revision, "Validated"),
            conditionGuard(
              db,
              sql`EXISTS (SELECT 1 FROM template_validations v JOIN template_revisions r ON r.validation_id=v.id WHERE v.id=${input.validationId} AND v.report_digest=${input.reportDigest} AND r.id=${revision.id})`,
              "The reviewed validation is no longer current.",
            ),
          ],
          writes: [
            db
              .update(s.templateRevisions)
              .set({ state: "Approved", reviewRevision: revision.reviewRevision + 1 })
              .where(eq(s.templateRevisions.id, revision.id)),
          ],
          history: [
            {
              entityId: revision.id,
              after: {
                state: "Approved",
                validationId: validation.id,
                reportDigest: input.reportDigest,
                graphDigest: revision.digest,
                visualReview: true,
              },
            },
          ],
        };
      });
    },
    async retireTemplate(actor: Principal, input: RetireTemplateRequest) {
      requireTemplateOwner(actor);
      return commands.commit(actor, "retire-template", input.idempotencyKey, input, async () => {
        const { revision } = await revisionById(actor.ownerId, input.revisionId);
        if (
          revision.state !== "Approved" ||
          revision.reviewRevision !== input.revision ||
          !input.rationale.trim()
        )
          throw new ApplicationError({
            code: "Conflict",
            message: "Retire an exact Approved revision with a rationale.",
          });
        return {
          result: {
            id: revision.id,
            revision: revision.reviewRevision + 1,
            revisionId: revision.id,
          },
          guards: [lifecycleGuard(revision.id, input.revision, "Approved")],
          writes: [
            db
              .update(s.templateRevisions)
              .set({ state: "Retired", reviewRevision: revision.reviewRevision + 1 })
              .where(eq(s.templateRevisions.id, revision.id)),
          ],
          history: [
            {
              entityId: revision.id,
              after: { state: "Retired", rationale: input.rationale, graphDigest: revision.digest },
            },
          ],
        };
      });
    },
  };
}
