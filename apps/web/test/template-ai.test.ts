import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ArtifactManifest, StartTemplateAiRequest } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import { canonicalJson, newId, type Principal } from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  fixedPack,
  graphInventory,
  type TemplateAiOutput,
  type TemplateAiProfile,
} from "@river/templates";
import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it, vi } from "vitest";
import { cleanRejectedTemplatePreviews } from "../src/server/template-ai-cleanup";
import { generateTemplateCandidate } from "../src/server/template-ai-provider";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const profile: TemplateAiProfile = {
  contract: "river-template-generation-v1",
  model: "gpt-5.4-mini-2026-03-17",
  maxInputCharacters: 160000,
  maxOutputTokens: 12000,
  timeoutMs: 60000,
};
const output: TemplateAiOutput = {
  source: fixedPack("classic").document.source,
  overrides: { font: "Latin Modern Sans", bodySize: 10, sectionSpacing: null, margin: null },
  explanation: "Synthetic candidate explanation; use sans-serif headings and body.",
};
async function fixture() {
  const repository = createRepository(env.DB),
    id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "Private owner name excluded from input",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const request: StartTemplateAiRequest = {
    reservedDesignId: newId(),
    expectedInputDigest: null,
    id: null,
    revision: null,
    name: "Synthetic AI template fixture",
    base: { kind: "fixed", theme: "classic" },
    scope: { level: "document", type: null },
    brief: {
      structure: "Single column",
      density: "Compact",
      character: "Quiet sans-serif hierarchy",
      constraints: "Keep every content slot",
    },
    idempotencyKey: "generate",
  };
  const start = async (input = request) => {
    const captured = { ...input, reservedDesignId: input.id ?? input.reservedDesignId };
    const preview = await repository.previewTemplateAi(actor, captured);
    const result = await repository.startTemplateAi(
      actor,
      { ...captured, expectedInputDigest: preview.digest },
      profile,
    );
    if (!result.revisionId) throw Error("Missing operation");
    return { id: result.id, operationId: result.revisionId };
  };
  const candidate = async (input = request) => {
    const task = await start(input);
    await repository.publishTemplateCandidate(id, task.id, task.operationId, output);
    return task;
  };
  const preview = async (taskId: string, operationId: string, passed = true) => {
    const detail = await repository.inspectTemplateAi(id, taskId);
    if (!detail.proposal?.payload) throw Error("Missing candidate");
    const prefix = `transient/template-proposals/${taskId}/${operationId}`;
    const artifacts: ArtifactManifest = {
      pdf: `${prefix}/pdf`,
      tex: `${prefix}/tex`,
      text: `${prefix}/text`,
      report: `${prefix}/report`,
      expiresAt: Date.now() + 7 * 86400000,
      fingerprint: "a".repeat(64),
      rendererVersion: CUSTOM_RENDERER_VERSION,
      durationMs: 1,
      resources: {
        compiler: "fixture",
        bundle: "fixture",
        fonts: "fixture",
        cacheDigest: "fixture",
      },
      validationPassed: passed,
      templateIdentity: canonicalJson(graphInventory(detail.proposal.payload.graph)),
    };
    await repository.publishTemplateCandidatePreview(
      id,
      taskId,
      operationId,
      artifacts,
      "b".repeat(64),
    );
    return artifacts;
  };
  const review = async (taskId: string) => {
    const detail = await repository.inspectTemplateAi(id, taskId),
      p = detail.proposal;
    if (!p) throw Error("Missing proposal");
    return {
      id: p.id,
      revision: p.revision,
      digest: p.digest,
      previewOperationId: p.previewOperationId,
      previewDigest: p.previewDigest,
      decision: "Accepted" as const,
      idempotencyKey: "accept",
    };
  };
  return { repository, actor, request, start, candidate, preview, review };
}
it("preserves ordered conversation inputs, explicitly selected rejected instructions and independent accepted bases", async () => {
  const f = await fixture();
  const first = await f.candidate();
  await f.preview(first.id, first.operationId);
  const accepted = await f.repository.reviewTemplateAi(f.actor, await f.review(first.id));
  if (!accepted.revisionId) throw Error("Missing accepted base");
  const root = await f.repository.inspectTemplate(f.actor.id, accepted.revisionId);
  const read = (scope = f.request.scope) =>
    f.repository.readTemplateConversation(f.actor.id, { id: root.design.id, before: null, scope });
  expect((await read()).defaultTaskIds).toEqual([first.id]);
  const originalInstruction = (await read()).items[0]?.instruction;
  const secondInput: StartTemplateAiRequest = {
    ...f.request,
    id: root.design.id,
    revision: root.design.revision,
    base: { kind: "saved", revisionId: root.revision.id },
    reservedDesignId: root.design.id,
    idempotencyKey: "second-turn",
    conversation: {
      id: root.design.id,
      revision: 1,
      instruction: "Try more space above sections.",
      priorTaskIds: [first.id],
    },
  };
  const second = await f.candidate(secondInput);
  const captured = (await f.repository.inspectTemplateAi(f.actor.id, second.id)).task.input;
  expect(captured.conversation).toMatchObject({
    turn: 2,
    instruction: secondInput.conversation?.instruction,
    priorInstructions: [{ taskId: first.id, instruction: originalInstruction }],
  });
  expect(canonicalJson(captured)).not.toContain(output.explanation);
  expect(captured.baseGraph).toEqual(root.revision.graph);
  await f.repository.reviewTemplateAi(f.actor, {
    ...(await f.review(second.id)),
    decision: "Rejected",
    idempotencyKey: "reject-turn-two",
  });
  const history = await read();
  expect(history.items.map((item) => [item.position, item.state])).toEqual([
    [2, "Rejected"],
    [1, "Accepted"],
  ]);
  expect(history.defaultTaskIds).toEqual([first.id]);
  expect(canonicalJson(history)).not.toContain(output.explanation);
  expect((await read({ level: "block", type: "skill" })).defaultTaskIds).toEqual([]);
  const thirdInput: StartTemplateAiRequest = {
    ...secondInput,
    idempotencyKey: "third-turn",
    conversation: {
      id: root.design.id,
      revision: 2,
      instruction: "Use the earlier spacing instruction as context only.",
      priorTaskIds: [second.id, first.id],
    },
  };
  const third = await f.start(thirdInput);
  const thirdCaptured = (await f.repository.inspectTemplateAi(f.actor.id, third.id)).task.input;
  expect(thirdCaptured.conversation?.priorInstructions.map((item) => item.taskId)).toEqual([
    first.id,
    second.id,
  ]);
  expect(thirdCaptured.conversation?.priorInstructions[1]?.instruction).toBe(
    secondInput.conversation?.instruction,
  );
  expect(thirdCaptured.baseGraph).toEqual(root.revision.graph);
  expect(
    (await f.repository.inspectTemplateAi(f.actor.id, second.id)).proposal?.payload,
  ).toBeNull();
  await expect(
    f.repository.readTemplateConversation(newId(), {
      id: root.design.id,
      before: null,
      scope: f.request.scope,
    }),
  ).rejects.toMatchObject({ code: "NotFound" });
  const other = await fixture();
  const otherTask = await other.start();
  if (!thirdInput.conversation) throw Error("Missing conversation input");
  await expect(
    f.repository.previewTemplateAi(f.actor, {
      ...thirdInput,
      conversation: { ...thirdInput.conversation, revision: 3, priorTaskIds: [otherTask.id] },
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(
    f.repository.previewTemplateAi(f.actor, {
      ...f.request,
      reservedDesignId: other.request.reservedDesignId,
      conversation: {
        id: other.request.reservedDesignId,
        revision: 0,
        instruction: "Attempt a foreign input preview",
        priorTaskIds: [otherTask.id],
      },
    }),
  ).rejects.toMatchObject({ code: "NotFound" });
});
it("commits one concurrent conversation turn and prevents stale preflight from writing an operation or receipt", async () => {
  const f = await fixture();
  const first = await f.start();
  await f.repository.db
    .update(schema.operations)
    .set({ state: "Failed" })
    .where(eq(schema.operations.id, first.operationId));
  const input: StartTemplateAiRequest = {
    ...f.request,
    idempotencyKey: "parallel-turn",
    conversation: {
      id: f.request.reservedDesignId,
      revision: 1,
      instruction: "Keep the margins and change the font.",
      priorTaskIds: [],
    },
  };
  const preview = await f.repository.previewTemplateAi(f.actor, input);
  const request = { ...input, expectedInputDigest: preview.digest };
  const results = await Promise.allSettled([
    f.repository.startTemplateAi(f.actor, request, profile),
    f.repository.startTemplateAi(
      f.actor,
      { ...request, idempotencyKey: "parallel-other" },
      profile,
    ),
  ]);
  expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(
    (
      await f.repository.readTemplateConversation(f.actor.id, {
        id: f.request.reservedDesignId,
        before: null,
        scope: input.scope,
      })
    ).items.map((item) => item.position),
  ).toEqual([2, 1]);
  const operations = await f.repository.db
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.ownerId, f.actor.id));
  expect(operations).toHaveLength(2);
  const winnerRequest =
    results[0]?.status === "fulfilled" ? request : { ...request, idempotencyKey: "parallel-other" };
  expect(await f.repository.startTemplateAi(f.actor, winnerRequest, null)).toEqual(
    results.find((item) => item.status === "fulfilled")?.value,
  );
  await expect(
    f.repository.startTemplateAi(
      f.actor,
      { ...request, idempotencyKey: "obsolete-preflight" },
      profile,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(
    await f.repository.db
      .select()
      .from(schema.receipts)
      .where(
        and(eq(schema.receipts.actorId, f.actor.id), eq(schema.receipts.key, "obsolete-preflight")),
      ),
  ).toHaveLength(0);
});
it("paginates prior turns and blocks complete over-limit input without truncating selected instructions", async () => {
  const f = await fixture();
  const ids: string[] = [];
  for (let index = 0; index < 22; index++) {
    const task = await f.start({
      ...f.request,
      idempotencyKey: `history-${index}`,
      conversation: {
        id: f.request.reservedDesignId,
        revision: index,
        instruction: `${index}: ${"Layout instruction. ".repeat(399)}`,
        priorTaskIds: [],
      },
    });
    ids.push(task.id);
    await f.repository.db
      .update(schema.operations)
      .set({ state: "Failed" })
      .where(eq(schema.operations.id, task.operationId));
  }
  const firstPage = await f.repository.readTemplateConversation(f.actor.id, {
    id: f.request.reservedDesignId,
    before: null,
    scope: f.request.scope,
  });
  expect(firstPage.items).toHaveLength(20);
  expect(firstPage.nextBefore).toBe(3);
  const earlier = await f.repository.readTemplateConversation(f.actor.id, {
    id: f.request.reservedDesignId,
    before: firstPage.nextBefore,
    scope: f.request.scope,
  });
  expect(earlier.items.map((item) => item.position)).toEqual([2, 1]);
  const request: StartTemplateAiRequest = {
    ...f.request,
    idempotencyKey: "over-limit-turn",
    conversation: {
      id: f.request.reservedDesignId,
      revision: 22,
      instruction: "Keep every selected instruction in context.",
      priorTaskIds: ids,
    },
  };
  const preview = await f.repository.previewTemplateAi(f.actor, request);
  expect(preview.characters).toBe(canonicalJson(preview.input).length);
  expect(preview.characters).toBeGreaterThan(160000);
  expect(preview.allowed).toBe(false);
  expect(preview.input.conversation?.priorInstructions).toHaveLength(22);
  await expect(
    f.repository.startTemplateAi(
      f.actor,
      { ...request, expectedInputDigest: preview.digest },
      profile,
    ),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect(
    (
      await f.repository.readTemplateConversation(f.actor.id, {
        id: f.request.reservedDesignId,
        before: null,
        scope: f.request.scope,
      })
    ).revision,
  ).toBe(22);
});
it("captures only template inputs and synthetic fixtures, persists before rendering, and requires exact preview before atomic Draft acceptance", async () => {
  const f = await fixture(),
    task = await f.candidate();
  const before = await f.repository.inspectTemplateAi(f.actor.id, task.id);
  expect(canonicalJson(before.task.input)).not.toContain("Private owner name");
  expect(before.task.input.fixtureSet.fixtures.map((item) => item.id)).toEqual([
    "all-types",
    "unicode",
    "long-content",
    "repeated-order",
  ]);
  expect(before.proposal?.payload?.graph.blocks).toEqual(before.task.input.baseGraph.blocks);
  expect(before.proposal?.payload?.graph.sections).toEqual(before.task.input.baseGraph.sections);
  expect(
    (await f.repository.listTemplates(f.actor.id, { state: null, offset: 0 })).items,
  ).toHaveLength(0);
  await expect(
    f.repository.reviewTemplateAi(f.actor, await f.review(task.id)),
  ).rejects.toMatchObject({ code: "Conflict" });
  await f.preview(task.id, task.operationId);
  const request = await f.review(task.id);
  await expect(
    f.repository.reviewTemplateAi(f.actor, {
      ...request,
      previewOperationId: newId(),
      idempotencyKey: "wrong-preview",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const results = await Promise.allSettled([
    f.repository.reviewTemplateAi(f.actor, request),
    f.repository.reviewTemplateAi(f.actor, { ...request, idempotencyKey: "competing" }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const winner = results.find((result) => result.status === "fulfilled");
  if (winner?.status !== "fulfilled" || !winner.value.revisionId)
    throw Error("Missing accepted Draft");
  const accepted = await f.repository.inspectTemplate(f.actor.id, winner.value.revisionId);
  expect(accepted.revision.state).toBe("Draft");
  expect(accepted.revision.graph).toEqual(before.proposal?.payload?.graph);
  expect(accepted.revision.graph.document.manifest.id).toBe(before.task.input.destination.id);
  expect((await f.repository.inspectTemplateAi(f.actor.id, task.id)).staleReasons).toEqual([]);
  const winnerRequest =
    results[0]?.status === "fulfilled" ? request : { ...request, idempotencyKey: "competing" };
  expect(await f.repository.reviewTemplateAi(f.actor, winnerRequest)).toEqual(winner.value);
  const listed = await f.repository.listTemplateAi(f.actor.id, {
    designId: accepted.design.id,
    state: "Accepted",
    offset: 0,
  });
  expect(listed.items.map((item) => item.id)).toEqual([task.id]);
  expect(listed.counts).toEqual([{ state: "Accepted", count: 1 }]);
});
it("bounds preview retries independently, reuses the candidate without a provider, and consumes each expired-preview refresh once", async () => {
  const f = await fixture(),
    task = await f.candidate();
  const original = await f.repository.inspectTemplateAi(f.actor.id, task.id);
  await f.preview(task.id, task.operationId);
  const oldReview = await f.review(task.id);
  const expire = async () => {
    const p = (await f.repository.inspectTemplateAi(f.actor.id, task.id)).proposal;
    if (!p?.previewArtifacts) throw Error("Missing artifacts");
    await f.repository.db
      .update(schema.templateAiProposals)
      .set({ previewArtifacts: { ...p.previewArtifacts, expiresAt: Date.now() - 1000 } })
      .where(eq(schema.templateAiProposals.id, p.id));
  };
  await expire();
  await expect(f.repository.reviewTemplateAi(f.actor, oldReview)).rejects.toMatchObject({
    code: "Conflict",
  });
  for (let i = 1; i <= 3; i++) {
    const prior = await f.repository.inspectTemplateAi(f.actor.id, task.id);
    const retried = await f.repository.retryTemplateAi(
      f.actor,
      { id: task.id, revision: prior.task.revision, idempotencyKey: `preview-${i}` },
      null,
      true,
    );
    if (!retried.revisionId) throw Error("Missing retry");
    const current = await f.repository.inspectTemplateAi(f.actor.id, task.id);
    expect(current.task.attempts).toBe(1);
    expect(current.proposal?.previewAttempts).toBe(i);
    expect(current.proposal?.payload).toEqual(original.proposal?.payload);
    expect(current.proposal?.digest).toBe(original.proposal?.digest);
    expect(current.proposal?.previewArtifacts).toBeNull();
    expect(
      await f.repository.publishTemplateCandidatePreview(
        f.actor.id,
        task.id,
        task.operationId,
        await f.preview(task.id, retried.revisionId, false),
        "c".repeat(64),
      ),
    ).toBe(false);
  }
  const exhausted = await f.repository.inspectTemplateAi(f.actor.id, task.id);
  await expect(
    f.repository.retryTemplateAi(
      f.actor,
      { id: task.id, revision: exhausted.task.revision, idempotencyKey: "fourth" },
      null,
      true,
    ),
  ).rejects.toMatchObject({ code: "Unavailable" });
  await expect(f.repository.reviewTemplateAi(f.actor, oldReview)).rejects.toMatchObject({
    code: "Conflict",
  });
});
it("rejects stale base acceptance without dependent writes and removes rejected generated payloads and preview objects", async () => {
  const f = await fixture();
  const base = await f.repository.saveTemplate(f.actor, {
    id: null,
    revision: null,
    name: "Base",
    base: f.request.base,
    scope: f.request.scope,
    source: output.source,
    overrides: {},
    idempotencyKey: "base",
  });
  if (!base.revisionId) throw Error("Missing base");
  const task = await f.candidate({
    ...f.request,
    id: base.id,
    revision: 0,
    base: { kind: "saved", revisionId: base.revisionId },
  });
  const artifacts = await f.preview(task.id, task.operationId),
    review = await f.review(task.id);
  await f.repository.saveTemplate(f.actor, {
    id: base.id,
    revision: 0,
    name: "Concurrent edit",
    base: { kind: "saved", revisionId: base.revisionId },
    scope: f.request.scope,
    source: output.source,
    overrides: { bodySize: 11 },
    idempotencyKey: "concurrent",
  });
  await expect(f.repository.reviewTemplateAi(f.actor, review)).rejects.toMatchObject({
    code: "Conflict",
  });
  expect((await f.repository.inspectTemplate(f.actor.id, base.revisionId)).revisions).toHaveLength(
    2,
  );
  expect(
    await f.repository.db
      .select()
      .from(schema.receipts)
      .where(and(eq(schema.receipts.key, "accept"), eq(schema.receipts.actorId, f.actor.id))),
  ).toHaveLength(0);
  for (const key of [artifacts.pdf, artifacts.tex, artifacts.text, artifacts.report])
    await env.ARTIFACTS.put(key, "Generated candidate fixture");
  await f.repository.reviewTemplateAi(f.actor, {
    ...review,
    decision: "Rejected",
    idempotencyKey: "reject",
  });
  await cleanRejectedTemplatePreviews(env);
  const rejected = await f.repository.inspectTemplateAi(f.actor.id, task.id);
  expect(rejected.proposal?.payload).toBeNull();
  expect(rejected.proposal?.previewArtifacts).toBeNull();
  expect(await env.ARTIFACTS.get(artifacts.pdf)).toBeNull();
  expect(
    canonicalJson({
      history: await f.repository.activity(f.actor.id),
      task: rejected.task,
      operation: rejected.operation,
    }),
  ).not.toContain(output.explanation);
  expect(
    await f.repository.publishTemplateCandidatePreview(
      f.actor.id,
      task.id,
      task.operationId,
      artifacts,
      "b".repeat(64),
    ),
  ).toBe(false);
});
it("denies external agents, rejects prohibited output, ignores cancelled callbacks, and pins a strict bounded provider request", async () => {
  const f = await fixture();
  await expect(
    f.repository.startTemplateAi(
      { kind: "agent", id: newId(), ownerId: f.actor.id, scopes: [] },
      f.request,
      profile,
    ),
  ).rejects.toMatchObject({ code: "Forbidden" });
  const task = await f.start();
  await expect(
    f.repository.publishTemplateCandidate(f.actor.id, task.id, task.operationId, {
      ...output,
      source: `${output.source}\\input{private}`,
    }),
  ).rejects.toThrow();
  expect((await f.repository.inspectTemplateAi(f.actor.id, task.id)).proposal).toBeNull();
  const detail = await f.repository.inspectTemplateAi(f.actor.id, task.id);
  let calls = 0;
  const generated = await generateTemplateCandidate(
    "synthetic-key",
    detail.task.input,
    profile,
    async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: profile.model,
        store: false,
        stream: false,
        truncation: "disabled",
        max_output_tokens: 12000,
        text: {
          format: {
            name: "template_component",
            strict: true,
            schema: { additionalProperties: false },
          },
        },
      });
      expect(canonicalJson(body)).not.toContain("Private owner name");
      return Response.json({
        id: "synthetic",
        object: "response",
        created_at: 1,
        model: profile.model,
        status: "completed",
        output: [
          {
            id: "synthetic-message",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
          },
        ],
      });
    },
  );
  expect(generated).toEqual(output);
  expect(calls).toBe(1);
  await f.repository.cancelOperation(f.actor.id, task.operationId, "cancel");
  expect(
    await f.repository.publishTemplateCandidate(f.actor.id, task.id, task.operationId, output),
  ).toBeNull();
});
it("pins the reviewed input and prevents a preview expiring between preparation and the atomic commit", async () => {
  const f = await fixture();
  const preview = await f.repository.previewTemplateAi(f.actor, f.request);
  await expect(
    f.repository.startTemplateAi(
      f.actor,
      {
        ...f.request,
        expectedInputDigest: preview.digest,
        brief: { ...f.request.brief, character: "Changed after review" },
      },
      profile,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  const task = await f.candidate();
  await f.preview(task.id, task.operationId);
  const review = await f.review(task.id),
    detail = await f.repository.inspectTemplateAi(f.actor.id, task.id);
  const originalBatch = f.repository.db.batch.bind(f.repository.db);
  const batch = vi.spyOn(f.repository.db, "batch").mockImplementation(async (statements) => {
    batch.mockRestore();
    const proposal = detail.proposal;
    if (!proposal?.previewArtifacts) throw Error("Missing preview");
    await f.repository.db
      .update(schema.templateAiProposals)
      .set({ previewArtifacts: { ...proposal.previewArtifacts, expiresAt: Date.now() - 1000 } })
      .where(eq(schema.templateAiProposals.id, proposal.id));
    return originalBatch(statements);
  });
  await expect(f.repository.reviewTemplateAi(f.actor, review)).rejects.toMatchObject({
    code: "Conflict",
  });
  expect(
    (await f.repository.listTemplates(f.actor.id, { state: null, offset: 0 })).items,
  ).toHaveLength(0);
  expect((await f.repository.inspectTemplateAi(f.actor.id, task.id)).proposal?.state).toBe(
    "Pending",
  );
});
it("bounds failed generation separately and preserves permanent replay when the profile becomes unavailable", async () => {
  const f = await fixture(),
    task = await f.start();
  let operationId = task.operationId;
  for (let revision = 0; revision < 2; revision++) {
    await f.repository.cancelOperation(f.actor.id, operationId, `cancel-${revision}`);
    const request = { id: task.id, revision, idempotencyKey: `retry-${revision}` };
    const result = await f.repository.retryTemplateAi(f.actor, request, profile, true);
    expect(await f.repository.retryTemplateAi(f.actor, request, null, false)).toEqual(result);
    if (!result.revisionId) throw Error("Missing retry");
    operationId = result.revisionId;
  }
  await f.repository.cancelOperation(f.actor.id, operationId, "final-cancel");
  await expect(
    f.repository.retryTemplateAi(
      f.actor,
      { id: task.id, revision: 2, idempotencyKey: "fourth-generation" },
      profile,
      true,
    ),
  ).rejects.toMatchObject({ code: "Unavailable" });
  const detail = await f.repository.inspectTemplateAi(f.actor.id, task.id);
  expect(detail.task.attempts).toBe(3);
  expect(detail.proposal).toBeNull();
});
