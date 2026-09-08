import { applyD1Migrations, introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ExtractionResult } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import {
  canonicalJson,
  fingerprint,
  indexSourcePassages,
  newId,
  type Principal,
  type SourceAiProfile,
  validateSourceCandidates,
} from "@river/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { beforeAll, expect, it } from "vitest";
import { runEvidenceCommand } from "../src/server/evidence";
import { Actor, Store } from "../src/server/services";
import {
  previewSourceAi,
  queueProcessedSourceEvidence,
  retrySourceAi as retrySourceAiCommand,
  startSourceAi as startSourceAiCommand,
} from "../src/server/source-ai";
import {
  generateSourceCandidates,
  sourceAiOutputSchema,
  sourceAiProfile,
} from "../src/server/source-ai-provider";
import { createSource } from "../src/server/sources";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const profile: SourceAiProfile = {
  connection: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 0, provider: "openai" },
  contract: "river-source-claims-v1",
  model: "gpt-5.4-mini-2026-03-17",
  maxInputCharacters: 160000,
  maxOutputTokens: 12000,
  timeoutMs: 60000,
};
async function fixture(text = "Repeated passage.\nRepeated passage.\n") {
  const repository = createRepository(env.DB),
    id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "Synthetic source AI fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const layer = Layer.merge(Layer.succeed(Actor, actor), Layer.succeed(Store, repository));
  const source = await Effect.runPromise(
    createSource(env, {
      idempotencyKey: "source",
      title: "Synthetic source",
      filename: "fixture.txt",
      mime: "text/plain",
      kind: "attestation",
      provenanceUrl: null,
      note: "Not Owner biographical data",
      contentBase64: btoa(text),
    }).pipe(Effect.provide(layer)),
  );
  const record = await repository.getSource(id, source.id);
  if (!record) throw Error("Missing source");
  const operation = await repository.getOperation(record.operationId);
  if (!operation || !("sourceId" in operation.input)) throw Error("Missing processing result");
  const extraction: ExtractionResult = {
    type: "extracted",
    text,
    parser: "fixture",
    parserVersion: "1",
    segments: [{ text, start: 0, end: text.length, line: 1 }],
  };
  const serialized = JSON.stringify(extraction),
    digest = await fingerprint(serialized),
    objectKey = `fixture/${source.id}/${digest}`;
  await env.ARTIFACTS.put(objectKey, serialized);
  await repository.publishExtraction({
    id: operation.input.processingId,
    sourceId: source.id,
    operationId: operation.id,
    digest,
    objectKey,
    extraction,
  });
  const context = await repository.saveContext(actor, {
    id: null,
    revision: null,
    idempotencyKey: "context",
    data: {
      kind: "Project",
      label: "Synthetic context",
      organization: "Fixture",
      role: "Contributor",
      startDate: "",
      endDate: "",
      details: "Selected context",
      contact: null,
    },
  });
  if (!context.revisionId) throw Error("Missing context revision");
  const request = {
    sourceId: source.id,
    revision: 0,
    processingId: operation.input.processingId,
    focus: "Find supported claims",
    contexts: [{ id: context.id, revisionId: context.revisionId }],
    idempotencyKey: "generate",
  };
  const candidate = {
    material: {
      assertion: "Synthetic claim awaiting review.",
      contexts: request.contexts,
      citations: [
        {
          sourceId: source.id,
          processingId: request.processingId,
          start: 18,
          end: 35,
          quote: "Repeated passage.",
        },
      ],
    },
    metadata: { label: "Synthetic candidate", tags: [], notes: "" },
    explanation: "Fixture proposal",
    questions: ["What was your individual contribution?"],
  };
  const generate = async (key = "generate") => {
    const task = await repository.startSourceAi(
      actor,
      { ...request, idempotencyKey: key },
      profile,
      extraction,
    );
    if (!task.revisionId) throw Error("Missing task operation");
    await repository.publishSourceAi(id, task.id, task.revisionId, {
      candidates: [
        candidate,
        {
          ...candidate,
          material: { ...candidate.material, assertion: "A separately reviewed synthetic claim." },
        },
      ],
    });
    const detail = await repository.inspectSourceAi(id, task.id),
      first = detail.candidates[0],
      second = detail.candidates[1];
    if (!first || !second) throw Error("Missing candidates");
    const review = {
      id: first.id,
      revision: 0,
      digest: first.digest,
      decision: "Accepted" as const,
      idempotencyKey: `accept-${key}`,
    };
    return { task, detail, first, second, review };
  };
  return {
    repository,
    actor,
    layer,
    source,
    request,
    extraction,
    candidate,
    context,
    generate,
    objectKey,
  };
}
it("preserves an unavailable connection failure across a real Workflow step", async () => {
  const { repository, actor, request, extraction } = await fixture();
  const task = await repository.startSourceAi(actor, request, profile, extraction);
  if (!task.revisionId) throw Error("Missing operation");
  if (!env.SOURCE_AI_WORKFLOW) throw Error("Missing source Workflow binding");
  await using workflow = await introspectWorkflowInstance(env.SOURCE_AI_WORKFLOW, task.revisionId);
  await env.SOURCE_AI_WORKFLOW.create({
    id: task.revisionId,
    params: { operationId: task.revisionId },
  });
  await workflow.waitForStatus("errored");
  const detail = await repository.inspectSourceAi(actor.id, task.id);
  expect(detail.operation).toMatchObject({
    state: "Failed",
    failure:
      "This AI connection changed or was removed. Choose an active connection and start a new task.",
  });
  expect(detail.candidates).toEqual([]);
});

