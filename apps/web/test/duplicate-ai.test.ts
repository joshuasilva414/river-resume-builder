import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import {
  canonicalJson,
  type DuplicateAiOutput,
  type DuplicateAiProfile,
  type EvidenceMaterial,
  fingerprint,
  newId,
  type Principal,
  validateDuplicateComparison,
} from "@river/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { beforeAll, expect, it } from "vitest";
import { generateDuplicateComparison } from "../src/server/duplicate-ai-provider";
import { Actor, Store } from "../src/server/services";
import { createSource } from "../src/server/sources";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const profile: DuplicateAiProfile = {
  connection: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 0, provider: "openai" },
  contract: "river-duplicate-comparison-v1",
  model: "gpt-5.4-mini-2026-03-17",
  maxInputCharacters: 160000,
  maxOutputTokens: 8000,
  timeoutMs: 60000,
};
const output: DuplicateAiOutput = {
  assessment: "Uncertain",
  shared: [{ scope: "Assertion", explanation: "Both synthetic assertions use the same words." }],
  different: [{ scope: "Citation", explanation: "The quoted occurrence differs." }],
  uncertain: [
    {
      scope: "Context",
      explanation: "The synthetic context does not establish whether the facts are identical.",
    },
  ],
};
async function fixture() {
  const repository = createRepository(env.DB),
    id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "Synthetic comparison fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const layer = Layer.merge(Layer.succeed(Store, repository), Layer.succeed(Actor, actor));
  const text = "Synthetic reference.\nSynthetic reference.";
  const source = await Effect.runPromise(
    createSource(env, {
      idempotencyKey: "source",
      title: "Synthetic comparison source",
      filename: "fixture.txt",
      mime: "text/plain",
      kind: "pasted",
      provenanceUrl: null,
      note: "Not Owner evidence",
      contentBase64: btoa(text),
    }).pipe(Effect.provide(layer)),
  );
  const sourceRecord = await repository.getSource(id, source.id);
  if (!sourceRecord) throw Error("Missing source");
  const op = await repository.getOperation(sourceRecord.operationId);
  if (!op || !("sourceId" in op.input)) throw Error("Missing extraction operation");
  const extraction = {
    type: "extracted" as const,
    text,
    parser: "fixture",
    parserVersion: "1",
    segments: [
      { text: "Synthetic reference.", start: 0, end: 20, line: 1 },
      { text: "Synthetic reference.", start: 21, end: 41, line: 2 },
    ],
  };
  const objectKey = `fixture/${source.id}/extraction`,
    digest = await fingerprint(JSON.stringify(extraction));
  await env.ARTIFACTS.put(objectKey, JSON.stringify(extraction));
  await repository.publishExtraction({
    id: op.input.processingId,
    sourceId: source.id,
    operationId: op.id,
    objectKey,
    digest,
    extraction,
  });
  const contextData = {
    kind: "Project" as const,
    label: "Synthetic context",
    organization: "Fixture",
    role: "Contributor",
    startDate: "",
    endDate: "",
    details: "A pinned synthetic context",
    contact: null,
  };
  const context = await repository.saveContext(actor, {
    id: null,
    revision: null,
    data: contextData,
    idempotencyKey: "context",
  });
  if (!context.revisionId) throw Error("Missing context revision");
  const material: EvidenceMaterial = {
    assertion: "Built a synthetic comparison fixture.",
    contexts: [{ id: context.id, revisionId: context.revisionId }],
    citations: [
      {
        sourceId: source.id,
        processingId: op.input.processingId,
        quote: "Synthetic reference.",
        start: 0,
        end: 20,
        locators: [{ start: 0, end: 20, line: 1 }],
        attestation: false,
      },
    ],
  };
  const first = await repository.createEvidence(
    actor,
    {
      idempotencyKey: "first",
      material,
      metadata: { label: "First", tags: [], notes: "PRIVATE METADATA MUST NOT ENTER COMPARISON" },
    },
    material,
  );
  const secondMaterial = {
    ...material,
    citations: material.citations.map((citation) => ({
      ...citation,
      start: 21,
      end: 41,
      locators: [{ start: 21, end: 41, line: 2 }],
    })),
  };
  const second = await repository.createEvidence(
    actor,
    {
      idempotencyKey: "second",
      material: secondMaterial,
      metadata: { label: "Second", tags: [], notes: "" },
    },
    secondMaterial,
  );
  const [pair] = await repository.listDuplicates(id);
  if (!pair) throw Error("Missing pair");
  const request = {
    pairId: pair.id,
    revision: 0,
    firstRevision: 0,
    secondRevision: 0,
    idempotencyKey: "generate",
  };
  const generate = async (key = "generate") => {
    const task = await repository.startDuplicateAi(
      actor,
      { ...request, idempotencyKey: key },
      profile,
    );
    if (!task.revisionId) throw Error("Missing operation");
    await repository.publishDuplicateAi(id, task.id, task.revisionId, output);
    const detail = await repository.inspectDuplicateAi(id, task.id);
    if (!detail.proposal) throw Error("Missing proposal");
    const origin = { id: detail.proposal.id, digest: detail.proposal.digest };
    return {
      task,
      detail,
      origin,
      review: {
        ...origin,
        revision: 0,
        decision: "Accepted" as const,
        idempotencyKey: `review-${key}`,
      },
    };
  };
  return {
    repository,
    actor,
    request,
    first,
    second,
    pair,
    material,
    source,
    context,
    contextData,
    generate,
  };
}
it("acknowledges an exact comparison without resolving the pair and records explicit separate attribution", async () => {
  const { repository, actor, request, first, second, pair, generate } = await fixture();
  const { task, detail, origin, review } = await generate();
  expect(await repository.startDuplicateAi(actor, request, null)).toEqual(task);
  expect(canonicalJson(detail.task.input)).not.toContain("PRIVATE METADATA");
  expect(detail.task.input.first.material.citations[0]?.start).not.toBe(
    detail.task.input.second.material.citations[0]?.start,
  );
  const outcome = await repository.reviewDuplicateAi(actor, review);
  expect(await repository.reviewDuplicateAi(actor, review)).toEqual(outcome);
  expect((await repository.getClaim(actor.id, first.id))?.revision).toBe(0);
  expect((await repository.getClaim(actor.id, second.id))?.revision).toBe(0);
  expect((await repository.listDuplicates(actor.id))[0]?.state).toBe("Pending");
  await repository.dismissDuplicate(actor, {
    id: pair.id,
    revision: 0,
    rationale: "Owner decided to preserve both synthetic records.",
    comparisonOrigin: origin,
    idempotencyKey: "separate",
  });
  const saved = await repository.inspectDuplicateAi(actor.id, task.id);
  expect(saved.pair?.state).toBe("Separate");
  expect(saved.pairState).toBe("Separate");
  expect(saved.pairDecision).toMatchObject({
    command: "dismiss-duplicate",
    actorId: actor.id,
    rationale: "Owner decided to preserve both synthetic records.",
  });
  expect(saved.proposal?.state).toBe("Accepted");
  expect(saved.staleReasons).not.toEqual([]);
  for (const claim of [first, second])
    expect((await repository.listDuplicateAi(actor.id, claim.id, 0)).items[0]?.id).toBe(task.id);
  expect(canonicalJson(await repository.activity(actor.id))).toContain(origin.digest);
});
it("rejects stale attributed dispositions atomically without silently falling back to manual commands", async () => {
  const { repository, actor, pair, context, contextData, generate } = await fixture();
  const { task, origin, review } = await generate();
  await repository.reviewDuplicateAi(actor, review);
  await repository.saveContext(actor, {
    id: context.id,
    revision: 0,
    data: { ...contextData, details: "Changed context" },
    idempotencyKey: "context-changed",
  });
  const history = await repository.activity(actor.id);
  const command = {
    id: pair.id,
    revision: 0,
    rationale: "Explicit manual disposition",
    idempotencyKey: "separate",
  };
  await expect(
    repository.dismissDuplicate(actor, { ...command, comparisonOrigin: origin }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await repository.inspectDuplicateAi(actor.id, task.id)).pair?.state).toBe("Pending");
  expect(await repository.activity(actor.id)).toEqual(history);
  await repository.dismissDuplicate(actor, command);
  expect((await repository.inspectDuplicateAi(actor.id, task.id)).pair?.state).toBe("Separate");
});
it("preserves both claim histories after an attributed manual merge and does not verify the result", async () => {
  const { repository, actor, first, second, material, generate } = await fixture();
  const { task, origin, review } = await generate();
  await repository.reviewDuplicateAi(actor, review);
  const merged = await repository.mergeEvidence(
    actor,
    {
      id: first.id,
      revision: 0,
      sourceId: second.id,
      sourceRevision: 0,
      material,
      rationale: "Explicitly reviewed synthetic merge",
      comparisonOrigin: origin,
      idempotencyKey: "merge",
    },
    material,
  );
  expect(await repository.getClaim(actor.id, first.id)).toMatchObject({
    reviewState: "Draft",
    revision: 1,
    currentRevisionId: merged.revisionId,
  });
  expect((await repository.getClaim(actor.id, second.id))?.mergedIntoId).toBe(first.id);
  for (const claim of [first, second])
    expect((await repository.listDuplicateAi(actor.id, claim.id, 0)).items[0]?.id).toBe(task.id);
  const historical = await repository.inspectDuplicateAi(actor.id, task.id);
  expect(historical.pairState).toBe("Merged");
  expect(historical.pairDecision).toMatchObject({
    command: "merge-evidence",
    actorId: actor.id,
    rationale: "Explicitly reviewed synthetic merge",
  });
  expect(historical.proposal?.payload).toEqual(output);
});
it("blocks stale acknowledgments after source, claim, or pair changes but permits payload removal", async () => {
  for (const change of ["source", "claim", "pair"]) {
    const { repository, actor, first, pair, source, generate } = await fixture();
    const { task, review } = await generate();
    if (change === "source")
      await repository.retrySource(actor, {
        id: source.id,
        revision: 0,
        idempotencyKey: "reprocess",
      });
    else if (change === "pair")
      await repository.dismissDuplicate(actor, {
        id: pair.id,
        revision: 0,
        rationale: "Manual decision before acknowledgment",
        idempotencyKey: "separate-first",
      });
    else
      await repository.updateEvidenceMetadata(actor, {
        id: first.id,
        revision: 0,
        metadata: { label: "Changed", tags: [], notes: "" },
        idempotencyKey: "metadata",
      });
    await expect(repository.reviewDuplicateAi(actor, review)).rejects.toMatchObject({
      code: "Conflict",
    });
    await repository.reviewDuplicateAi(actor, {
      ...review,
      decision: "Rejected",
      idempotencyKey: "reject",
    });
    const detail = await repository.inspectDuplicateAi(actor.id, task.id);
    expect(detail.proposal?.payload).toBeNull();
    expect(
      canonicalJson({
        task: detail.task,
        operation: detail.operation,
        history: await repository.activity(actor.id),
      }),
    ).not.toContain(output.shared[0]?.explanation);
  }
});
it("denies other principals, cancels late output, and shares the two-task capacity limit across AI workflows", async () => {
  const { repository, actor, request, source } = await fixture();
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: actor.id,
    scopes: ["evidence:merge", "evidence:write"],
  };
  await expect(repository.startDuplicateAi(agent, request, profile)).rejects.toMatchObject({
    code: "Forbidden",
  });
  const first = await repository.startDuplicateAi(actor, request, profile);
  if (!first.revisionId) throw Error("Missing operation");
  const otherOperation = newId();
  await repository.db.insert(schema.operations).values({
    id: otherOperation,
    ownerId: actor.id,
    input: { type: "source-ai", taskId: source.id },
    state: "Pending",
    stage: "Synthetic capacity fixture",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await expect(
    repository.startDuplicateAi(actor, { ...request, idempotencyKey: "over-capacity" }, profile),
  ).rejects.toMatchObject({ code: "Conflict" });
  await repository.cancelOperation(actor.id, first.revisionId, "cancel");
  expect(
    await repository.publishDuplicateAi(actor.id, first.id, first.revisionId, output),
  ).toBeNull();
  const retry = await repository.retryDuplicateAi(
    actor,
    { id: first.id, revision: 0, idempotencyKey: "retry" },
    profile,
  );
  expect(
    await repository.retryDuplicateAi(
      actor,
      { id: first.id, revision: 0, idempotencyKey: "retry" },
      null,
    ),
  ).toEqual(retry);
  expect(
    await repository.publishDuplicateAi(actor.id, first.id, first.revisionId, output),
  ).toBeNull();
});
it("sends a bounded strict provider request, validates all finding groups, and commits one concurrent review", async () => {
  const { repository, actor, generate } = await fixture();
  const { task, detail, review } = await generate();
  let calls = 0;
  const generated = await generateDuplicateComparison(
    "synthetic-key",
    detail.task.input,
    profile,
    async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: profile.model,
        store: false,
        truncation: "disabled",
        max_output_tokens: 8000,
        text: {
          format: {
            name: "duplicate_comparison",
            strict: true,
            schema: { additionalProperties: false },
          },
        },
      });
      expect(body.input[0].content[0].text).toBe(canonicalJson(detail.task.input));
      return Response.json({
        id: "resp_fixture",
        object: "response",
        created_at: 1,
        model: profile.model,
        status: "completed",
        output: [
          {
            id: "msg_fixture",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
          },
        ],
      });
    },
  );
  expect(calls).toBe(1);
  expect(validateDuplicateComparison(generated)).toEqual(output);
  expect(() => validateDuplicateComparison({ ...output, different: undefined })).toThrow();
  expect(() =>
    validateDuplicateComparison({
      assessment: "Uncertain",
      shared: [],
      different: [],
      uncertain: [],
    }),
  ).toThrow();
  const outcomes = await Promise.allSettled([
    repository.reviewDuplicateAi(actor, review),
    repository.reviewDuplicateAi(actor, {
      ...review,
      decision: "Rejected",
      idempotencyKey: "competing",
    }),
  ]);
  expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((item) => item.status === "rejected")).toEqual([
    expect.objectContaining({ reason: expect.objectContaining({ code: "Conflict" }) }),
  ]);
  expect((await repository.inspectDuplicateAi(actor.id, task.id)).pair?.state).toBe("Pending");
  const receipts = await repository.db
    .select()
    .from(schema.receipts)
    .where(eq(schema.receipts.actorId, actor.id));
  expect(receipts.filter((receipt) => receipt.command === "review-duplicate-ai")).toHaveLength(1);
});
