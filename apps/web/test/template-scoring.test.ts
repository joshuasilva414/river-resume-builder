import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { CompiledResult, StartTemplateScoringRequest } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import { canonicalJson, fingerprint, newId, type Principal, scoringProfile } from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  captureAtsFixtureSet,
  expectedText,
  validateText,
} from "@river/templates";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it, vi } from "vitest";
import {
  completeTemplateScoring,
  prepareTemplateScoring,
  submitTemplateScoring,
} from "../src/server/template-scoring-runtime";
import { compositionFixture } from "./fixtures/composition";
import { syntheticScoringResponse, syntheticScoringVersion } from "./fixtures/scoring";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const profile = scoringProfile("https://synthetic-ats.example.test");
async function fixture() {
  const repository = createRepository(env.DB),
    id = newId(),
    actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "Synthetic qualification fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const input: StartTemplateScoringRequest = {
    base: { kind: "fixed", theme: "classic" },
    reviewRevision: null,
    idempotencyKey: "start",
  };
  const documents = vi.fn<import("../src/server/env").Env["DOCUMENTS"]["run"]>(async (job) => {
    if (job.type !== "validate-template") throw new Error("Unexpected document job");
    const text = expectedText(job.document);
    const result: CompiledResult = {
      type: "compiled",
      pdfBase64: btoa("%PDF-1.7 synthetic test only"),
      tex: "Synthetic source",
      extractedText: text,
      fingerprint: await fingerprint(canonicalJson(job.document)),
      durationMs: 1,
      rendererVersion: CUSTOM_RENDERER_VERSION,
      templateIdentity: job.templateIdentity,
      resources: {
        compiler: "synthetic",
        bundle: "synthetic",
        fonts: "synthetic",
        cacheDigest: "synthetic",
      },
      validation: { ...validateText(job.document, text), pageCount: 1 },
    };
    return result;
  });
  const runtime = { DB: env.DB, ARTIFACTS: env.ARTIFACTS, DOCUMENTS: { run: documents } };
  const transport = vi.fn<typeof fetch>(async (_url, init) => {
    const body =
      init?.method === "POST" && typeof init.body === "string" ? JSON.parse(init.body) : null;
    return Response.json(body ? syntheticScoringResponse(body) : syntheticScoringVersion);
  });
  const start = async () => {
    const run = await repository.startTemplateScoring(actor, input, profile);
    if (!run.revisionId) throw new Error("Operation missing");
    return { ...run, operationId: run.revisionId };
  };
  const complete = async (operationId: string) => {
    for (const f of (await captureAtsFixtureSet()).fixtures) {
      await prepareTemplateScoring(runtime, operationId, f.id);
      await submitTemplateScoring(runtime, operationId, f.id, transport);
    }
    await completeTemplateScoring(runtime, operationId);
  };
  return { repository, actor, input, runtime, documents, transport, start, complete };
}
it("atomically captures synthetic inputs, permanent idempotency, Owner scope and dispatch", async () => {
  const f = await fixture();
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: f.actor.id,
    scopes: ["jobs:write"],
  };
  await expect(f.repository.startTemplateScoring(agent, f.input, profile)).rejects.toMatchObject({
    code: "Forbidden",
  });
  const [a, b] = await Promise.all([f.start(), f.start()]);
  expect(a).toEqual(b);
  await expect(
    f.repository.startTemplateScoring(
      f.actor,
      { ...f.input, base: { kind: "fixed", theme: "minimal" } },
      profile,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  const detail = await f.repository.inspectTemplateScoring(f.actor, a.id);
  expect(detail.run.fixtureSet).toEqual(await captureAtsFixtureSet());
  expect(detail.fixtures).toHaveLength(3);
  expect(detail.fixtureAttempts).toHaveLength(3);
  expect(
    (await f.repository.pendingDispatches()).some((d) => d.operationId === a.operationId),
  ).toBe(true);
  expect(
    await f.repository.db
      .select()
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.ownerId, f.actor.id)),
  ).toHaveLength(0);
  await expect(f.repository.inspectTemplateScoring(agent, a.id)).rejects.toMatchObject({
    code: "Forbidden",
  });
  const stranger = (await fixture()).actor;
  await expect(f.repository.inspectTemplateScoring(stranger, a.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  await expect(
    f.repository.startTemplateScoring(f.actor, { ...f.input, idempotencyKey: "second" }, profile),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("requires the exact saved review revision and leaves no writes on stale input", async () => {
  const f = await fixture();
  const draft = await f.repository.saveTemplate(f.actor, {
    id: null,
    revision: null,
    name: "Synthetic saved graph",
    scope: { level: "document", type: null },
    base: f.input.base,
    source: (await import("@river/templates")).fixedPack("classic").document.source,
    overrides: {},
    idempotencyKey: "draft",
  });
  if (!draft.revisionId) throw new Error("Missing revision");
  await f.repository.db
    .update(schema.templateRevisions)
    .set({ state: "Validated", reviewRevision: 1 })
    .where(eq(schema.templateRevisions.id, draft.revisionId));
  const input = {
    ...f.input,
    base: { kind: "saved" as const, revisionId: draft.revisionId },
    reviewRevision: 0,
  };
  await expect(f.repository.startTemplateScoring(f.actor, input, profile)).rejects.toMatchObject({
    code: "Conflict",
  });
  expect(
    (await f.repository.listTemplateScoring(f.actor, { base: input.base, offset: 0 })).items,
  ).toHaveLength(0);
  const saved = await f.repository.startTemplateScoring(
    f.actor,
    { ...input, reviewRevision: 1 },
    profile,
  );
  expect((await f.repository.inspectTemplateScoring(f.actor, saved.id)).run.base).toEqual(
    input.base,
  );
});
it("retains exact four-file proof, three full results and a compatible qualification report", async () => {
  const f = await fixture(),
    run = await f.start();
  await f.complete(run.operationId);
  const detail = await f.repository.inspectTemplateScoring(f.actor, run.id);
  expect(detail.operation.state).toBe("Succeeded");
  expect(detail.attempt.report?.qualified).toBe(true);
  expect(detail.attempt.reportDigest).toBe(await fingerprint(canonicalJson(detail.attempt.report)));
  expect(detail.attempt.report?.fixtures.every((v) => v.response?.results.length === 6)).toBe(true);
  expect(f.transport.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(3);
  await f.complete(run.operationId);
  expect(f.documents).toHaveBeenCalledTimes(3);
  expect(f.transport).toHaveBeenCalledTimes(6);
  await expect(
    f.repository.retryTemplateScoring(f.actor, {
      id: run.id,
      revision: 0,
      idempotencyKey: "retry-complete",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("preserves successful fixtures and immutable failed reports while retrying unfinished work", async () => {
  const f = await fixture(),
    run = await f.start();
  expect(await f.repository.readScoringAllowance(f.actor)).toMatchObject({
    used: 0,
    reserved: 3,
    remaining: 22,
  });
  await prepareTemplateScoring(f.runtime, run.operationId, "graduate-web");
  await submitTemplateScoring(f.runtime, run.operationId, "graduate-web", f.transport);
  await f.repository.failTemplateScoringFixture(run.operationId, "experienced-platform", {
    code: "Unavailable",
    message: "Synthetic outage",
    retryAt: null,
  });
  expect(await f.repository.readScoringAllowance(f.actor)).toMatchObject({
    used: 1,
    reserved: 1,
    remaining: 23,
  });
  await completeTemplateScoring(f.runtime, run.operationId);
  expect(await f.repository.readScoringAllowance(f.actor)).toMatchObject({
    used: 1,
    reserved: 0,
    remaining: 24,
  });
  const before = await f.repository.inspectTemplateScoring(f.actor, run.id);
  expect(before.attempt.report?.qualified).toBe(false);
  expect(before.operation.state).toBe("Failed");
  const [retry, raced] = await Promise.all([
    f.repository.retryTemplateScoring(f.actor, {
      id: run.id,
      revision: 0,
      idempotencyKey: "retry",
    }),
    f.repository.retryTemplateScoring(f.actor, {
      id: run.id,
      revision: 0,
      idempotencyKey: "retry",
    }),
  ]);
  expect(retry).toEqual(raced);
  if (!retry.revisionId) throw new Error("Missing retry");
  expect(await f.repository.readScoringAllowance(f.actor)).toMatchObject({
    used: 1,
    reserved: 2,
    remaining: 22,
  });
  await f.complete(retry.revisionId);
  expect(await f.repository.readScoringAllowance(f.actor)).toMatchObject({
    used: 3,
    reserved: 0,
    remaining: 22,
  });
  const after = await f.repository.inspectTemplateScoring(f.actor, run.id);
  expect(after.attempt.report?.qualified).toBe(true);
  expect(after.attempts[0]?.attempt.reportDigest).toBe(before.attempt.reportDigest);
  expect(after.fixtures.find((v) => v.fixtureId === "graduate-web")?.resultOperationId).toBe(
    run.operationId,
  );
  expect(f.transport.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(3);
});
it("reserves each submission once, rejects late results and bounds cancellation recovery", async () => {
  const f = await fixture(),
    run = await f.start();
  await prepareTemplateScoring(f.runtime, run.operationId, "graduate-web");
  const claims = await Promise.all([
    f.repository.claimTemplateScoringSubmission(
      run.operationId,
      "graduate-web",
      syntheticScoringVersion,
    ),
    f.repository.claimTemplateScoringSubmission(
      run.operationId,
      "graduate-web",
      syntheticScoringVersion,
    ),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  await f.repository.cancelOperation(f.actor.id, run.operationId, "cancel");
  expect(await f.repository.readScoringAllowance(f.actor)).toMatchObject({
    used: 0,
    reserved: 0,
    remaining: 25,
  });
  const row = await f.repository.getTemplateScoringRuntime(run.operationId),
    document = row?.fixtures.find((f) => f.fixtureId === "graduate-web")?.document;
  if (!document) throw new Error("Missing input");
  expect(
    await f.repository.retainTemplateScoringResponse(
      run.operationId,
      "graduate-web",
      syntheticScoringResponse(document.input),
    ),
  ).toBe(false);
  for (let revision = 0; revision < 2; revision++) {
    const retry = await f.repository.retryTemplateScoring(f.actor, {
      id: run.id,
      revision,
      idempotencyKey: `retry-${revision}`,
    });
    if (!retry.revisionId) throw new Error("Missing retry");
    await f.repository.cancelOperation(f.actor.id, retry.revisionId, `cancel-${revision}`);
  }
  await expect(
    f.repository.retryTemplateScoring(f.actor, {
      id: run.id,
      revision: 2,
      idempotencyKey: "fourth",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await f.repository.inspectTemplateScoring(f.actor, run.id)).attempts).toHaveLength(3);
});
it("blocks corrupted document bytes before submission and withholds completion after artifact loss", async () => {
  const f = await fixture(),
    run = await f.start();
  await prepareTemplateScoring(f.runtime, run.operationId, "graduate-web");
  const row = await f.repository.getTemplateScoringRuntime(run.operationId),
    document = row?.fixtures.find((v) => v.fixtureId === "graduate-web")?.document;
  if (!document) throw new Error("Missing input");
  const original = await env.ARTIFACTS.get(document.artifacts.pdf);
  if (!original) throw new Error("Missing PDF");
  const bytes = await original.arrayBuffer();
  await env.ARTIFACTS.put(document.artifacts.pdf, "corrupted");
  await expect(
    submitTemplateScoring(f.runtime, run.operationId, "graduate-web", f.transport),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect(f.transport).not.toHaveBeenCalled();
  await env.ARTIFACTS.put(document.artifacts.pdf, bytes);
  for (const fixture of (await captureAtsFixtureSet()).fixtures) {
    await prepareTemplateScoring(f.runtime, run.operationId, fixture.id);
    await submitTemplateScoring(f.runtime, run.operationId, fixture.id, f.transport);
  }
  await env.ARTIFACTS.delete(document.artifacts.tex);
  await completeTemplateScoring(f.runtime, run.operationId);
  expect(
    (await f.repository.inspectTemplateScoring(f.actor, run.id)).attempt.report?.qualified,
  ).toBe(false);
});
it("shares capacity with checkpoint runs and enforces provider retry time", async () => {
  const base = await compositionFixture(),
    f = await fixture();
  const checkpoint = await base.repository.captureCheckpoint(base.actor, {
    id: base.draft.id,
    revision: 0,
    idempotencyKey: "capture",
  });
  const run = await base.repository.startTemplateScoring(base.actor, f.input, profile);
  await base.repository.startScoring(
    base.actor,
    { checkpointId: checkpoint.id, revision: 0, idempotencyKey: "score" },
    profile,
  );
  await expect(
    base.repository.startScoring(
      base.actor,
      { checkpointId: checkpoint.id, revision: 0, idempotencyKey: "score-too-many" },
      profile,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  if (!run.revisionId) throw new Error("Missing operation");
  await base.repository.failTemplateScoringFixture(run.revisionId, "graduate-web", {
    code: "RateLimited",
    message: "Synthetic rate limit",
    retryAt: Date.now() + 60000,
  });
  await base.repository.failTemplateScoring(run.revisionId);
  await expect(
    base.repository.retryTemplateScoring(base.actor, {
      id: run.id,
      revision: 0,
      idempotencyKey: "early",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});

it("retains failing simulations and incompatible identities without awarding a designation", async () => {
  const f = await fixture(),
    run = await f.start();
  const transport = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST" || typeof init.body !== "string")
      return Response.json(syntheticScoringVersion);
    const response = syntheticScoringResponse(JSON.parse(init.body));
    return Response.json({
      ...response,
      _scoringIdentity: response._scoringIdentity
        ? {
            ...response._scoringIdentity,
            model: { ...response._scoringIdentity.model, reported: null },
          }
        : null,
      results: response.results.map((result, index) =>
        index === 0 ? { ...result, passesFilter: false } : result,
      ),
    });
  });
  for (const fixture of (await captureAtsFixtureSet()).fixtures) {
    await prepareTemplateScoring(f.runtime, run.operationId, fixture.id);
    await submitTemplateScoring(f.runtime, run.operationId, fixture.id, transport);
  }
  await completeTemplateScoring(f.runtime, run.operationId);
  const detail = await f.repository.inspectTemplateScoring(f.actor, run.id);
  expect(detail.operation.state).toBe("Succeeded");
  expect(detail.attempt.report?.qualified).toBe(false);
  expect(detail.attempt.report?.fixtures.every((f) => f.response?.results.length === 6)).toBe(true);
  expect(detail.fixtures.every((f) => f.rawResponseJson !== null)).toBe(true);
});
it("publishes a retained response after interruption without another external request", async () => {
  const f = await fixture(),
    run = await f.start();
  for (const fixture of (await captureAtsFixtureSet()).fixtures) {
    await prepareTemplateScoring(f.runtime, run.operationId, fixture.id);
    await submitTemplateScoring(f.runtime, run.operationId, fixture.id, f.transport);
  }
  await f.repository.failTemplateScoring(run.operationId);
  const retry = await f.repository.retryTemplateScoring(f.actor, {
    id: run.id,
    revision: 0,
    idempotencyKey: "recover-publication",
  });
  if (!retry.revisionId) throw new Error("Missing recovery attempt");
  await f.complete(retry.revisionId);
  expect(f.documents).toHaveBeenCalledTimes(3);
  expect(f.transport).toHaveBeenCalledTimes(6);
  expect(
    (await f.repository.inspectTemplateScoring(f.actor, run.id)).attempt.report?.qualified,
  ).toBe(true);
});

it("rejects a template run before provider work when fewer than three results remain", async () => {
  const f = await fixture(),
    allowance = await f.repository.readScoringAllowance(f.actor);
  await f.repository.db
    .insert(schema.scoringUsageDays)
    .values({ ownerId: f.actor.id, day: allowance.day, used: 23 });
  await expect(f.start()).rejects.toMatchObject({ code: "RateLimited" });
  expect(await f.repository.readScoringAllowance(f.actor)).toMatchObject({
    used: 23,
    reserved: 0,
    remaining: 2,
  });
  expect(
    (await f.repository.listTemplateScoring(f.actor, { base: f.input.base, offset: 0 })).items,
  ).toHaveLength(0);
  expect(f.documents).not.toHaveBeenCalled();
  expect(f.transport).not.toHaveBeenCalled();
});

it("rejects a late sample response after its failed reservation was released", async () => {
  const f = await fixture(),
    run = await f.start();
  await prepareTemplateScoring(f.runtime, run.operationId, "graduate-web");
  await f.repository.claimTemplateScoringSubmission(
    run.operationId,
    "graduate-web",
    syntheticScoringVersion,
  );
  const runtime = await f.repository.getTemplateScoringRuntime(run.operationId);
  const document = runtime?.fixtures.find((item) => item.fixtureId === "graduate-web")?.document;
  if (!document) throw Error("Expected prepared sample");
  await f.repository.failTemplateScoringFixture(run.operationId, "graduate-web", {
    code: "Unavailable",
    message: "Timeout",
    retryAt: null,
  });
  expect(
    await f.repository.retainTemplateScoringResponse(
      run.operationId,
      "graduate-web",
      syntheticScoringResponse(document.input),
    ),
  ).toBe(false);
  expect(await f.repository.readScoringAllowance(f.actor)).toMatchObject({
    used: 0,
    reserved: 2,
    remaining: 23,
  });
});