it("accepts candidates independently into Draft claims, keeps exact occurrences, and erases rejected payloads", async () => {
  const { repository, actor, source, request, extraction, generate } = await fixture();
  const { task, first, second, review } = await generate();
  expect(await repository.startSourceAi(actor, request, null, extraction)).toEqual(task);
  const outcomes = await Promise.all([
    repository.reviewSourceCandidate(actor, review),
    repository.reviewSourceCandidate(actor, review),
  ]);
  expect(outcomes[0]).toEqual(outcomes[1]);
  const accepted = await repository.inspectSourceAi(actor.id, task.id);
  const claimId = accepted.candidates[0]?.claimId;
  if (!claimId) throw Error("Missing accepted claim");
  const claim = await repository.getClaim(actor.id, claimId);
  expect(claim).toMatchObject({ revision: 0, reviewState: "Draft" });
  const material = await repository.getEvidenceRevision(actor.id, claim?.currentRevisionId ?? "");
  expect(material?.material.citations[0]).toMatchObject({
    start: 18,
    end: 35,
    attestation: true,
    locators: [{ line: 1 }],
  });
  expect(await repository.listClarifications(actor.id, claimId)).toHaveLength(0);
  await repository.reviewSourceCandidate(actor, {
    id: second.id,
    revision: 0,
    digest: second.digest,
    decision: "Rejected",
    idempotencyKey: "reject",
  });
  const final = await repository.inspectSourceAi(actor.id, task.id);
  expect(final.candidates).toEqual([
    expect.objectContaining({ id: first.id, state: "Accepted", claimId }),
    expect.objectContaining({ id: second.id, state: "Rejected", payload: null }),
  ]);
  expect((await repository.listSourceAi(actor.id, source.id, 0)).items[0]).toMatchObject({
    pending: 0,
    accepted: 1,
    rejected: 1,
  });
  const retained = canonicalJson({
    tasks: final.task,
    activity: await repository.activity(actor.id),
    receipts: await repository.db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.actorId, actor.id)),
  });
  expect(retained).not.toContain("A separately reviewed synthetic claim.");
  expect((await repository.getSource(actor.id, source.id))?.revision).toBe(0);
});
it("rejects stale source or context acceptance atomically while allowing rejection", async () => {
  for (const changed of ["source", "context"]) {
    const { repository, actor, source, context, generate } = await fixture();
    const { task, first, review } = await generate();
    if (changed === "source")
      await repository.retrySource(actor, {
        id: source.id,
        revision: 0,
        idempotencyKey: "reprocess",
      });
    else
      await repository.saveContext(actor, {
        id: context.id,
        revision: 0,
        idempotencyKey: "change-context",
        data: {
          kind: "Project",
          label: "Changed",
          organization: "Fixture",
          role: "Contributor",
          startDate: "",
          endDate: "",
          details: "Changed context",
          contact: null,
        },
      });
    const history = await repository.activity(actor.id);
    await expect(repository.reviewSourceCandidate(actor, review)).rejects.toMatchObject({
      code: "Conflict",
    });
    expect(
      await repository.db.select().from(schema.claims).where(eq(schema.claims.ownerId, actor.id)),
    ).toHaveLength(0);
    expect(await repository.activity(actor.id)).toEqual(history);
    expect((await repository.inspectSourceAi(actor.id, task.id)).staleReasons).not.toEqual([]);
    await repository.reviewSourceCandidate(actor, {
      ...review,
      id: first.id,
      decision: "Rejected",
      idempotencyKey: "reject-stale",
    });
  }
});
it("allows independent manual drafts with origin audit and requires a new cited revision before answering", async () => {
  const { repository, actor, layer, source, generate } = await fixture();
  const { task, first, review } = await generate();
  if (!first.payload) throw Error("Missing payload");
  const manual = await Effect.runPromise(
    runEvidenceCommand(env, {
      type: "create",
      material: { ...first.payload.material, assertion: "Owner-edited synthetic candidate." },
      metadata: first.payload.metadata,
      originCandidate: { id: first.id, digest: first.digest },
      idempotencyKey: "manual",
    }).pipe(Effect.provide(layer)),
  );
  expect((await repository.inspectSourceAi(actor.id, task.id)).candidates[0]?.state).toBe(
    "Pending",
  );
  expect(canonicalJson(await repository.activity(actor.id))).toContain(first.digest);
  await repository.reviewSourceCandidate(actor, review);
  const accepted = (await repository.inspectSourceAi(actor.id, task.id)).candidates[0];
  if (!accepted?.claimId || !accepted.evidenceRevisionId) throw Error("Missing accepted claim");
  expect(accepted.claimId).not.toBe(manual.id);
  // Seed a historical clarification: v1.2 never creates new clarification workflows.
  await repository.db.insert(schema.clarificationRequests).values({
    id: newId(),
    ownerId: actor.id,
    candidateId: first.id,
    claimId: accepted.claimId,
    evidenceRevisionId: accepted.evidenceRevisionId,
    question: "Historical clarification",
    createdAt: Date.now(),
  });
  const [question] = await repository.listClarifications(actor.id, accepted.claimId);
  if (!question) throw Error("Missing question");
  const answer = {
    id: question.id,
    revision: 0,
    claimRevision: 0,
    answerSourceId: source.id,
    answerEvidenceRevisionId: accepted.evidenceRevisionId,
    idempotencyKey: "answer",
  };
  await expect(repository.answerClarification(actor, answer)).rejects.toMatchObject({
    code: "InvalidInput",
  });
  const edited = await repository.editEvidence(
    actor,
    {
      id: accepted.claimId,
      revision: 0,
      material: { ...first.payload.material, assertion: "Clarified synthetic contribution." },
      idempotencyKey: "clarify-material",
    },
    { ...first.payload.material, assertion: "Clarified synthetic contribution." },
  );
  if (!edited.revisionId) throw Error("Missing material revision");
  const validAnswer = { ...answer, claimRevision: 1, answerEvidenceRevisionId: edited.revisionId };
  const saved = await repository.answerClarification(actor, validAnswer);
  expect(await repository.answerClarification(actor, validAnswer)).toEqual(saved);
  expect((await repository.listClarifications(actor.id, accepted.claimId))[0]).toMatchObject({
    answerSourceId: source.id,
    answerEvidenceRevisionId: edited.revisionId,
    revision: 1,
  });
  expect((await repository.getClaim(actor.id, accepted.claimId))?.reviewState).toBe("Draft");
});
it("validates complete batches, exact citations, context identities, and empty successful output", async () => {
  const { repository, actor, request, extraction, candidate } = await fixture();
  const task = await repository.startSourceAi(actor, request, profile, extraction);
  if (!task.revisionId) throw Error("Missing operation");
  const { task: captured } = await repository.inspectSourceAi(actor.id, task.id);
  for (const invalid of [
    { ...candidate, material: { ...candidate.material, citations: [] } },
    {
      ...candidate,
      material: { ...candidate.material, contexts: [{ id: newId(), revisionId: newId() }] },
    },
    {
      ...candidate,
      material: {
        ...candidate.material,
        citations: candidate.material.citations.map((c) => ({ ...c, quote: "Not in source" })),
      },
    },
    { ...candidate, questions: ["   "] },
  ])
    expect(() =>
      validateSourceCandidates(captured.input, { candidates: [candidate, invalid] }),
    ).toThrow();
  await expect(
    repository.publishSourceAi(actor.id, task.id, task.revisionId, {
      candidates: [candidate, { ...candidate, material: { ...candidate.material, citations: [] } }],
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect((await repository.inspectSourceAi(actor.id, task.id)).candidates).toEqual([]);
  expect(
    await repository.publishSourceAi(actor.id, task.id, task.revisionId, { candidates: [] }),
  ).toBe(true);
  expect((await repository.inspectSourceAi(actor.id, task.id)).operation?.state).toBe("Succeeded");
});
it("bounds retries, suppresses cancelled or obsolete output, and forbids agents", async () => {
  const { repository, actor, request, extraction, candidate } = await fixture();
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: actor.id,
    scopes: ["evidence:write"],
  };
  await expect(repository.startSourceAi(agent, request, profile, extraction)).rejects.toMatchObject(
    { code: "Forbidden" },
  );
  let task = await repository.startSourceAi(actor, request, profile, extraction);
  const firstOperation = task.revisionId;
  if (!firstOperation) throw Error("Missing operation");
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!task.revisionId) throw Error("Missing operation");
    await repository.cancelOperation(actor.id, task.revisionId, `cancel-${attempt}`);
    expect(
      await repository.publishSourceAi(actor.id, task.id, task.revisionId, {
        candidates: [candidate],
      }),
    ).toBe(false);
    const retry = { id: task.id, revision: task.revision, idempotencyKey: `retry-${attempt}` };
    if (attempt < 3) task = await repository.retrySourceAi(actor, retry, profile);
    else
      await expect(repository.retrySourceAi(actor, retry, profile)).rejects.toMatchObject({
        code: "Conflict",
      });
  }
  expect(
    await repository.publishSourceAi(actor.id, task.id, firstOperation, {
      candidates: [candidate],
    }),
  ).toBe(false);
  expect((await repository.inspectSourceAi(actor.id, task.id)).candidates).toEqual([]);
});
it("reports the complete preflight size without truncation and checks stored extraction integrity", async () => {
  const { repository, actor, layer, request, extraction, objectKey } = await fixture(
    "x".repeat(160001),
  );
  const captured = await repository.captureSourceAiInput(actor, request, extraction);
  const result = await Effect.runPromise(previewSourceAi(env, request).pipe(Effect.provide(layer)));
  expect(result).toEqual({
    characters: canonicalJson(captured).length,
    limit: 160000,
    allowed: false,
  });
  await expect(repository.startSourceAi(actor, request, profile, extraction)).rejects.toMatchObject(
    { code: "InvalidInput" },
  );
  expect((await repository.listSourceAi(actor.id, request.sourceId, 0)).items).toEqual([]);
  await env.ARTIFACTS.put(objectKey, "altered extraction");
  await expect(
    Effect.runPromise(previewSourceAi(env, request).pipe(Effect.provide(layer))),
  ).rejects.toMatchObject({ code: "Unavailable" });
});

