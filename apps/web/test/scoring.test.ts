import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { schema } from "@river/db";
import { canonicalJson, fingerprint, newId, type Principal, scoringProfile } from "@river/domain";
import { RENDERER_VERSION } from "@river/templates";
import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it, vi } from "vitest";
import { prepareScoring, scoringFailure, submitScoring } from "../src/server/scoring-runtime";
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
  if (ready)
    await repository.updateOperation(detail.operation.id, {
      state: "Succeeded",
      stage: "Fixture compiled",
      artifacts: {
        text: key,
        tex: "fixture.tex",
        pdf: "fixture.pdf",
        report: "fixture.json",
        fingerprint: "synthetic-document",
        durationMs: 1,
        rendererVersion: RENDERER_VERSION,
        templateIdentity: detail.checkpoint.templateIdentity,
        validationPassed: true,
        objectDigests: {
          text: textDigest,
          tex: "a".repeat(64),
          pdf: "b".repeat(64),
          report: "c".repeat(64),
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
