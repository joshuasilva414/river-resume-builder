import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { schema } from "@river/db";
import { canonicalJson, fingerprint, newId, type Principal, scoringProfile } from "@river/domain";
import { RENDERER_VERSION, validateTextManifest } from "@river/templates";
import { and, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { beforeAll, expect, it, vi } from "vitest";
import { saveAndScore } from "../src/server/scoring";
import { prepareScoring, scoringFailure, submitScoring } from "../src/server/scoring-runtime";
import { Actor, Store } from "../src/server/services";
import { compositionFixture } from "./fixtures/composition";
import { syntheticScoringResponse, syntheticScoringVersion } from "./fixtures/scoring";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const profile = scoringProfile("https://synthetic-ats.example.test");
async function fixture(ready = true, resumeText = " Synthetic résumé\nexact spacing. ") {
  const base = await compositionFixture(),
    { repository, actor, draft } = base;
  const checkpoint = await repository.captureCheckpoint(actor, {
    id: draft.id,
    revision: 0,
    idempotencyKey: "capture-score",
  });
  const detail = await repository.inspectCheckpoint(actor.ownerId, checkpoint.id);
  if (!detail.operation) throw new Error("Missing fixture document");
  const key = `retained/scoring-fixture/${checkpoint.id}/text.txt`,
    textDigest = await fingerprint(resumeText);
  await env.ARTIFACTS.put(key, resumeText);
  const reportKey = `${key}.report.json`,
    report = JSON.stringify(
      validateTextManifest([{ locator: "synthetic", text: resumeText }], resumeText),
    );
  await env.ARTIFACTS.put(reportKey, report);
  if (ready)
    await repository.updateOperation(detail.operation.id, {
      state: "Succeeded",
      stage: "Fixture compiled",
      artifacts: {
        text: key,
        tex: "fixture.tex",
        pdf: "fixture.pdf",
        report: reportKey,
        fingerprint: "synthetic-document",
        durationMs: 1,
        rendererVersion: RENDERER_VERSION,
        templateIdentity: detail.checkpoint.templateIdentity,
        validationPassed: true,
        objectDigests: {
          text: textDigest,
          tex: "a".repeat(64),
          pdf: "b".repeat(64),
          report: await fingerprint(report),
        },
      },
    });
  const input = { checkpointId: checkpoint.id, revision: 0, idempotencyKey: "start-score" };
  return { ...base, checkpoint, detail, input, resumeText, key };
}
function provider(input: { resumeText: string; jobDescription: string }) {
  return vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(
      init?.method === "POST" ? syntheticScoringResponse(input) : syntheticScoringVersion,
    ),
  );
}
it("retains an aliased provider response unchanged while publishing canonical simulation identities", async () => {
  const { repository, actor, input, resumeText } = await fixture();
  const started = await repository.startScoring(actor, input, profile);
  const id = started.revisionId ?? "";
  await prepareScoring(env, id);
  const canonical = syntheticScoringResponse({ resumeText, jobDescription: "Synthetic posting" });
  const raw = {
    ...canonical,
    results: canonical.results.map((result) => ({
      ...result,
      system: result.system === "SuccessFactors" ? "SAP SuccessFactors" : result.system,
    })),
  };
  const transport = vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(init?.method === "POST" ? raw : syntheticScoringVersion),
  );
  await submitScoring(env, id, transport);
  await repository.completeScoring(id);
  const saved = await repository.inspectScoring(actor, started.id);
  expect(saved.run.completedAt).not.toBeNull();
  expect(saved.run.result?.raw).toEqual(raw);
  expect(saved.run.result?.response).toEqual(canonical);
  expect(saved.run.result?.digest).toBe(await fingerprint(canonicalJson(raw)));
});
it("atomically starts exact checkpoint scoring once, rejects stale revisions and restricts Owner access", async () => {
  const { repository, actor, input } = await fixture();
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: actor.ownerId,
    scopes: ["jobs:write", "evidence:read"],
  };
  await expect(repository.startScoring(agent, input, profile)).rejects.toMatchObject({
    code: "Forbidden",
  });
  await expect(
    repository.startScoring(
      actor,
      { ...input, revision: 1, idempotencyKey: "stale-score" },
      profile,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(
    (await repository.listScoring(actor, { checkpointId: input.checkpointId, offset: 0 })).items,
  ).toHaveLength(0);
  const [first, second] = await Promise.all([
    repository.startScoring(actor, input, profile),
    repository.startScoring(actor, input, profile),
  ]);
  expect(second).toEqual(first);
  const detail = await repository.inspectScoring(actor, first.id);
  expect(detail.attempts).toHaveLength(1);
  expect(detail.run.profile).toEqual(profile);
  expect(
    (await repository.pendingDispatches()).filter(
      (dispatch) => dispatch.operationId === detail.run.operationId,
    ),
  ).toHaveLength(1);
  expect(
    await repository.db
      .select()
      .from(schema.audit)
      .where(and(eq(schema.audit.command, "start-scoring"), eq(schema.audit.entityId, first.id))),
  ).toHaveLength(1);
  await expect(repository.inspectScoring(agent, first.id)).rejects.toMatchObject({
    code: "Forbidden",
  });
  const stranger: Principal = { kind: "owner", id: newId(), ownerId: newId() };
  await expect(repository.inspectScoring(stranger, first.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  await expect(
    repository.startScoring(actor, { ...input, revision: 1 }, profile),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("enforces two active runs under concurrent starts without orphaned operations or receipts", async () => {
  const { repository, actor, input } = await fixture();
  const results = await Promise.allSettled(
    [0, 1, 2].map((i) =>
      repository.startScoring(
        actor,
        { ...input, idempotencyKey: `concurrent-score-${i}` },
        profile,
      ),
    ),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  const runs = await repository.listScoring(actor, { checkpointId: input.checkpointId, offset: 0 });
  expect(runs.items).toHaveLength(2);
  const operations = (await repository.listOperations(actor.ownerId)).filter(
    (op) => "type" in op.input && op.input.type === "checkpoint-score",
  );
  expect(operations).toHaveLength(2);
  const receipts = await repository.db
    .select()
    .from(schema.receipts)
    .where(
      and(eq(schema.receipts.actorId, actor.id), eq(schema.receipts.command, "start-scoring")),
    );
  expect(receipts).toHaveLength(2);
});
it("waits for the pinned compilation and rejects corrupted or oversized artifacts before submission", async () => {
  const waiting = await fixture(false);
  const run = await waiting.repository.startScoring(waiting.actor, waiting.input, profile);
  expect(await prepareScoring(env, run.revisionId ?? "")).toBe("Waiting");
  await waiting.repository.updateOperation(waiting.detail.operation?.id ?? "", {
    state: "Failed",
    stage: "Synthetic compile failure",
  });
  await expect(prepareScoring(env, run.revisionId ?? "")).rejects.toMatchObject({
    code: "InvalidInput",
  });
  const corrupt = await fixture();
  const corrupted = await corrupt.repository.startScoring(corrupt.actor, corrupt.input, profile);
  await env.ARTIFACTS.put(corrupt.key, "Changed retained text");
  await expect(prepareScoring(env, corrupted.revisionId ?? "")).rejects.toMatchObject({
    code: "InvalidInput",
  });
  const long = await fixture(true, "X".repeat(6001));
  const oversized = await long.repository.startScoring(long.actor, long.input, profile);
  await expect(prepareScoring(env, oversized.revisionId ?? "")).rejects.toMatchObject({
    code: "InvalidInput",
  });
  expect((await long.repository.inspectScoring(long.actor, oversized.id)).run.input).toBeNull();
});
it("retains exact input and actual result identity, then recovers publication without another provider submission", async () => {
  const { repository, actor, input, resumeText, key, checkpoint, detail } = await fixture();
  const run = await repository.startScoring(actor, input, profile),
    id = run.revisionId ?? "";
  expect(await prepareScoring(env, id)).toBe("Prepared");
  const before = await repository.inspectScoring(actor, run.id);
  expect(before.run.input).toMatchObject({
    resumeText,
    jobDescription: "Synthetic posting",
    textKey: key,
    textDigest: await fingerprint(resumeText),
  });
  const transport = provider({ resumeText, jobDescription: "Synthetic posting" });
  await submitScoring(env, id, transport);
  const staged = await repository.inspectScoring(actor, run.id);
  expect(staged.run.completedAt).toBeNull();
  expect(staged.run.result?.response._scoringIdentity?.deployment.buildId).toBe(
    "actual-result-build",
  );
  expect(staged.attempts[0]?.attempt.observation?.version.deployment?.buildId).toBe(
    "observed-build",
  );
  expect(staged.run.result?.digest).toBe(await fingerprint(canonicalJson(staged.run.result?.raw)));
  await repository.failScoring(id, {
    code: "Interrupted",
    message: "Synthetic finalization interruption",
    retryAt: null,
  });
  const retryInput = { id: run.id, revision: 0, idempotencyKey: "recover-score" };
  const retry = await repository.retryScoring(actor, retryInput);
  expect(await repository.retryScoring(actor, retryInput)).toEqual(retry);
  await submitScoring(env, retry.revisionId ?? "", transport);
  expect(transport).toHaveBeenCalledTimes(2); // One version observation and one scoring submission.
  expect(await repository.completeScoring(retry.revisionId ?? "")).toBe(true);
  expect(await repository.completeScoring(retry.revisionId ?? "")).toBe(false);
  const finished = await repository.inspectScoring(actor, run.id);
  expect(finished.run.result).toEqual(staged.run.result);
  expect(finished.run.completedAt).not.toBeNull();
  expect(finished.attempts.map((attempt) => attempt.operation.state)).toEqual([
    "Failed",
    "Succeeded",
  ]);
  expect((await repository.inspectCheckpoint(actor.ownerId, checkpoint.id)).state).toEqual(
    detail.state,
  );
  await expect(
    repository.retryScoring(actor, {
      id: run.id,
      revision: finished.run.revision,
      idempotencyKey: "completed",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("blocks late responses after cancellation and preserves cancellation during retry", async () => {
  const { repository, actor, input, resumeText } = await fixture();
  const run = await repository.startScoring(actor, input, profile),
    id = run.revisionId ?? "";
  await prepareScoring(env, id);
  await repository.observeScoringProvider(id, syntheticScoringVersion);
  expect(await repository.claimScoringSubmission(id)).toBe(true);
  await repository.cancelOperation(actor.id, id, "cancel-scoring");
  expect(
    await repository.retainScoringResult(
      id,
      syntheticScoringResponse({ resumeText, jobDescription: "Synthetic posting" }),
    ),
  ).toBe(false);
  expect(await repository.completeScoring(id)).toBe(false);
  expect(
    await repository.failScoring(id, {
      code: "Interrupted",
      message: "Late failure",
      retryAt: null,
    }),
  ).toBe(false);
  const retry = await repository.retryScoring(actor, {
    id: run.id,
    revision: 0,
    idempotencyKey: "after-cancel",
  });
  expect(retry.revisionId).not.toBe(id);
  expect((await repository.inspectScoring(actor, run.id)).run.result).toBeNull();
});
it("honors Retry-After and three-attempt limits while retaining failed attempt chronology", async () => {
  const { repository, actor, input } = await fixture();
  const run = await repository.startScoring(actor, input, profile);
  await repository.failScoring(run.revisionId ?? "", {
    code: "RateLimited",
    message: "Synthetic limit",
    retryAt: Date.now() + 60000,
  });
  const retry = { id: run.id, revision: 0, idempotencyKey: "too-soon" };
  await expect(repository.retryScoring(actor, retry)).rejects.toMatchObject({ code: "Conflict" });
  // Advance the fixture's recorded retry deadline without sleeping a test for a minute.
  await repository.db
    .update(schema.scoringAttempts)
    .set({ failure: { code: "RateLimited", message: "Synthetic limit", retryAt: Date.now() - 1 } })
    .where(eq(schema.scoringAttempts.operationId, run.revisionId ?? ""));
  const second = await repository.retryScoring(actor, retry);
  await repository.failScoring(second.revisionId ?? "", {
    code: "Unavailable",
    message: "Synthetic outage",
    retryAt: null,
  });
  const third = await repository.retryScoring(actor, {
    id: run.id,
    revision: 1,
    idempotencyKey: "third",
  });
  await repository.failScoring(third.revisionId ?? "", {
    code: "Timeout",
    message: "Synthetic timeout",
    retryAt: null,
  });
  await expect(
    repository.retryScoring(actor, { id: run.id, revision: 2, idempotencyKey: "fourth" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const detail = await repository.inspectScoring(actor, run.id);
  expect(detail.attempts.map((item) => item.attempt.failure?.code)).toEqual([
    "RateLimited",
    "Unavailable",
    "Timeout",
  ]);
  expect(detail.run.result).toBeNull();
});
it("refuses to silently resubmit an attempt after an uncertain network outcome", async () => {
  const { repository, actor, input } = await fixture();
  const run = await repository.startScoring(actor, input, profile),
    id = run.revisionId ?? "";
  await prepareScoring(env, id);
  const transport = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "POST") throw new Error("Synthetic disconnected response");
    return Response.json(syntheticScoringVersion);
  });
  await expect(submitScoring(env, id, transport)).rejects.toMatchObject({ code: "Unavailable" });
  await expect(submitScoring(env, id, transport)).rejects.toThrow("already reserved");
  expect(transport).toHaveBeenCalledTimes(2);
  expect(scoringFailure(new Error("private provider content"))).toMatchObject({
    code: "Interrupted",
  });
  expect(scoringFailure(new Error("private provider content")).message).not.toContain(
    "private provider",
  );
});
it("captures and queues Save & score atomically, replays offline, and rejects a stale saved draft", async () => {
  const { repository, actor, draft, data } = await compositionFixture();
  const request = { id: draft.id, revision: 0, idempotencyKey: "save-and-score" };
  const captured = await repository.captureCheckpoint(actor, request, undefined, profile);
  const runs = await repository.listScoring(actor, { checkpointId: captured.id, offset: 0 });
  expect(runs.items).toHaveLength(1);
  const run = runs.items[0];
  if (!run) throw new Error("Missing atomic scoring run");
  const checkpoint = await repository.inspectCheckpoint(actor.ownerId, captured.id);
  const detail = await repository.inspectScoring(actor, run.run.id);
  expect(detail.run.documentOperationId).toBe(checkpoint.operation?.id);
  expect(detail.run.snapshotId).toBe(checkpoint.checkpoint.snapshotId);
  expect(
    (await repository.pendingDispatches()).filter((dispatch) =>
      [detail.run.operationId, detail.run.documentOperationId].includes(dispatch.operationId),
    ),
  ).toHaveLength(2);
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: { ...data, name: "Newer work" },
    idempotencyKey: "newer",
  });
  expect(
    await Effect.runPromise(
      saveAndScore(env, request).pipe(
        Effect.provide(Layer.merge(Layer.succeed(Actor, actor), Layer.succeed(Store, repository))),
      ),
    ),
  ).toEqual(captured);
  await expect(
    repository.captureCheckpoint(
      actor,
      { ...request, idempotencyKey: "stale-capture-score" },
      undefined,
      profile,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(
    (await repository.listCheckpoints(actor.ownerId, { draftId: draft.id, offset: 0 })).items,
  ).toHaveLength(1);
  expect(await repository.listOperations(actor.ownerId)).toHaveLength(2);
  expect(checkpoint.checkpoint.data.name).toBe("Fixture draft");
});
it("verifies legacy checkpoint text against its retained report and captures digests without changing history", async () => {
  const { repository, actor, input, detail, key, resumeText } = await fixture();
  if (!detail.operation) throw new Error("Missing document operation");
  const operation = await repository.getOperation(detail.operation.id);
  if (!operation?.artifacts) throw new Error("Missing retained artifacts");
  const { objectDigests: _digests, ...legacy } = operation.artifacts;
  await repository.db
    .update(schema.operations)
    .set({ artifacts: legacy })
    .where(eq(schema.operations.id, operation.id));
  const run = await repository.startScoring(actor, input, profile);
  expect(await prepareScoring(env, run.revisionId ?? "")).toBe("Prepared");
  expect((await repository.inspectScoring(actor, run.id)).run.input).toMatchObject({
    resumeText,
    textDigest: await fingerprint(resumeText),
  });
  expect((await repository.getOperation(operation.id))?.artifacts).toEqual(legacy);
  await repository.cancelOperation(actor.id, run.revisionId ?? "", "cancel-legacy-fixture");
  await env.ARTIFACTS.put(
    `${key}.report.json`,
    JSON.stringify({
      ...validateTextManifest([{ locator: "synthetic", text: resumeText }], resumeText),
      passed: false,
    }),
  );
  const invalid = await repository.startScoring(
    actor,
    { ...input, idempotencyKey: "invalid-legacy-report" },
    profile,
  );
  await expect(prepareScoring(env, invalid.revisionId ?? "")).rejects.toMatchObject({
    code: "InvalidInput",
  });
});
it("stores concurrent finding decisions against exact completed results and keeps new runs unreviewed", async () => {
  const { repository, actor, input, resumeText } = await fixture();
  const first = await repository.startScoring(actor, input, profile),
    id = first.revisionId ?? "";
  await prepareScoring(env, id);
  await submitScoring(env, id, provider({ resumeText, jobDescription: "Synthetic posting" }));
  await repository.completeScoring(id);
  const detail = await repository.inspectScoring(actor, first.id),
    finding = detail.findings[0];
  if (!finding || !detail.run.result) throw new Error("Missing result finding");
  const request = {
    runId: first.id,
    resultDigest: detail.run.result.digest,
    findingDigest: finding.digest,
    platform: finding.platform,
    index: finding.index,
    revision: 0,
    outcome: "Accepted" as const,
    rationale: "Synthetic review of this exact finding",
    idempotencyKey: "review-score-finding",
  };
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: actor.ownerId,
    scopes: ["evidence:verify"],
  };
  await expect(repository.reviewScoringFinding(agent, request)).rejects.toMatchObject({
    code: "Forbidden",
  });
  await expect(
    repository.reviewScoringFinding(actor, { ...request, findingDigest: "0".repeat(64) }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    repository.reviewScoringFinding(actor, { ...request, resultDigest: "0".repeat(64) }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const concurrent = await Promise.allSettled(
    [
      request,
      { ...request, outcome: "Addressed" as const, idempotencyKey: "competing-review" },
    ].map((value) => repository.reviewScoringFinding(actor, value)),
  );
  expect(concurrent.filter((value) => value.status === "fulfilled")).toHaveLength(1);
  expect(concurrent.filter((value) => value.status === "rejected")).toHaveLength(1);
  const reviewed = await repository.inspectScoring(actor, first.id);
  expect(reviewed.decisions).toHaveLength(1);
  expect(reviewed.run.result).toEqual(detail.run.result);
  expect(
    await repository.db
      .select()
      .from(schema.audit)
      .where(eq(schema.audit.entityId, reviewed.decisions[0]?.id ?? "")),
  ).toHaveLength(1);
  const second = await repository.startScoring(
      actor,
      { ...input, idempotencyKey: "rescore" },
      profile,
    ),
    secondId = second.revisionId ?? "";
  await prepareScoring(env, secondId);
  await submitScoring(env, secondId, provider({ resumeText, jobDescription: "Synthetic posting" }));
  await repository.completeScoring(secondId);
  const rescored = await repository.inspectScoring(actor, second.id);
  expect(rescored.decisions).toHaveLength(0);
  expect(rescored.findings[0]?.digest).not.toBe(finding.digest);
  // Equal provider payloads may hash equally; the run identity still separates review ownership.
  expect(
    (await repository.compareScoring(actor, { beforeId: first.id, afterId: second.id })).comparison
      .compatible,
  ).toBe(true);
  await expect(
    repository.reviewScoringFinding(actor, {
      ...request,
      runId: second.id,
      revision: 1,
      idempotencyKey: "wrong-review-revision",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