it("captures v2 passage occurrences and atomically publishes exact citations without model offsets", async () => {
  const { repository, actor, request, extraction, candidate } = await fixture();
  const task = await repository.startSourceAi(
    actor,
    request,
    { ...profile, contract: "river-source-claims-v2" },
    extraction,
  );
  if (!task.revisionId) throw Error("Missing operation");
  const captured = await repository.inspectSourceAi(actor.id, task.id);
  expect(captured.task.input.sourceAnchors).toEqual([
    expect.objectContaining({ index: 0, start: 0, end: 17, quote: "Repeated passage." }),
    expect.objectContaining({ index: 1, start: 18, end: 35, quote: "Repeated passage." }),
  ]);
  const anchored = {
    ...candidate,
    material: {
      assertion: candidate.material.assertion,
      contexts: candidate.material.contexts,
      passageIndexes: [1],
    },
  };
  for (const passageIndexes of [[999], [1, 1], []]) {
    await expect(
      repository.publishSourceAi(actor.id, task.id, task.revisionId, {
        candidates: [anchored, { ...anchored, material: { ...anchored.material, passageIndexes } }],
      }),
    ).rejects.toThrow();
    expect((await repository.inspectSourceAi(actor.id, task.id)).candidates).toEqual([]);
  }
  await repository.publishSourceAi(actor.id, task.id, task.revisionId, { candidates: [anchored] });
  const saved = (await repository.inspectSourceAi(actor.id, task.id)).candidates[0];
  expect(saved?.payload?.material.citations).toEqual([
    expect.objectContaining(candidate.material.citations[0]),
  ]);
  expect(saved?.state).toBe("Pending");
  expect(saved?.claimId).toBeNull();
  const corrupted = {
    ...captured.task.input,
    sourceAnchors: captured.task.input.sourceAnchors?.map((anchor) => ({
      ...anchor,
      sourceId: newId(),
    })),
  };
  expect(() => validateSourceCandidates(corrupted, { candidates: [anchored] })).toThrow();
});

