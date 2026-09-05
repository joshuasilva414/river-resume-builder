import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import {
  type AiProfile,
  canonicalJson,
  newId,
  type Principal,
  validateJobProposal,
} from "@river/domain";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import {
  generateJobProposal,
  jobAiOutputSchema,
  jobAiProfile,
} from "../src/server/job-ai-provider";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const profile: AiProfile = {
  model: "gpt-5.4-mini-2026-03-17",
  contract: "river-job-analysis-v1",
  maxInputCharacters: 160000,
  maxOutputTokens: 12000,
  timeoutMs: 60000,
};
async function fixture(postingText = "TypeScript required.\nTypeScript required.") {
  const store = createRepository(env.DB),
    ownerId = newId();
  const actor: Principal = { kind: "owner", id: ownerId, ownerId };
  await store.db.insert(schema.user).values({
    id: ownerId,
    name: "Synthetic AI fixture",
    email: `${ownerId}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const created = await store.runJobCommand(actor, {
    type: "create",
    idempotencyKey: "create",
    details: { role: "Synthetic TypeScript engineer", company: "Fixture", location: "" },
    posting: { text: postingText, url: null },
  });
  const current = await store.inspectJob(ownerId, { id: created.id });
  const fields = {
    text: "TypeScript",
    category: "Language",
    priority: "Required" as const,
    keywords: ["TypeScript"],
    confidence: null,
    passages: [
      { snapshotId: current.snapshot.id, quote: "TypeScript required.", start: 21, end: 41 },
    ],
  };
  const request = {
    jobId: created.id,
    revision: 0,
    snapshotId: current.snapshot.id,
    task: "extract-requirements" as const,
    requirementId: null,
    idempotencyKey: "extract",
  };
  const output = {
    requirements: [{ existingId: null, ...fields }],
    explanation: "Synthetic exact second passage.",
  };
  return { store, actor, created, current, fields, request, output };
}
it("captures exact posting anchors and resolves a selected repeated occurrence without model offsets", async () => {
  const { store, actor, request, fields, current } = await fixture();
  const anchoredProfile = { ...profile, contract: "river-job-analysis-v2" as const };
  const started = await store.startJobAi(actor, request, anchoredProfile);
  const detail = await store.inspectJobAi(actor.id, started.id);
  expect(detail.task.input.postingAnchors).toEqual([
    { index: 0, snapshotId: current.snapshot.id, quote: "TypeScript required.", start: 0, end: 20 },
    {
      index: 1,
      snapshotId: current.snapshot.id,
      quote: "TypeScript required.",
      start: 21,
      end: 41,
    },
  ]);
  const output = {
    requirements: [
      {
        existingId: null,
        text: fields.text,
        category: fields.category,
        priority: fields.priority,
        keywords: fields.keywords,
        confidence: fields.confidence,
        passageIndexes: [1],
      },
    ],
    explanation: "Selected the explicit second occurrence.",
  };
  const generated = await generateJobProposal(
    "synthetic-test-key",
    detail.task.input,
    anchoredProfile,
    async (_request, init) => {
      const body = JSON.parse(String(init?.body));
      expect(JSON.parse(body.input[0].content).postingAnchors).toEqual(
        detail.task.input.postingAnchors,
      );
      expect(body.text.format.schema.properties.requirements.items.properties).toHaveProperty(
        "passageIndexes",
      );
      expect(body.text.format.schema.properties.requirements.items.properties).not.toHaveProperty(
        "passages",
      );
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
  if (!started.revisionId) throw Error("Missing operation");
  await store.publishJobAi(actor.id, started.id, started.revisionId, generated);
  const saved = await store.inspectJobAi(actor.id, started.id);
  expect(saved.proposal?.payload).toMatchObject({
    type: "requirements",
    requirements: [{ passages: fields.passages }],
  });
  for (const passageIndexes of [[2], [1, 1], []])
    expect(() =>
      validateJobProposal(detail.task.input, {
        ...output,
        requirements: [{ ...output.requirements[0], passageIndexes }],
      }),
    ).toThrow();
  expect(
    (await store.inspectJob(actor.id, { id: request.jobId })).workspace.data.requirements,
  ).toHaveLength(0);
  if (!saved.proposal) throw Error("Missing proposal");
  await store.reviewJobAi(actor, {
    id: saved.proposal.id,
    revision: 0,
    decision: "Accepted",
    acknowledgeRemovedAssociations: false,
    idempotencyKey: "accept-indexed",
  });
  expect(
    (await store.inspectJob(actor.id, { id: request.jobId })).workspace.data.requirements[0]
      ?.passages,
  ).toEqual(fields.passages);
});
it("indexes long Unicode posting lines without splitting surrogate pairs and counts anchors in the input budget", async () => {
  const text = `${"x".repeat(3999)}🚀 end\r\nRepeated passage.\nRepeated passage.`;
  const { store, actor, request, current } = await fixture(text);
  const anchoredProfile = { ...profile, contract: "river-job-analysis-v2" as const };
  const started = await store.startJobAi(actor, request, anchoredProfile);
  const { task } = await store.inspectJobAi(actor.id, started.id);
  const anchors = task.input.postingAnchors;
  expect(anchors).toHaveLength(4);
  for (const [index, anchor] of (anchors ?? []).entries()) {
    expect(anchor.index).toBe(index);
    expect(anchor.snapshotId).toBe(current.snapshot.id);
    expect(anchor.quote).toBe(text.slice(anchor.start, anchor.end));
    expect(anchor.quote.length).toBeLessThanOrEqual(4000);
    expect(anchor.quote).not.toMatch(/[\uD800-\uDFFF]/u);
  }
  expect(
    anchors
      ?.slice(0, 2)
      .map((anchor) => anchor.quote)
      .join(""),
  ).toBe(text.split("\r\n")[0]);
  const large = await fixture("TypeScript required.\n".repeat(2500));
  await expect(
    large.store.startJobAi(large.actor, large.request, anchoredProfile),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect((await large.store.listJobAi(large.actor.id, large.request.jobId, 0)).items).toHaveLength(
    0,
  );
});
it("pins one task, persists a reviewed map with stable new IDs, and rejects stale acceptance without dependent writes", async () => {
  const { store, actor, created, request, output } = await fixture();
  const started = await store.startJobAi(actor, request, profile);
  expect(await store.startJobAi(actor, request, null)).toEqual(started);
  if (!started.revisionId) throw Error("Missing operation");
  await store.publishJobAi(actor.id, started.id, started.revisionId, output);
  const detail = await store.inspectJobAi(actor.id, started.id);
  const proposal = detail.proposal;
  if (proposal?.payload?.type !== "requirements") throw Error("Missing proposal");
  expect(proposal.payload.requirements[0]?.id).toBeTruthy();
  expect(
    (await store.inspectJob(actor.id, { id: created.id })).workspace.data.requirements,
  ).toHaveLength(0);
  await store.runJobCommand(actor, {
    type: "details",
    id: created.id,
    revision: 0,
    details: { role: "Changed", company: "Fixture", location: "" },
    idempotencyKey: "change",
  });
  await expect(
    store.reviewJobAi(actor, {
      id: proposal.id,
      revision: 0,
      decision: "Accepted",
      acknowledgeRemovedAssociations: false,
      idempotencyKey: "accept",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await store.inspectJobAi(actor.id, started.id)).proposal?.state).toBe("Pending");
  expect(
    (await store.inspectJob(actor.id, { id: created.id })).workspace.data.requirements,
  ).toHaveLength(0);
  expect(
    await store.db.select().from(schema.audit).where(eq(schema.audit.command, "review-job-ai")),
  ).not.toEqual(expect.arrayContaining([expect.objectContaining({ entityId: proposal.id })]));
});
it("requires removal review, preserves general selections, and atomically records the complete accepted map", async () => {
  const { store, actor, created, request, fields } = await fixture();
  await store.runJobCommand(actor, {
    type: "requirement",
    id: created.id,
    revision: 0,
    snapshotId: request.snapshotId,
    requirementId: null,
    fields,
    idempotencyKey: "manual",
  });
  let current = await store.inspectJob(actor.id, { id: created.id });
  const requirementId = current.workspace.data.requirements[0]?.id;
  if (!requirementId) throw Error("Missing requirement");
  const material = { assertion: "Synthetic TypeScript evidence", citations: [], contexts: [] };
  const evidence = await store.createEvidence(
    actor,
    { material, metadata: { label: "Fixture", tags: [], notes: "" }, idempotencyKey: "evidence" },
    material,
  );
  if (!evidence.revisionId) throw Error("Missing evidence");
  for (const association of [null, requirementId]) {
    await store.runJobCommand(actor, {
      type: "selection",
      id: created.id,
      revision: current.job.revision,
      snapshotId: request.snapshotId,
      selection: {
        claimId: evidence.id,
        evidenceRevisionId: evidence.revisionId,
        requirementId: association,
      },
      selected: true,
      idempotencyKey: `choose-${association}`,
    });
    current = await store.inspectJob(actor.id, { id: created.id });
  }
  const started = await store.startJobAi(
    actor,
    { ...request, revision: current.job.revision },
    profile,
  );
  if (!started.revisionId) throw Error("Missing operation");
  const empty = { requirements: [], explanation: "Synthetic complete removal proposal." };
  const proposalId = await store.publishJobAi(actor.id, started.id, started.revisionId, empty);
  if (!proposalId) throw Error("Missing proposal");
  const accept = {
    id: proposalId,
    revision: 0,
    decision: "Accepted" as const,
    acknowledgeRemovedAssociations: false,
    idempotencyKey: "accept",
  };
  await expect(store.reviewJobAi(actor, accept)).rejects.toMatchObject({ code: "InvalidInput" });
  const outcome = await store.reviewJobAi(actor, {
    ...accept,
    acknowledgeRemovedAssociations: true,
  });
  expect(
    await store.reviewJobAi(actor, { ...accept, acknowledgeRemovedAssociations: true }),
  ).toEqual(outcome);
  const saved = await store.inspectJob(actor.id, { id: created.id });
  expect(saved.workspace.data.requirements).toHaveLength(0);
  expect(saved.workspace.data.selections).toEqual([
    expect.objectContaining({ requirementId: null }),
  ]);
  expect(
    (
      await store.inspectJob(actor.id, {
        id: created.id,
        workspaceRevisionId: current.workspace.id,
      })
    ).workspace.data.selections,
  ).toHaveLength(2);
});
it("rejects invalid citations, discards rejected generated payloads, and suppresses success after cancellation", async () => {
  const { store, actor, request, output } = await fixture();
  const started = await store.startJobAi(actor, request, profile);
  if (!started.revisionId) throw Error("Missing operation");
  const detail = await store.inspectJobAi(actor.id, started.id);
  expect(() =>
    validateJobProposal(detail.task.input, {
      ...output,
      requirements: output.requirements.map((item) => ({
        ...item,
        passages: item.passages.map((passage) => ({ ...passage, start: 20 })),
      })),
    }),
  ).toThrow();
  const marker = "SYNTHETIC_REJECTED_PAYLOAD_MARKER";
  const proposalId = await store.publishJobAi(actor.id, started.id, started.revisionId, {
    ...output,
    explanation: marker,
  });
  if (!proposalId) throw Error("Missing proposal");
  await store.reviewJobAi(actor, {
    id: proposalId,
    revision: 0,
    decision: "Rejected",
    acknowledgeRemovedAssociations: false,
    idempotencyKey: "reject",
  });
  const rejected = await store.inspectJobAi(actor.id, started.id);
  expect(rejected.proposal?.payload).toBeNull();
  expect(canonicalJson(await store.db.select().from(schema.receipts))).not.toContain(marker);
  expect(canonicalJson(await store.db.select().from(schema.audit))).not.toContain(marker);
  const cancelled = await store.startJobAi(
    actor,
    { ...request, idempotencyKey: "cancelled" },
    profile,
  );
  if (!cancelled.revisionId) throw Error("Missing operation");
  await store.cancelOperation(actor.id, cancelled.revisionId, "cancel");
  expect(await store.publishJobAi(actor.id, cancelled.id, cancelled.revisionId, output)).toBeNull();
  expect((await store.inspectJobAi(actor.id, cancelled.id)).proposal).toBeNull();
  await expect(
    store.startJobAi(
      { kind: "agent", id: "agent", ownerId: actor.id, scopes: ["jobs:write"] },
      request,
      profile,
    ),
  ).rejects.toMatchObject({ code: "Forbidden" });
  await expect(store.inspectJobAi(newId(), started.id)).rejects.toMatchObject({ code: "NotFound" });
});
it("bounds ranking references, preserves explicit selection, and invalidates changed evidence", async () => {
  const { store, actor, created, request, fields } = await fixture();
  await store.runJobCommand(actor, {
    type: "requirement",
    id: created.id,
    revision: 0,
    snapshotId: request.snapshotId,
    requirementId: null,
    fields,
    idempotencyKey: "manual",
  });
  const current = await store.inspectJob(actor.id, { id: created.id });
  const material = { assertion: "Synthetic TypeScript evidence", citations: [], contexts: [] };
  const evidence = await store.createEvidence(
    actor,
    { material, metadata: { label: "Fixture", tags: [], notes: "" }, idempotencyKey: "evidence" },
    material,
  );
  const started = await store.startJobAi(
    actor,
    { ...request, task: "rank-evidence", revision: 1 },
    profile,
  );
  if (!started.revisionId) throw Error("Missing operation");
  const detail = await store.inspectJobAi(actor.id, started.id),
    candidate = detail.task.input.candidates[0];
  if (!candidate) throw Error("Missing bounded candidate");
  const output = {
    results: [
      {
        claimId: candidate.claimId,
        evidenceRevisionId: candidate.evidenceRevisionId,
        requirementId: current.workspace.data.requirements[0]?.id,
        support: "Partial support",
        explanation: "Draft assertion only; unsupported.",
      },
    ],
    gaps: [],
    explanation: "Only supplied candidates reviewed.",
  };
  expect(() =>
    validateJobProposal(detail.task.input, {
      ...output,
      results: [{ ...output.results[0], claimId: newId() }],
    }),
  ).toThrow();
  const proposalId = await store.publishJobAi(actor.id, started.id, started.revisionId, output);
  if (!proposalId) throw Error("Missing proposal");
  await store.reviewJobAi(actor, {
    id: proposalId,
    revision: 0,
    decision: "Accepted",
    acknowledgeRemovedAssociations: false,
    idempotencyKey: "accept",
  });
  expect(
    (await store.inspectJob(actor.id, { id: created.id })).workspace.data.selections,
  ).toHaveLength(0);
  const next = await store.startJobAi(
    actor,
    { ...request, task: "rank-evidence", revision: 1, idempotencyKey: "rank-again" },
    profile,
  );
  if (!next.revisionId) throw Error("Missing operation");
  const staleId = await store.publishJobAi(actor.id, next.id, next.revisionId, output);
  if (!staleId) throw Error("Missing proposal");
  await store.db
    .update(schema.claims)
    .set({ revision: evidence.revision + 1, archivedAt: Date.now() })
    .where(eq(schema.claims.id, evidence.id));
  await expect(
    store.reviewJobAi(actor, {
      id: staleId,
      revision: 0,
      decision: "Accepted",
      acknowledgeRemovedAssociations: false,
      idempotencyKey: "stale",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("uses strict schema output, no provider storage/tools/retries, and rejects incomplete or changed-model responses", async () => {
  const { store, actor, request, output } = await fixture();
  const started = await store.startJobAi(actor, request, profile);
  const detail = await store.inspectJobAi(actor.id, started.id);
  let calls = 0;
  const transport: typeof fetch = async (_input, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: profile.model,
      store: false,
      stream: false,
      truncation: "disabled",
      max_output_tokens: 12000,
      text: { format: { strict: true, schema: { type: "object", additionalProperties: false } } },
    });
    expect(body.tools).toBeUndefined();
    expect(body.input[0].content).toBe(canonicalJson(detail.task.input));
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
  };
  expect(
    await generateJobProposal("synthetic-test-key", detail.task.input, profile, transport),
  ).toEqual(output);
  expect(calls).toBe(1);
  for (const task of ["extract-requirements", "rank-evidence"] as const) {
    const schema = jobAiOutputSchema(task);
    expect(JSON.stringify(schema)).not.toMatch(/"(?:allOf|not|if|then|else)":/);
  }
  expect(
    jobAiProfile({ OPENAI_REQUIREMENTS_MODEL: profile.model }, "extract-requirements"),
  ).toBeNull();
  let failures = 0;
  await expect(
    generateJobProposal("synthetic-test-key", detail.task.input, profile, async () => {
      failures++;
      return Response.json(
        { error: { message: "Private payload must not escape" } },
        { status: 503 },
      );
    }),
  ).rejects.toMatchObject({ code: "Unavailable" });
  expect(failures).toBe(1);
  await expect(
    generateJobProposal("synthetic-test-key", detail.task.input, profile, async () =>
      Response.json({
        id: "resp_fixture",
        object: "response",
        model: "different-model",
        status: "completed",
        output: [],
      }),
    ),
  ).rejects.toMatchObject({ code: "Unavailable" });
});

it("commits only one competing map acceptance and leaves the losing proposal and dependent history untouched", async () => {
  const { store, actor, request, output, created } = await fixture();
  const tasks = await Promise.all(
    ["first", "second"].map((key) =>
      store.startJobAi(actor, { ...request, idempotencyKey: key }, profile),
    ),
  );
  const proposals = await Promise.all(
    tasks.map(async (task) => {
      if (!task.revisionId) throw Error("Missing operation");
      const id = await store.publishJobAi(actor.id, task.id, task.revisionId, output);
      if (!id) throw Error("Missing proposal");
      return id;
    }),
  );
  const results = await Promise.allSettled(
    proposals.map((id) =>
      store.reviewJobAi(actor, {
        id,
        revision: 0,
        decision: "Accepted",
        acknowledgeRemovedAssociations: false,
        idempotencyKey: `accept-${id}`,
      }),
    ),
  );
  expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((item) => item.status === "rejected")).toEqual([
    expect.objectContaining({ reason: expect.objectContaining({ code: "Conflict" }) }),
  ]);
  const saved = await store.inspectJob(actor.id, { id: created.id });
  expect(saved.job.revision).toBe(1);
  expect(saved.workspace.data.requirements).toHaveLength(1);
  expect(
    await store.db
      .select()
      .from(schema.jobWorkspaceRevisions)
      .where(eq(schema.jobWorkspaceRevisions.snapshotId, request.snapshotId)),
  ).toHaveLength(2);
  const reviews = await Promise.all(tasks.map((task) => store.inspectJobAi(actor.id, task.id)));
  expect(reviews.map((item) => item.proposal?.state).sort()).toEqual(["Accepted", "Pending"]);
  const receipts = await store.db
    .select()
    .from(schema.receipts)
    .where(eq(schema.receipts.actorId, actor.id));
  expect(receipts.filter((item) => item.command === "review-job-ai")).toHaveLength(1);
});

it("bounds retries, replays a lost retry response, and ignores success from an obsolete attempt", async () => {
  const { store, actor, request, output } = await fixture();
  let task = await store.startJobAi(actor, request, profile);
  if (!task.revisionId) throw Error("Missing operation");
  const first = task.revisionId;
  await store.updateOperation(first, { state: "Failed", stage: "Synthetic failure" });
  const retry = { id: task.id, revision: task.revision, idempotencyKey: "retry-1" };
  await expect(
    store.retryJobAi(actor, retry, { ...profile, model: "changed-model" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  task = await store.retryJobAi(actor, retry, profile);
  expect(await store.retryJobAi(actor, retry, null)).toEqual(task);
  expect(await store.publishJobAi(actor.id, task.id, first, output)).toBeNull();
  if (!task.revisionId) throw Error("Missing operation");
  await store.cancelOperation(actor.id, task.revisionId, "cancel-second");
  task = await store.retryJobAi(
    actor,
    { id: task.id, revision: task.revision, idempotencyKey: "retry-2" },
    profile,
  );
  if (!task.revisionId) throw Error("Missing operation");
  await store.updateOperation(task.revisionId, {
    state: "Failed",
    stage: "Synthetic third failure",
  });
  await expect(
    store.retryJobAi(
      actor,
      { id: task.id, revision: task.revision, idempotencyKey: "retry-3" },
      profile,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await store.inspectJobAi(actor.id, task.id)).task.attempts).toBe(3);
});

it("rejects ranking acceptance when a captured context changes without changing its evidence revision", async () => {
  const { store, actor, created, request, fields } = await fixture();
  const contextData = {
    kind: "Project" as const,
    label: "Synthetic TypeScript project",
    organization: "",
    role: "Contributor",
    startDate: "",
    endDate: "",
    details: "Original scope",
    contact: null,
  };
  const context = await store.saveContext(actor, {
    id: null,
    revision: null,
    idempotencyKey: "context",
    data: contextData,
  });
  if (!context.revisionId) throw Error("Missing context");
  const material = {
    assertion: "Synthetic TypeScript evidence",
    citations: [],
    contexts: [{ id: context.id, revisionId: context.revisionId }],
  };
  await store.createEvidence(
    actor,
    { material, metadata: { label: "Fixture", tags: [], notes: "" }, idempotencyKey: "evidence" },
    material,
  );
  await store.runJobCommand(actor, {
    type: "requirement",
    id: created.id,
    revision: 0,
    snapshotId: request.snapshotId,
    requirementId: null,
    fields,
    idempotencyKey: "manual",
  });
  const task = await store.startJobAi(
    actor,
    { ...request, revision: 1, task: "rank-evidence" },
    profile,
  );
  if (!task.revisionId) throw Error("Missing operation");
  const captured = await store.inspectJobAi(actor.id, task.id);
  expect(captured.task.input.candidates).toHaveLength(1);
  const requirement = captured.task.input.workspace.requirements[0];
  if (!requirement) throw Error("Missing requirement");
  const proposalId = await store.publishJobAi(actor.id, task.id, task.revisionId, {
    results: [],
    gaps: [{ requirementId: requirement.id, explanation: "Synthetic gap." }],
    explanation: "Bounded fixture.",
  });
  if (!proposalId) throw Error("Missing proposal");
  await store.saveContext(actor, {
    id: context.id,
    revision: 0,
    idempotencyKey: "change-context",
    data: { ...contextData, details: "Changed scope" },
  });
  const current = await store.inspectJobAi(actor.id, task.id);
  expect(current.staleReasons).toContain("A referenced context changed.");
  expect(current.task.input.candidates[0]?.contexts[0]?.data.details).toBe("Original scope");
  await expect(
    store.reviewJobAi(actor, {
      id: proposalId,
      revision: 0,
      decision: "Accepted",
      acknowledgeRemovedAssociations: false,
      idempotencyKey: "accept",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await store.inspectJob(actor.id, { id: created.id })).selected).toHaveLength(0);
});
