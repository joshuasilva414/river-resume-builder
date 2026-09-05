import type {
  RetryTemplateScoringRequest,
  StartTemplateScoringRequest,
  TemplateScoringHistoryRequest,
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
  captureAtsFixtureSet,
  fixedPack,
  graphInventory,
  qualifyAtsTemplate,
  type TemplateBase,
  validateGraph,
  validateText,
} from "@river/templates";
import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { conditionGuard, createCommands, type Write } from "./commands";
import type { Database } from "./index";
import * as s from "./schema";
import { scoringCapacity } from "./scoring-command";
import type { ScoringFailure } from "./scoring-types";
import type { TemplateScoringDocument } from "./template-scoring-types";

function owner(actor: Principal) {
  if (actor.kind !== "owner")
    throw new ApplicationError({
      code: "Forbidden",
      message: "Only the Owner can score synthetic template fixtures.",
    });
}
const stoppedFailure: ScoringFailure = {
  code: "Interrupted",
  message:
    "Some fixtures did not finish. Retained documents and responses are preserved; retry unfinished work if attempts remain.",
  retryAt: null,
};

export function createTemplateScoringRepository(db: Database) {
  const commands = createCommands(db);
  const get = async (actor: Principal, id: string) => {
    owner(actor);
    const row = (
      await db
        .select()
        .from(s.templateScoringRuns)
        .where(
          and(eq(s.templateScoringRuns.id, id), eq(s.templateScoringRuns.ownerId, actor.ownerId)),
        )
        .limit(1)
    )[0];
    if (!row)
      throw new ApplicationError({ code: "NotFound", message: "Template scoring run not found." });
    return row;
  };
  const graphFor = async (actor: Principal, base: TemplateBase) => {
    owner(actor);
    if (base.kind === "fixed") return { graph: validateGraph(fixedPack(base.theme)), saved: null };
    const row = (
      await db
        .select({ revision: s.templateRevisions })
        .from(s.templateRevisions)
        .innerJoin(s.templateDesigns, eq(s.templateDesigns.id, s.templateRevisions.designId))
        .where(
          and(
            eq(s.templateRevisions.id, base.revisionId),
            eq(s.templateDesigns.ownerId, actor.ownerId),
          ),
        )
        .limit(1)
    )[0];
    if (!row)
      throw new ApplicationError({ code: "NotFound", message: "Template revision not found." });
    return { graph: row.revision.graph, saved: row.revision };
  };
  const runtime = async (operationId: string) => {
    const row = (
      await db
        .select({
          run: s.templateScoringRuns,
          attempt: s.templateScoringAttempts,
          operation: s.operations,
        })
        .from(s.templateScoringAttempts)
        .innerJoin(
          s.templateScoringRuns,
          eq(s.templateScoringRuns.id, s.templateScoringAttempts.runId),
        )
        .innerJoin(s.operations, eq(s.operations.id, s.templateScoringAttempts.operationId))
        .where(eq(s.templateScoringAttempts.operationId, operationId))
        .limit(1)
    )[0];
    if (!row) return null;
    const fixtures = await db
      .select()
      .from(s.templateScoringFixtures)
      .where(eq(s.templateScoringFixtures.runId, row.run.id));
    const fixtureAttempts = await db
      .select()
      .from(s.templateScoringFixtureAttempts)
      .where(eq(s.templateScoringFixtureAttempts.operationId, operationId));
    return { ...row, fixtures, fixtureAttempts };
  };
  const active = (operationId: string) =>
    sql`EXISTS (SELECT 1 FROM template_scoring_runs r JOIN operations o ON o.id=r.operation_id WHERE o.id=${operationId} AND r.completed_at IS NULL AND o.state IN ('Pending','Running'))`;
  const commitRuntime = async (
    operationId: string,
    writes: readonly Write[],
    extra: SQL = sql`1`,
  ) => {
    const id = newId(),
      condition = sql`(${active(operationId)}) AND (${extra})`;
    try {
      await db.batch([
        db.insert(s.mutationGuards).values({ id, passed: condition }),
        ...writes,
        db.delete(s.mutationGuards).where(eq(s.mutationGuards.id, id)),
      ]);
      return true;
    } catch (error) {
      if (!(await db.get<{ valid: number }>(sql`SELECT ${condition} AS valid`))?.valid)
        return false;
      throw error;
    }
  };
  const capacity = (ownerId: string) => [
    scoringCapacity(db, ownerId),
    conditionGuard(
      db,
      sql`NOT EXISTS (SELECT 1 FROM template_scoring_runs r JOIN operations o ON o.id=r.operation_id WHERE r.owner_id=${ownerId} AND o.state IN ('Pending','Running'))`,
      "A template scoring run is already active. Wait or cancel before starting another.",
    ),
  ];
  const attemptWrites = (
    runId: string,
    operationId: string,
    ownerId: string,
    ordinal: number,
    fixtureIds: readonly string[],
  ) => {
    const now = Date.now();
    return [
      db.insert(s.operations).values({
        id: operationId,
        ownerId,
        input: { type: "template-score", runId },
        state: "Pending",
        stage: "Waiting to score canonical synthetic fixtures",
        createdAt: now,
        updatedAt: now,
      }),
      // The run insert precedes this statement on initial creation.
      db.insert(s.templateScoringAttempts).values({ operationId, runId, ordinal, createdAt: now }),
      ...fixtureIds.map((fixtureId) =>
        db.insert(s.templateScoringFixtureAttempts).values({ operationId, fixtureId }),
      ),
      db.insert(s.dispatches).values({ operationId }),
    ];
  };
  return {
    getTemplateScoringRuntime: runtime,
    async startTemplateScoring(
      actor: Principal,
      input: StartTemplateScoringRequest,
      profile: ScoringProfile,
    ) {
      owner(actor);
      return commands.commit(
        actor,
        "start-template-scoring",
        input.idempotencyKey,
        input,
        async () => {
          if (canonicalJson(profile) !== canonicalJson(scoringProfile(profile.origin)))
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Unsupported scoring adapter settings.",
            });
          const { graph, saved } = await graphFor(actor, input.base),
            guards = capacity(actor.ownerId);
          if (saved)
            guards.push(
              conditionGuard(
                db,
                sql`EXISTS (SELECT 1 FROM template_revisions WHERE id=${saved.id} AND review_revision=${input.reviewRevision} AND state IN ('Validated','Approved'))`,
                "Validate this exact template revision before scoring it, then reload its review state.",
              ),
            );
          else if (input.reviewRevision !== null)
            throw new ApplicationError({
              code: "InvalidInput",
              message: "Fixed packs do not have a mutable review revision.",
            });
          for (const guard of guards) await guard.check();
          const id = newId(),
            operationId = newId(),
            fixtureSet = await captureAtsFixtureSet(),
            graphDigest = await fingerprint(canonicalJson(graph)),
            now = Date.now();
          const [operationWrite, ...rest] = attemptWrites(
            id,
            operationId,
            actor.ownerId,
            1,
            fixtureSet.fixtures.map((f) => f.id),
          );
          if (!operationWrite) throw new Error("Missing operation write");
          return {
            result: { id, revision: 0, revisionId: operationId },
            guards,
            writes: [
              operationWrite,
              db.insert(s.templateScoringRuns).values({
                id,
                ownerId: actor.ownerId,
                base: input.base,
                graph,
                graphDigest,
                fixtureSet,
                profile,
                operationId,
                createdAt: now,
              }),
              ...fixtureSet.fixtures.map((fixture) =>
                db.insert(s.templateScoringFixtures).values({ runId: id, fixtureId: fixture.id }),
              ),
              ...rest,
            ],
            history: [
              {
                entityId: id,
                after: {
                  base: input.base,
                  graphDigest,
                  fixtureSetDigest: fixtureSet.digest,
                  operationId,
                  profile,
                },
              },
            ],
          };
        },
      );
    },
    async retryTemplateScoring(actor: Principal, input: RetryTemplateScoringRequest) {
      owner(actor);
      return commands.commit(
        actor,
        "retry-template-scoring",
        input.idempotencyKey,
        input,
        async () => {
          const run = await get(actor, input.id),
            previous = await runtime(run.operationId);
          if (!previous) throw new Error("Template scoring attempt is missing");
          const retryAt = Math.max(
              0,
              ...previous.fixtureAttempts.map((f) => f.failure?.retryAt ?? 0),
            ),
            guard = conditionGuard(
              db,
              sql`EXISTS (SELECT 1 FROM template_scoring_runs r JOIN operations o ON o.id=r.operation_id WHERE r.id=${run.id} AND r.revision=${input.revision} AND r.completed_at IS NULL AND r.attempts<3 AND o.state IN ('Failed','Cancelled')) AND ${Date.now()}>=${retryAt}`,
              "This run changed, is active, exhausted its three attempts, or is waiting for the provider's retry time.",
            );
          const guards = [guard, ...capacity(actor.ownerId)];
          for (const item of guards) await item.check();
          const operationId = newId(),
            revision = run.revision + 1;
          return {
            result: { id: run.id, revision, revisionId: operationId },
            guards,
            writes: [
              ...attemptWrites(
                run.id,
                operationId,
                actor.ownerId,
                run.attempts + 1,
                run.fixtureSet.fixtures.map((f) => f.id),
              ),
              db
                .update(s.templateScoringRuns)
                .set({ revision, operationId, attempts: run.attempts + 1 })
                .where(eq(s.templateScoringRuns.id, run.id)),
            ],
            history: [
              {
                entityId: run.id,
                before: { operationId: run.operationId },
                after: { operationId, revision, attempt: run.attempts + 1 },
              },
            ],
          };
        },
      );
    },
    async inspectTemplateScoring(actor: Principal, id: string) {
      const run = await get(actor, id),
        current = await runtime(run.operationId);
      if (!current) throw new Error("Template scoring attempt is missing");
      const attempts = await db
        .select({ attempt: s.templateScoringAttempts, operation: s.operations })
        .from(s.templateScoringAttempts)
        .innerJoin(s.operations, eq(s.operations.id, s.templateScoringAttempts.operationId))
        .where(eq(s.templateScoringAttempts.runId, id))
        .orderBy(asc(s.templateScoringAttempts.ordinal));
      const history = await db
        .select({ attempt: s.templateScoringFixtureAttempts })
        .from(s.templateScoringFixtureAttempts)
        .innerJoin(
          s.templateScoringAttempts,
          eq(s.templateScoringAttempts.operationId, s.templateScoringFixtureAttempts.operationId),
        )
        .where(eq(s.templateScoringAttempts.runId, id));
      return { ...current, attempts, fixtureHistory: history.map((row) => row.attempt) };
    },
    async listTemplateScoring(actor: Principal, input: TemplateScoringHistoryRequest) {
      const { graph } = await graphFor(actor, input.base),
        digest = await fingerprint(canonicalJson(graph));
      const rows = await db
        .select({
          id: s.templateScoringRuns.id,
          createdAt: s.templateScoringRuns.createdAt,
          attempts: s.templateScoringRuns.attempts,
          state: s.operations.state,
          report: s.templateScoringAttempts.report,
          reportDigest: s.templateScoringAttempts.reportDigest,
          completedAt: s.templateScoringAttempts.completedAt,
        })
        .from(s.templateScoringRuns)
        .innerJoin(s.operations, eq(s.operations.id, s.templateScoringRuns.operationId))
        .innerJoin(
          s.templateScoringAttempts,
          eq(s.templateScoringAttempts.operationId, s.templateScoringRuns.operationId),
        )
        .where(
          and(
            eq(s.templateScoringRuns.ownerId, actor.ownerId),
            eq(s.templateScoringRuns.graphDigest, digest),
          ),
        )
        .orderBy(desc(s.templateScoringRuns.createdAt))
        .limit(21)
        .offset(input.offset);
      return { items: rows.slice(0, 20), hasMore: rows.length > 20, graphDigest: digest };
    },
    async retainTemplateScoringDocument(
      operationId: string,
      fixtureId: string,
      document: TemplateScoringDocument,
    ) {
      const row = await runtime(operationId),
        fixture = row?.run.fixtureSet.fixtures.find((f) => f.id === fixtureId);
      if (!row || !fixture) throw new Error("Unknown canonical fixture");
      const input = document.input;
      if (
        input.fixtureId !== fixtureId ||
        input.documentDigest !== fixture.documentDigest ||
        input.jobDescription !== fixture.jobDescription ||
        input.templateIdentity !== canonicalJson(graphInventory(row.run.graph)) ||
        input.rendererVersion !== CUSTOM_RENDERER_VERSION ||
        input.providerUrl !== row.run.profile.origin ||
        input.adapterVersion !== row.run.profile.adapterVersion ||
        !validateText(fixture.document, input.resumeText).passed ||
        !scoringPreflight(input.resumeText, input.jobDescription).allowed
      )
        throw new ApplicationError({
          code: "InvalidInput",
          message: "The complete canonical fixture or document identity failed scoring preflight.",
        });
      return commitRuntime(
        operationId,
        [
          db
            .update(s.templateScoringFixtures)
            .set({ document, documentDigest: await fingerprint(canonicalJson(document)) })
            .where(
              and(
                eq(s.templateScoringFixtures.runId, row.run.id),
                eq(s.templateScoringFixtures.fixtureId, fixtureId),
              ),
            ),
        ],
        sql`EXISTS (SELECT 1 FROM template_scoring_fixtures WHERE run_id=${row.run.id} AND fixture_id=${fixtureId} AND document IS NULL)`,
      );
    },
    async claimTemplateScoringSubmission(
      operationId: string,
      fixtureId: string,
      version: ScoringProviderVersion,
    ) {
      const row = await runtime(operationId);
      if (!row) return false;
      return commitRuntime(
        operationId,
        [
          db
            .update(s.templateScoringFixtureAttempts)
            .set({ observation: { version, observedAt: Date.now() }, submittedAt: Date.now() })
            .where(
              and(
                eq(s.templateScoringFixtureAttempts.operationId, operationId),
                eq(s.templateScoringFixtureAttempts.fixtureId, fixtureId),
              ),
            ),
        ],
        sql`EXISTS (SELECT 1 FROM template_scoring_fixture_attempts a JOIN template_scoring_fixtures f ON f.fixture_id=a.fixture_id AND f.run_id=${row.run.id} WHERE a.operation_id=${operationId} AND a.fixture_id=${fixtureId} AND a.submitted_at IS NULL AND f.document IS NOT NULL AND f.raw_response_json IS NULL)`,
      );
    },
    async retainTemplateScoringResponse(operationId: string, fixtureId: string, raw: unknown) {
      const row = await runtime(operationId),
        fixture = row?.fixtures.find((f) => f.fixtureId === fixtureId),
        attempt = row?.fixtureAttempts.find((f) => f.fixtureId === fixtureId);
      if (!row || !fixture?.document || !attempt?.submittedAt) return false;
      const rawResponseJson = JSON.stringify(raw);
      if (!rawResponseJson || new TextEncoder().encode(rawResponseJson).length > 262144)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "The scoring response exceeds its storage limit.",
        });
      validateScoringResponse(
        raw,
        fixture.document.input.resumeText,
        fixture.document.input.jobDescription,
      );
      return commitRuntime(
        operationId,
        [
          db
            .update(s.templateScoringFixtures)
            .set({
              rawResponseJson,
              resultDigest: await fingerprint(rawResponseJson),
              resultOperationId: operationId,
              receivedAt: Date.now(),
            })
            .where(
              and(
                eq(s.templateScoringFixtures.runId, row.run.id),
                eq(s.templateScoringFixtures.fixtureId, fixtureId),
              ),
            ),
        ],
        sql`EXISTS (SELECT 1 FROM template_scoring_fixtures WHERE run_id=${row.run.id} AND fixture_id=${fixtureId} AND raw_response_json IS NULL)`,
      );
    },
    async failTemplateScoringFixture(
      operationId: string,
      fixtureId: string,
      failure: ScoringFailure,
    ) {
      return commitRuntime(operationId, [
        db
          .update(s.templateScoringFixtureAttempts)
          .set({ failure })
          .where(
            and(
              eq(s.templateScoringFixtureAttempts.operationId, operationId),
              eq(s.templateScoringFixtureAttempts.fixtureId, fixtureId),
            ),
          ),
      ]);
    },
    /** Only the server verifier supplies digests; no command accepts client-supplied qualification evidence. */
    async completeTemplateScoring(
      operationId: string,
      verifiedDocuments: readonly { fixtureId: string; digest: string }[],
    ) {
      const row = await runtime(operationId);
      if (!row || row.attempt.completedAt) return false;
      const evidence = row.fixtures.flatMap((f) =>
        f.document && f.rawResponseJson && f.resultOperationId
          ? [
              {
                ...f.document.input,
                rawResponseJson: f.rawResponseJson,
                runId: `${f.resultOperationId}/${f.fixtureId}`,
              },
            ]
          : [],
      );
      const report = await qualifyAtsTemplate(row.run.graph, row.run.fixtureSet.digest, evidence);
      const integrity = row.fixtures.every(
        (f) =>
          !f.document ||
          verifiedDocuments.some(
            (v) => v.fixtureId === f.fixtureId && v.digest === f.documentDigest,
          ),
      );
      if (!integrity) {
        report.qualified = false;
        report.issues.push(
          "Retained fixture artifacts could not be verified. The designation is withheld.",
        );
      }
      const complete = integrity && evidence.length === row.run.fixtureSet.fixtures.length,
        reportDigest = await fingerprint(canonicalJson(report)),
        now = Date.now();
      const unchanged = row.fixtures.map(
        (f) =>
          sql`EXISTS (SELECT 1 FROM template_scoring_fixtures WHERE run_id=${row.run.id} AND fixture_id=${f.fixtureId} AND document_digest IS ${f.documentDigest} AND result_digest IS ${f.resultDigest})`,
      );
      return commitRuntime(
        operationId,
        [
          db
            .update(s.templateScoringAttempts)
            .set({
              report,
              reportDigest,
              completedAt: now,
              failure: complete ? null : stoppedFailure,
            })
            .where(eq(s.templateScoringAttempts.operationId, operationId)),
          db
            .update(s.templateScoringRuns)
            .set({ completedAt: complete ? now : null })
            .where(eq(s.templateScoringRuns.id, row.run.id)),
          db
            .update(s.operations)
            .set({
              state: complete ? "Succeeded" : "Failed",
              stage: report.qualified
                ? "All canonical fixtures passed six simulations"
                : "Qualification report retained; designation withheld",
              failure: complete ? null : stoppedFailure.message,
              updatedAt: now,
            })
            .where(eq(s.operations.id, operationId)),
          db.insert(s.audit).values({
            id: newId(),
            actorId: row.run.ownerId,
            command: "complete-template-scoring",
            entityId: row.run.id,
            after: {
              operationId,
              graphDigest: row.run.graphDigest,
              fixtureSetDigest: row.run.fixtureSet.digest,
              reportDigest,
              qualified: report.qualified,
            },
            createdAt: now,
          }),
        ],
        sql`${sql.join(unchanged, sql` AND `)} AND EXISTS (SELECT 1 FROM template_scoring_attempts WHERE operation_id=${operationId} AND completed_at IS NULL)`,
      );
    },
    async failTemplateScoring(operationId: string, failure: ScoringFailure = stoppedFailure) {
      return commitRuntime(operationId, [
        db
          .update(s.templateScoringAttempts)
          .set({ failure })
          .where(eq(s.templateScoringAttempts.operationId, operationId)),
        db
          .update(s.operations)
          .set({
            state: "Failed",
            stage: "Template scoring interrupted",
            failure: failure.message,
            updatedAt: Date.now(),
          })
          .where(eq(s.operations.id, operationId)),
      ]);
    },
  };
}