it("indexes long and repeated source lines without splitting Unicode or changing whitespace", () => {
  const text = `  résumé 😀\r\n\r\n${"x".repeat(3999)}😀tail\n  résumé 😀\n`;
  const anchors = indexSourcePassages(text, newId(), newId());
  expect(anchors).toHaveLength(4);
  expect(anchors[0]?.quote).toBe("  résumé 😀");
  expect(anchors[3]?.quote).toBe(anchors[0]?.quote);
  expect(anchors[3]?.start).toBeGreaterThan(anchors[0]?.start ?? 0);
  expect(anchors[1]?.quote).toHaveLength(3999);
  expect(anchors[2]?.quote).toBe("😀tail");
  for (const anchor of anchors) expect(text.slice(anchor.start, anchor.end)).toBe(anchor.quote);
});

it("uses the anchored source schema and complete captured input in one bounded provider request", async () => {
  const { repository, actor, request, extraction } = await fixture();
  const input = await repository.captureSourceAiInput(actor, request, extraction);
  const current = sourceAiProfile({
    connection: { id: newId(), revision: 0, provider: "openai" },
    model: profile.model,
  });
  if (!current) throw Error("Missing profile");
  expect(current.contract).toBe("river-source-claims-v3");
  const output = { candidates: [] };
  let calls = 0;
  const result = await generateSourceCandidates(
    "synthetic-test-key",
    input,
    current,
    async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      expect(JSON.parse(body.input[0].content[0].text).sourceAnchors).toEqual(input.sourceAnchors);
      expect(body.instructions).toContain("Do not invent indexes");
      expect(body.instructions).toContain("skills throughout");
      expect(body.store).toBe(false);
      expect(body.truncation).toBe("disabled");
      const material = body.text.format.schema.properties.candidates.items.properties.material;
      expect(material.required).toContain("passageIndexes");
      expect(material.properties).not.toHaveProperty("citations");
      return Response.json({
        id: "resp_fixture",
        object: "response",
        created_at: 1,
        model: current.model,
        status: "completed",
        output: [
          {
            type: "message",
            id: "msg_fixture",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
          },
        ],
      });
    },
  );
  expect(result).toEqual(output);
  expect(calls).toBe(1);
  for (const contract of ["river-source-claims-v1", "river-source-claims-v2"] as const)
    expect(JSON.stringify(sourceAiOutputSchema(contract))).not.toMatch(
      /"(?:allOf|not|if|then|else)":/,
    );
});

it("restricts generated context references to the exact selection, including no selection", async () => {
  const { repository, actor, request, extraction } = await fixture();
  const input = await repository.captureSourceAiInput(actor, request, extraction);
  const first = input.contexts[0];
  if (!first) throw Error("Missing selected context");
  const contexts = [first, { ...first, id: newId(), revisionId: newId() }];
  const expected = (references: unknown) => ({
    properties: {
      candidates: {
        items: { properties: { material: { properties: { contexts: references } } } },
      },
    },
  });
  for (const contract of ["river-source-claims-v1", "river-source-claims-v2"] as const) {
    expect(sourceAiOutputSchema(contract, { ...input, contexts: [] })).toMatchObject(
      expected({ type: "array", maxItems: 0 }),
    );
    expect(sourceAiOutputSchema(contract, { ...input, contexts })).toMatchObject(
      expected({
        type: "array",
        maxItems: 2,
        items: {
          anyOf: contexts.map(({ id, revisionId }) => ({
            properties: { id: { enum: [id] }, revisionId: { enum: [revisionId] } },
          })),
        },
      }),
    );
  }
});

it("commits one competing decision, prevents cross-owner review, and rolls back dependent claim writes", async () => {
  const { repository, actor, generate } = await fixture();
  const { task, first, review } = await generate();
  const stranger = await fixture();
  await expect(repository.reviewSourceCandidate(stranger.actor, review)).rejects.toMatchObject({
    code: "NotFound",
  });
  const outcomes = await Promise.allSettled([
    repository.reviewSourceCandidate(actor, review),
    repository.reviewSourceCandidate(actor, { ...review, idempotencyKey: "competing-accept" }),
  ]);
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((result) => result.status === "rejected")).toEqual([
    expect.objectContaining({ reason: expect.objectContaining({ code: "Conflict" }) }),
  ]);
  const claims = await repository.db
    .select()
    .from(schema.claims)
    .where(eq(schema.claims.ownerId, actor.id));
  expect(claims).toHaveLength(1);
  expect((await repository.inspectSourceAi(actor.id, task.id)).candidates[0]).toMatchObject({
    id: first.id,
    revision: 1,
    state: "Accepted",
  });
  const receipts = await repository.db
    .select()
    .from(schema.receipts)
    .where(eq(schema.receipts.actorId, actor.id));
  expect(receipts.filter((receipt) => receipt.command === "review-source-candidate")).toHaveLength(
    1,
  );
});

it("adds the edited complete extraction beyond twenty items once and atomically rejects stale batches", async () => {
  const { repository, actor, request, extraction, candidate } = await fixture();
  const task = await repository.startSourceAi(actor, request, profile, extraction);
  if (!task.revisionId) throw Error("Missing operation");
  await repository.publishSourceAi(actor.id, task.id, task.revisionId, {
    candidates: Array.from({ length: 27 }, (_, index) => ({
      ...candidate,
      material: { ...candidate.material, assertion: `Supported fixture item ${index + 1}` },
      metadata: { ...candidate.metadata, type: index === 0 ? "Skill" : "Achievement" },
    })),
  });
  const detail = await repository.inspectSourceAi(actor.id, task.id);
  const items = detail.candidates.map((item) => {
    if (!item.payload) throw Error("Missing item");
    return {
      id: item.id,
      revision: item.revision,
      digest: item.digest,
      assertion: item.ordinal === 0 ? "TypeScript" : item.payload.material.assertion,
      metadata: { ...item.payload.metadata, tags: ["edited"] },
    };
  });
  await expect(
    repository.addSourceEvidence(actor, {
      taskId: task.id,
      mode: "all",
      items: items.slice(0, 20),
      idempotencyKey: "incomplete-all",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    repository.addSourceEvidence(actor, {
      taskId: task.id,
      mode: "all",
      items: items.map((item, index) => (index === 26 ? { ...item, revision: 4 } : item)),
      idempotencyKey: "stale",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(
    (
      await repository.searchEvidence(actor.id, {
        query: "",
        status: "All",
        archived: false,
        contextId: null,
        offset: 0,
      })
    ).total,
  ).toBe(0);
  const command = { taskId: task.id, mode: "all" as const, items, idempotencyKey: "add-all" };
  const saved = await Promise.all([
    repository.addSourceEvidence(actor, command),
    repository.addSourceEvidence(actor, command),
  ]);
  expect(saved[0]).toEqual(saved[1]);
  expect(
    (
      await repository.searchEvidence(actor.id, {
        query: "",
        status: "All",
        archived: false,
        contextId: null,
        offset: 0,
      })
    ).total,
  ).toBe(27);
  const skills = await repository.searchEvidence(actor.id, {
    query: "",
    type: "Skill",
    status: "All",
    archived: false,
    contextId: null,
    offset: 0,
  });
  expect(skills.items[0]).toMatchObject({
    assertion: "TypeScript",
    metadata: { tags: ["edited"], type: "Skill" },
  });
  expect(
    (await repository.inspectSourceAi(actor.id, task.id)).candidates.every(
      (item) => item.state === "Accepted",
    ),
  ).toBe(true);
  expect(
    await repository.db
      .select()
      .from(schema.clarificationRequests)
      .where(eq(schema.clarificationRequests.ownerId, actor.id)),
  ).toEqual([]);
});

it("deleting a source preserves material and invalidates unaccepted extraction results", async () => {
  const { repository, actor, source, generate } = await fixture();
  const { task, first } = await generate();
  if (!first.payload) throw Error("Missing payload");
  const archived = await repository.archiveSource(actor, {
    id: source.id,
    revision: 0,
    archived: true,
    idempotencyKey: "delete-source",
  });
  const current = await repository.getSource(actor.id, source.id);
  expect(current?.archivedAt).not.toBeNull();
  expect(await env.ARTIFACTS.get(current?.objectKey ?? "")).not.toBeNull();
  const item = {
    id: first.id,
    revision: first.revision,
    digest: first.digest,
    assertion: first.payload.material.assertion,
    metadata: first.payload.metadata,
  };
  await expect(
    repository.addSourceEvidence(actor, {
      taskId: task.id,
      mode: "selected",
      items: [item],
      idempotencyKey: "stale-deleted-source",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await repository.archiveSource(actor, {
    id: source.id,
    revision: archived.revision,
    archived: false,
    idempotencyKey: "restore-source",
  });
  expect((await repository.getSource(actor.id, source.id))?.archivedAt).toBeNull();
  expect((await repository.inspectSourceAi(actor.id, task.id)).candidates[0]?.state).toBe(
    "Pending",
  );
});

it("queues extraction from the saved personal model once and suppresses cancelled automatic output", async () => {
  const { repository, actor, source, request, candidate } = await fixture();
  expect(
    await queueProcessedSourceEvidence(env, repository, actor.id, source.id, request.processingId),
  ).toBeUndefined();
  const connectionId = newId();
  await repository.db.insert(schema.aiConnections).values({
    id: connectionId,
    ownerId: actor.id,
    provider: "openai",
    encryptedKey: "synthetic-unused-key",
    keySuffix: "test",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await repository.db
    .update(schema.sources)
    .set({ extractionAi: { connectionId, model: "selected-fixture-model" } })
    .where(eq(schema.sources.id, source.id));
  const configuredEnv = { ...env, AI_CREDENTIAL_ENCRYPTION_KEY: "synthetic-fixture-key" };
  const task = await queueProcessedSourceEvidence(
    configuredEnv,
    repository,
    actor.id,
    source.id,
    request.processingId,
  );
  if (!task?.revisionId) throw Error("Automatic task missing");
  await repository.db
    .update(schema.aiConnections)
    .set({ removedAt: Date.now(), encryptedKey: null })
    .where(eq(schema.aiConnections.id, connectionId));
  expect(
    await queueProcessedSourceEvidence(
      configuredEnv,
      repository,
      actor.id,
      source.id,
      request.processingId,
    ),
  ).toEqual(task);
  expect((await repository.inspectSourceAi(actor.id, task.id)).task.profile).toMatchObject({
    model: "selected-fixture-model",
    connection: { id: connectionId },
  });
  await repository.cancelOperation(actor.id, task.revisionId, "cancel-automatic");
  expect(
    await repository.publishSourceAi(actor.id, task.id, task.revisionId, {
      candidates: [candidate],
    }),
  ).toBe(false);
  expect((await repository.inspectSourceAi(actor.id, task.id)).candidates).toEqual([]);
});

it("includes every passage group and stops making provider calls after cancellation", async () => {
  const text = `${"Implemented web features with TypeScript. ".repeat(500)}Used PostgreSQL for project storage.`;
  const { repository, actor, request, extraction } = await fixture(text);
  const input = await repository.captureSourceAiInput(actor, request, extraction);
  const current = sourceAiProfile({
    connection: { id: newId(), revision: 0, provider: "openai" },
    model: profile.model,
  });
  if (!current) throw Error("Missing profile");
  const visited = new Set<number>();
  let calls = 0;
  const transport: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    const sent = JSON.parse(body.input[0].content[0].text);
    for (const anchor of sent.sourceAnchors) visited.add(anchor.index);
    return Response.json({
      id: "resp_fixture",
      object: "response",
      created_at: 1,
      model: current.model,
      status: "completed",
      output: [
        {
          type: "message",
          id: "msg_fixture",
          status: "completed",
          role: "assistant",
          content: [
            { type: "output_text", text: JSON.stringify({ candidates: [] }), annotations: [] },
          ],
        },
      ],
    });
  };
  await generateSourceCandidates("synthetic", input, current, transport);
  expect(calls).toBeGreaterThan(1);
  expect([...visited]).toEqual(input.sourceAnchors?.map((anchor) => anchor.index));
  calls = 0;
  await generateSourceCandidates(
    "synthetic",
    input,
    current,
    transport,
    undefined,
    async (index) => index === 0,
  );
  expect(calls).toBe(1);
});

it("replays committed start and retry commands after their personal connection becomes unavailable", async () => {
  const f = await fixture();
  const started = await f.repository.startSourceAi(f.actor, f.request, profile, f.extraction);
  expect(
    await Effect.runPromise(startSourceAiCommand(env, f.request).pipe(Effect.provide(f.layer))),
  ).toEqual(started);
  await f.repository.cancelOperation(f.actor.id, started.revisionId ?? "", "cancel-for-replay");
  const request = { id: started.id, revision: started.revision, idempotencyKey: "retry-replay" };
  const retried = await f.repository.retrySourceAi(f.actor, request, profile);
  expect(
    await Effect.runPromise(retrySourceAiCommand(env, request).pipe(Effect.provide(f.layer))),
  ).toEqual(retried);
});
it("preserves the anchored provider contract when retrying a retained v2 source task", async () => {
  const f = await fixture(),
    legacy = { ...profile, contract: "river-source-claims-v2" as const };
  const task = await f.repository.startSourceAi(f.actor, f.request, legacy, f.extraction);
  const detail = await f.repository.inspectSourceAi(f.actor.id, task.id);
  const output = {
    candidates: [
      {
        ...f.candidate,
        metadata: { ...f.candidate.metadata, type: "Experience" },
        material: {
          assertion: f.candidate.material.assertion,
          contexts: f.candidate.material.contexts,
          passageIndexes: [1],
        },
      },
    ],
  };
  const generated = await generateSourceCandidates(
    "synthetic",
    detail.task.input,
    legacy,
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const material = body.text.format.schema.properties.candidates.items.properties.material;
      expect(material.required).toContain("passageIndexes");
      expect(material.properties).not.toHaveProperty("citations");
      return Response.json({
        id: "resp_v2",
        object: "response",
        created_at: 1,
        model: legacy.model,
        status: "completed",
        output: [
          {
            type: "message",
            id: "msg_v2",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
          },
        ],
      });
    },
  );
  expect(
    await f.repository.publishSourceAi(f.actor.id, task.id, task.revisionId ?? "", generated),
  ).toBe(true);
  expect(
    (await f.repository.inspectSourceAi(f.actor.id, task.id)).candidates[0]?.payload?.material
      .citations[0],
  ).toMatchObject({ start: 18, end: 35, quote: "Repeated passage." });
});
