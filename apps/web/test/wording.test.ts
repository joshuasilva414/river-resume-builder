import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { schema } from "@river/db";
import {
  applyWordingProposal,
  type Composition,
  canonicalJson,
  captureWordingTarget,
  emptyStructuredContent,
  newId,
  placeSection,
  replaceStructuredWording,
  structuredWordingPaths,
  undoAcceptedWording,
  validateWordingProposal,
  type WordingPath,
  type WordingProfile,
  type WordingProposal,
} from "@river/domain";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import {
  generateWording,
  wordingOutputSchema,
  wordingProfile,
} from "../src/server/wording-provider";
import { compositionFixture } from "./fixtures/composition";

it("constrains generated posting passages to exact captured quotes and offsets", async () => {
  const { generate } = await fixture();
  const { detail } = await generate();
  const input = {
    ...detail.task.input,
    snapshot: { ...detail.task.input.snapshot, text: "Repeated café.\nRepeated café." },
  };
  expect(wordingOutputSchema(input)).toMatchObject({
    properties: {
      passages: {
        items: {
          anyOf: [
            {
              properties: {
                start: { enum: [0] },
                end: { enum: [14] },
                quote: { enum: ["Repeated café."] },
              },
            },
            {
              properties: {
                start: { enum: [15] },
                end: { enum: [29] },
                quote: { enum: ["Repeated café."] },
              },
            },
          ],
        },
      },
    },
  });
  expect(
    wordingOutputSchema({ ...input, snapshot: { ...input.snapshot, text: "" } }),
  ).toMatchObject({
    properties: { passages: { maxItems: 0 } },
  });
});

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const profile: WordingProfile = {
  connection: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 0, provider: "openai" },
  model: "gpt-5.4-mini-2026-03-17",
  contract: "river-wording-v1",
  maxInputCharacters: 160000,
  maxOutputTokens: 12000,
  timeoutMs: 60000,
};
const output: WordingProposal = {
  wording: "Revised synthetic wording.",
  evidence: [],
  reason: "Synthetic wording review fixture.",
  meaning: {
    assessment: "Preserved",
    explanation: "Synthetic editorial change; not an assertion about the Owner.",
  },
  passages: [],
};
async function fixture() {
  const value = await compositionFixture(),
    section = value.data.sections[1],
    block = section?.blocks[0],
    content = block?.fields[0]?.contents[0];
  if (!section || !block || !content) throw Error("Missing fixture placement");
  const path = { sectionId: section.id, blockId: block.id, contentId: content.id };
  const request = {
    draftId: value.draft.id,
    revision: 0,
    path,
    goal: "Make this synthetic wording concise.",
    idempotencyKey: "generate",
  };
  const generate = async (key = "generate", revision = 0, proposal = output) => {
    const task = await value.repository.startWording(
      value.actor,
      { ...request, idempotencyKey: key, revision },
      profile,
    );
    if (!task.revisionId) throw Error("Missing operation");
    await value.repository.publishWording(value.actor.id, task.id, task.revisionId, proposal);
    const detail = await value.repository.inspectWording(value.actor.id, task.id);
    if (!detail.proposal) throw Error("Missing proposal");
    return {
      task,
      detail,
      review: {
        id: detail.proposal.id,
        revision: 0,
        digest: detail.proposal.digest,
        decision: "Accepted" as const,
        idempotencyKey: `accept-${key}`,
      },
    };
  };
  return { ...value, path, request, generate };
}
it("accepts one local override after unrelated draft edits, preserving library, other drafts, and command replay", async () => {
  const { repository, actor, data, content, create, draft, request, path, generate } =
    await fixture();
  const other = await create("other");
  const { task, detail, review } = await generate();
  expect(await repository.startWording(actor, request, null)).toEqual(task);
  expect(canonicalJson(detail.task.input)).not.toContain("Synthetic Person");
  expect(canonicalJson(detail.task.input)).not.toContain(data.name);
  expect(detail.task.input).not.toHaveProperty("workspace");
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: { ...data, name: "A new unrelated draft name" },
    idempotencyKey: "rename",
  });
  expect((await repository.inspectWording(actor.id, task.id)).staleReasons).toEqual([]);
  const outcome = await repository.reviewWording(actor, review);
  expect(await repository.reviewWording(actor, review)).toEqual(outcome);
  const saved = await repository.inspectResume(actor.id, draft.id);
  expect(saved.draft.revision).toBe(2);
  expect(saved.draft.data).toEqual(
    applyWordingProposal({ ...data, name: "A new unrelated draft name" }, path, output),
  );
  expect((await repository.inspectWording(actor.id, task.id)).proposal).toMatchObject({
    state: "Accepted",
    appliedRevision: 2,
  });
  expect((await repository.inspectResume(actor.id, other.id)).draft.data).toEqual(data);
  expect((await repository.getLibraryRevision(actor.id, content))?.revision.data).toMatchObject({
    wording: "Original synthetic wording.",
  });
});
it("rejects changed target and competing acceptances without partial indexes, review history, or receipts", async () => {
  const { repository, actor, draft, data, path, generate } = await fixture();
  const first = await generate("first"),
    second = await generate("second");
  const outcomes = await Promise.allSettled([
    repository.reviewWording(actor, first.review),
    repository.reviewWording(actor, second.review),
  ]);
  expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((item) => item.status === "rejected")).toEqual([
    expect.objectContaining({ reason: expect.objectContaining({ code: "Conflict" }) }),
  ]);
  expect((await repository.getResume(actor.id, draft.id))?.revision).toBe(1);
  const receipts = await repository.db
    .select()
    .from(schema.receipts)
    .where(eq(schema.receipts.actorId, actor.id));
  expect(receipts.filter((item) => item.command === "review-wording")).toHaveLength(1);
  const decisions = await Promise.all(
    [first, second].map((item) => repository.inspectWording(actor.id, item.task.id)),
  );
  expect(decisions.map((item) => item.proposal?.state).sort()).toEqual(["Accepted", "Pending"]);
  const pending = decisions.find((item) => item.proposal?.state === "Pending");
  expect(pending?.staleReasons.join(" ")).toContain("target wording");
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 1,
    data: applyWordingProposal(data, path, { ...output, wording: "New target before acceptance." }),
    idempotencyKey: "target-change",
  });
  const before = await repository.inspectResume(actor.id, draft.id);
  await expect(
    repository.reviewWording(
      actor,
      decisions[0]?.proposal?.state === "Pending" ? first.review : second.review,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await repository.inspectResume(actor.id, draft.id)).draft).toEqual(before.draft);
});
it("binds support to each exact pinned revision's review and context, and blocks changed context or evidence", async () => {
  const { repository, actor, draft, data, path, generate } = await fixture();
  const contextData = {
    kind: "Project" as const,
    label: "Synthetic context",
    organization: "Fixture",
    role: "Contributor",
    startDate: "",
    endDate: "",
    details: "Original pinned context",
    contact: null,
  };
  const context = await repository.saveContext(actor, {
    id: null,
    revision: null,
    idempotencyKey: "context",
    data: contextData,
  });
  if (!context.revisionId) throw Error("Missing context");
  const material = {
    assertion: "Synthetic supported wording",
    citations: [],
    contexts: [{ id: context.id, revisionId: context.revisionId }],
  };
  const evidence = await repository.createEvidence(
    actor,
    {
      material,
      metadata: { label: "Evidence fixture", tags: [], notes: "" },
      idempotencyKey: "evidence",
    },
    material,
  );
  if (!evidence.revisionId) throw Error("Missing evidence");
  await repository.reviewEvidence(actor, {
    id: evidence.id,
    revision: 0,
    revisionId: evidence.revisionId,
    state: "Needs clarification",
    rationale: "Scope unclear in the original revision.",
    idempotencyKey: "review",
  });
  const nextMaterial = { ...material, assertion: "Changed current material" };
  const newer = await repository.editEvidence(
    actor,
    { id: evidence.id, revision: 1, material: nextMaterial, idempotencyKey: "edit" },
    nextMaterial,
  );
  if (!newer.revisionId) throw Error("Missing newer revision");
  await repository.reviewEvidence(actor, {
    id: evidence.id,
    revision: 2,
    revisionId: newer.revisionId,
    state: "Draft",
    rationale: "Current version has a distinct decision.",
    idempotencyKey: "current-review",
  });
  const reference = { claimId: evidence.id, revisionId: evidence.revisionId };
  const local = applyWordingProposal(data, path, {
    ...output,
    wording: "Original synthetic wording.",
    evidence: [reference],
  });
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: local,
    idempotencyKey: "attach",
  });
  const proposal = { ...output, evidence: [reference] };
  const first = await generate("with-context", 1, proposal);
  expect(first.detail.task.input.evidence[0]).toMatchObject({
    evidenceRevisionId: evidence.revisionId,
    currentRevisionId: newer.revisionId,
    reviewState: "Needs clarification",
    rationale: "Scope unclear in the original revision.",
  });
  await repository.saveContext(actor, {
    id: context.id,
    revision: 0,
    idempotencyKey: "context-change",
    data: { ...contextData, details: "New context values" },
  });
  await expect(repository.reviewWording(actor, first.review)).rejects.toMatchObject({
    code: "Conflict",
  });
  expect(
    (await repository.inspectWording(actor.id, first.task.id)).task.input.evidence[0]?.contexts[0]
      ?.data.details,
  ).toBe("Original pinned context");
  const second = await generate("with-evidence", 1, proposal);
  await repository.archiveEvidence(actor, {
    id: evidence.id,
    revision: 3,
    archived: true,
    rationale: "Synthetic archive",
    idempotencyKey: "archive",
  });
  await expect(repository.reviewWording(actor, second.review)).rejects.toMatchObject({
    code: "Conflict",
  });
  expect((await repository.getResume(actor.id, draft.id))?.revision).toBe(1);
  expect((await repository.inspectWording(actor.id, second.task.id)).proposal?.state).toBe(
    "Pending",
  );
});
it("removes rejected payloads, checks digest and ownership, and validates exact support and posting offsets", async () => {
  const { repository, actor, request, generate } = await fixture();
  const marker = "SYNTHETIC_REJECTED_WORDING_PAYLOAD";
  const { task, detail, review } = await generate("reject", 0, { ...output, wording: marker });
  await expect(
    repository.reviewWording(actor, { ...review, digest: "0".repeat(64) }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const agent = { ...actor, kind: "agent" as const, scopes: ["evidence:write" as const] };
  await expect(repository.startWording(agent, request, profile)).rejects.toMatchObject({
    code: "Forbidden",
  });
  await expect(repository.reviewWording(agent, review)).rejects.toMatchObject({
    code: "Forbidden",
  });
  await expect(repository.inspectWording(newId(), task.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  expect(() =>
    validateWordingProposal(detail.task.input, {
      ...output,
      evidence: [{ claimId: newId(), revisionId: newId() }],
    }),
  ).toThrow();
  expect(() =>
    validateWordingProposal(detail.task.input, {
      ...output,
      passages: [
        { snapshotId: detail.task.input.snapshot.id, start: 1, end: 9, quote: "Synthetic" },
      ],
    }),
  ).toThrow();
  await repository.reviewWording(actor, { ...review, decision: "Rejected" });
  expect((await repository.inspectWording(actor.id, task.id)).proposal?.payload).toBeNull();
  expect(
    JSON.stringify(
      await repository.db.select().from(schema.audit).where(eq(schema.audit.actorId, actor.id)),
    ),
  ).not.toContain(marker);
  expect(
    JSON.stringify(
      await repository.db
        .select()
        .from(schema.receipts)
        .where(eq(schema.receipts.actorId, actor.id)),
    ),
  ).not.toContain(marker);
});
it("cancels late publication and enforces stable-profile three-attempt retries", async () => {
  const { repository, actor, request } = await fixture();
  let task = await repository.startWording(actor, request, profile);
  if (!task.revisionId) throw Error("Missing operation");
  const first = task.revisionId;
  await repository.cancelOperation(actor.id, first, "cancel");
  expect(await repository.publishWording(actor.id, task.id, first, output)).toBeNull();
  const retry = { id: task.id, revision: 0, idempotencyKey: "retry" };
  await expect(
    repository.retryWording(actor, retry, { ...profile, model: "different-model" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  task = await repository.retryWording(actor, retry, profile);
  expect(await repository.retryWording(actor, retry, null)).toEqual(task);
  expect(await repository.publishWording(actor.id, task.id, first, output)).toBeNull();
  if (!task.revisionId) throw Error("Missing operation");
  await repository.updateOperation(task.revisionId, {
    state: "Failed",
    stage: "Synthetic failure",
  });
  task = await repository.retryWording(
    actor,
    { ...retry, revision: task.revision, idempotencyKey: "third" },
    profile,
  );
  if (!task.revisionId) throw Error("Missing operation");
  await repository.updateOperation(task.revisionId, {
    state: "Failed",
    stage: "Synthetic failure",
  });
  await expect(
    repository.retryWording(
      actor,
      { ...retry, revision: task.revision, idempotencyKey: "exhausted" },
      profile,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("sends only captured input through a strict bounded provider request and requires exact model identity", async () => {
  const { generate } = await fixture(),
    { detail } = await generate();
  let calls = 0;
  const generated = await generateWording(
    "synthetic-test-key",
    detail.task.input,
    profile,
    async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      expect(request).toMatchObject({
        model: profile.model,
        store: false,
        truncation: "disabled",
        max_output_tokens: 12000,
        text: {
          format: {
            name: "wording",
            strict: true,
            schema: { type: "object", additionalProperties: false },
          },
        },
      });
      expect(request.input[0].content[0].text).toBe(canonicalJson(detail.task.input));
      expect(request.tools).toBeUndefined();
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
  expect(generated).toEqual(output);
  expect(calls).toBe(1);
  expect(wordingProfile(null)).toBeNull();
  expect(JSON.stringify(wordingOutputSchema())).not.toMatch(/"(?:allOf|not|if|then|else)":/);
  await expect(
    generateWording("synthetic-test-key", detail.task.input, profile, async () =>
      Response.json({ model: "wrong-model", status: "completed", output: [] }),
    ),
  ).rejects.toMatchObject({ code: "Unavailable" });
});

it("undoes an accepted placement as a new saved edit while preserving unrelated work and review history", async () => {
  const { repository, actor, draft, data, generate } = await fixture();
  const proposal = await generate();
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: { ...data, name: "Independent name update" },
    idempotencyKey: "rename-before-accept",
  });
  await repository.reviewWording(actor, proposal.review);
  const accepted = await repository.inspectResume(actor.id, draft.id);
  const undone = undoAcceptedWording(
    accepted.draft.data,
    accepted.graph,
    proposal.detail.task.input.target,
    output,
  );
  expect(undone).toEqual({ ...data, name: "Independent name update" });
  if (!undone) throw new Error("Undo step missing");
  await repository.saveResume(actor, {
    id: draft.id,
    revision: accepted.draft.revision,
    data: undone,
    idempotencyKey: "undo-wording",
  });
  expect((await repository.inspectWording(actor.id, proposal.task.id)).proposal).toMatchObject({
    state: "Accepted",
    appliedRevision: 2,
  });
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 3,
    data: accepted.draft.data,
    idempotencyKey: "redo-wording",
  });
  expect((await repository.getResume(actor.id, draft.id))?.data).toEqual(accepted.draft.data);
});
it("refuses to build an undo step after the accepted target changes or disappears", async () => {
  const { repository, actor, draft, data, path, generate } = await fixture();
  const proposal = await generate();
  await repository.reviewWording(actor, proposal.review);
  const accepted = await repository.inspectResume(actor.id, draft.id);
  const changed = applyWordingProposal(accepted.draft.data, path, {
    ...output,
    wording: "Later independent wording",
  });
  expect(
    undoAcceptedWording(changed, accepted.graph, proposal.detail.task.input.target, output),
  ).toBeNull();
  expect(
    undoAcceptedWording(
      { ...data, sections: [] },
      accepted.graph,
      proposal.detail.task.input.target,
      output,
    ),
  ).toBeNull();
  expect((await repository.inspectWording(actor.id, proposal.task.id)).proposal?.state).toBe(
    "Accepted",
  );
});

it("applies edited wording in one retry-safe batch and keeps accepted results free of false stale warnings", async () => {
  const { repository, actor, draft, generate, path } = await fixture();
  const { review, task } = await generate();
  const request = {
    draftId: draft.id,
    revision: 0,
    items: [
      {
        id: review.id,
        revision: review.revision,
        digest: review.digest,
        wording: "Owner-edited alternative.",
      },
    ],
    idempotencyKey: "bulk-wording",
  };
  const outcome = await repository.reviewWordingBatch(actor, request);
  expect(await repository.reviewWordingBatch(actor, request)).toEqual(outcome);
  const current = await repository.inspectResume(actor.id, draft.id);
  expect(captureWordingTarget(current.draft.data, current.graph, path).content.wording).toBe(
    "Owner-edited alternative.",
  );
  expect((await repository.inspectWording(actor.id, task.id)).staleReasons).toEqual([]);
});
it("rejects competing alternatives and stale batches before any wording or review changes", async () => {
  const { repository, actor, draft, generate } = await fixture();
  const first = await generate("first"),
    second = await generate("second");
  const item = (value: typeof first) => ({
    id: value.review.id,
    revision: 0,
    digest: value.review.digest,
    wording: "Selected text",
  });
  await expect(
    repository.reviewWordingBatch(actor, {
      draftId: draft.id,
      revision: 0,
      items: [item(first), item(second)],
      idempotencyKey: "competing",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await repository.inspectWording(actor.id, first.task.id)).proposal?.state).toBe(
    "Pending",
  );
  expect((await repository.inspectWording(actor.id, second.task.id)).proposal?.state).toBe(
    "Pending",
  );
  expect((await repository.inspectResume(actor.id, draft.id)).draft.revision).toBe(0);
});
it("applies a complete wording result set across pages in one draft revision", async () => {
  const { repository, actor, draft, data, request } = await fixture();
  const section = data.sections[1],
    block = section?.blocks[0],
    field = block?.fields[0],
    content = field?.contents[0];
  if (!section || !block || !field || !content) throw Error("Missing fixture placements");
  const contents = Array.from({ length: 12 }, () => ({ ...content, id: newId() }));
  const blocks = [
    {
      ...block,
      reason: "Synthetic batch fixture",
      fields: [{ ...field, contents: contents.slice(0, 6) }],
    },
    {
      ...block,
      reason: "Synthetic batch fixture",
      id: newId(),
      fields: [{ ...field, contents: contents.slice(6) }],
    },
  ];
  const expanded = {
    ...data,
    sections: data.sections.map((item) =>
      item.id !== section.id ? item : { ...item, reason: "Synthetic batch fixture", blocks },
    ),
  };
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: expanded,
    idempotencyKey: "expand",
  });
  const items = [];
  for (const [index, placement] of contents.entries()) {
    const task = await repository.startWording(
      actor,
      {
        ...request,
        revision: 1,
        path: {
          sectionId: section.id,
          blockId: blocks[index < 6 ? 0 : 1]?.id ?? block.id,
          contentId: placement.id,
        },
        idempotencyKey: `generate-${index}`,
      },
      profile,
    );
    if (!task.revisionId) throw Error("Missing operation");
    await repository.publishWording(actor.id, task.id, task.revisionId, output);
    const { proposal } = await repository.inspectWording(actor.id, task.id);
    if (!proposal) throw Error("Missing proposal");
    items.push({
      id: proposal.id,
      revision: 0,
      digest: proposal.digest,
      wording: `Reviewed alternative ${index + 1}.`,
    });
  }
  expect(await repository.listPendingWording(actor.id, draft.id)).toHaveLength(12);
  const batch = { draftId: draft.id, revision: 1, items, idempotencyKey: "apply-all" };
  const outcome = await repository.reviewWordingBatch(actor, batch);
  expect(await repository.reviewWordingBatch(actor, batch)).toEqual(outcome);
  const saved = await repository.inspectResume(actor.id, draft.id);
  expect(saved.draft.revision).toBe(2);
  expect(
    saved.draft.data.sections[1]?.blocks.flatMap((block) =>
      block.fields.flatMap((field) => field.contents.map((item) => item.override?.wording)),
    ),
  ).toEqual(items.map((item) => item.wording));
  expect(await repository.listPendingWording(actor.id, draft.id)).toHaveLength(0);
});

async function structuredFixture() {
  const base = await fixture();
  const summary = emptyStructuredContent("summary", newId());
  const summaryContent = {
    ...summary,
    record: {
      ...summary.record,
      values: { heading: "Summary", summary: "Original structured summary." },
    },
  };
  const experience = emptyStructuredContent("experience", newId());
  const experienceContent = {
    ...experience,
    record: {
      ...experience.record,
      values: {
        heading: "Experience",
        entries: [
          {
            id: newId(),
            schema: { id: "experience-entry", revision: 2 },
            layout: { id: "experience-entry-classic", revision: 2 },
            values: {
              employer: "Synthetic employer",
              title: "Developer",
              accomplishments: ["Built the synthetic form.", "Tested the synthetic form."],
            },
          },
        ],
      },
    },
  };
  const summaryRef = await base.save(
    {
      kind: "section",
      type: "summary",
      heading: "Summary",
      blocks: [],
      structured: summaryContent,
    },
    "structured-summary",
  );
  const experienceRef = await base.save(
    {
      kind: "section",
      type: "experience",
      heading: "Experience",
      blocks: [],
      structured: experienceContent,
    },
    "structured-experience",
  );
  const graph = await base.repository.libraryGraph(base.actor.id, [summaryRef, experienceRef]);
  const summaryPlacement = placeSection(summaryRef, graph),
    experiencePlacement = placeSection(experienceRef, graph);
  const data: Composition = {
    ...base.data,
    sections: [...base.data.sections, summaryPlacement, experiencePlacement],
  };
  await base.repository.saveResume(base.actor, {
    id: base.draft.id,
    revision: 0,
    data,
    idempotencyKey: "add-structured-sections",
  });
  const summaryPath = structuredWordingPaths(summaryContent, summaryPlacement.id).find(
    (item) => item.path.fieldId === "summary",
  )?.path;
  const experiencePath = structuredWordingPaths(experienceContent, experiencePlacement.id).find(
    (item) => item.path.fieldId === "accomplishments",
  )?.path;
  if (!summaryPath || !experiencePath) throw new Error("Missing structured fixture paths");
  const generateAt = async (path: WordingPath, key: string) => {
    const task = await base.repository.startWording(
      base.actor,
      { ...base.request, path, revision: 1, idempotencyKey: `start-${key}` },
      { ...profile, contract: "river-wording-v2" },
    );
    if (!task.revisionId) throw new Error("Missing operation");
    await base.repository.publishWording(base.actor.id, task.id, task.revisionId, {
      ...output,
      wording: `Suggested ${key}.`,
    });
    const detail = await base.repository.inspectWording(base.actor.id, task.id);
    if (!detail.proposal) throw new Error("Missing proposal");
    return {
      task,
      detail,
      item: {
        id: detail.proposal.id,
        revision: detail.proposal.revision,
        digest: detail.proposal.digest,
        wording: `Edited ${key}.`,
      },
    };
  };
  return { ...base, data, summaryRef, summaryContent, summaryPath, experiencePath, generateAt };
}

it("applies a mixed legacy, Summary, and nested-accomplishment batch atomically and idempotently", async () => {
  const {
    repository,
    actor,
    draft,
    data,
    path,
    summaryRef,
    summaryContent,
    summaryPath,
    experiencePath,
    generateAt,
  } = await structuredFixture();
  const choices = [
    await generateAt(path, "legacy"),
    await generateAt(summaryPath, "summary"),
    await generateAt(experiencePath, "accomplishment"),
  ];
  expect(choices.map((choice) => choice.detail.task.input.target.scope)).toEqual([
    "content-placement-v1",
    "structured-field-v1",
    "structured-field-v1",
  ]);
  const request = {
    draftId: draft.id,
    revision: 1,
    items: choices.map((choice) => choice.item),
    idempotencyKey: "apply-mixed",
  };
  const result = await repository.reviewWordingBatch(actor, request);
  expect(await repository.reviewWordingBatch(actor, request)).toEqual(result);
  const saved = await repository.inspectResume(actor.id, draft.id);
  expect(saved.draft.revision).toBe(2);
  expect(saved.draft.data).toEqual(
    choices.reduce(
      (current, choice) =>
        applyWordingProposal(current, choice.detail.task.input.target.path, {
          ...output,
          wording: choice.item.wording,
        }),
      data,
    ),
  );
  expect((await repository.getLibraryRevision(actor.id, summaryRef))?.revision.data).toMatchObject({
    structured: summaryContent,
  });
  for (const choice of choices) {
    const detail = await repository.inspectWording(actor.id, choice.task.id);
    expect(detail.proposal).toMatchObject({ state: "Accepted", appliedRevision: 2 });
    expect(detail.staleReasons).toEqual([]);
  }
});

it("refuses an entire mixed batch after a structured target changes, preserving all pending choices", async () => {
  const { repository, actor, draft, data, summaryPath, experiencePath, generateAt } =
    await structuredFixture();
  const choices = [
    await generateAt(summaryPath, "summary"),
    await generateAt(experiencePath, "accomplishment"),
  ];
  const changed = replaceStructuredWording(data, experiencePath, "Later independent target edit.");
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 1,
    data: changed,
    idempotencyKey: "change-target",
  });
  await expect(
    repository.reviewWordingBatch(actor, {
      draftId: draft.id,
      revision: 2,
      items: choices.map((choice) => choice.item),
      idempotencyKey: "stale-mixed",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await repository.getResume(actor.id, draft.id))?.data).toEqual(changed);
  for (const choice of choices)
    expect((await repository.inspectWording(actor.id, choice.task.id)).proposal?.state).toBe(
      "Pending",
    );
});

it("accepts structured wording after a sibling edit, supplies scoped Undo, and rejects cancelled late output", async () => {
  const { repository, actor, draft, data, summaryPath, experiencePath, request, generateAt } =
    await structuredFixture();
  const choice = await generateAt(experiencePath, "accomplishment");
  const changed = replaceStructuredWording(
    data,
    { ...experiencePath, index: 1 },
    "Independent sibling edit.",
  );
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 1,
    data: changed,
    idempotencyKey: "change-sibling",
  });
  expect((await repository.inspectWording(actor.id, choice.task.id)).staleReasons).toEqual([]);
  await repository.reviewWording(actor, {
    ...choice.item,
    decision: "Accepted",
    idempotencyKey: "accept-structured",
  });
  const saved = await repository.inspectResume(actor.id, draft.id);
  const payload = { ...output, wording: choice.item.wording };
  expect(
    undoAcceptedWording(saved.draft.data, saved.graph, choice.detail.task.input.target, payload),
  ).toEqual(changed);
  const pending = await repository.startWording(
    actor,
    { ...request, revision: 3, path: summaryPath, idempotencyKey: "cancel-structured" },
    { ...profile, contract: "river-wording-v2" },
  );
  if (!pending.revisionId) throw new Error("Missing operation");
  await repository.cancelOperation(actor.id, pending.revisionId, "cancel-structured");
  expect(
    await repository.publishWording(actor.id, pending.id, pending.revisionId, output),
  ).toBeNull();
  expect((await repository.getResume(actor.id, draft.id))?.data).toEqual(saved.draft.data);
});

it("keeps every observed context revision in a bulk guard instead of masking an older choice", async () => {
  const { repository, actor, draft, data, summaryPath, experiencePath, request } =
    await structuredFixture();
  const contextData = {
    kind: "Project" as const,
    label: "Shared context",
    organization: "Synthetic employer",
    role: "Developer",
    startDate: "",
    endDate: "",
    details: "Original context details",
    contact: null,
  };
  const context = await repository.saveContext(actor, {
    id: null,
    revision: null,
    data: contextData,
    idempotencyKey: "shared-context",
  });
  if (!context.revisionId) throw new Error("Missing context");
  const material = {
    assertion: "Built the synthetic form.",
    citations: [],
    contexts: [{ id: context.id, revisionId: context.revisionId }],
  };
  const evidence = await repository.createEvidence(
    actor,
    {
      material,
      metadata: { label: "Shared evidence", tags: [], notes: "" },
      idempotencyKey: "shared-evidence",
    },
    material,
  );
  if (!evidence.revisionId) throw new Error("Missing evidence");
  const references = [{ claimId: evidence.id, revisionId: evidence.revisionId }];
  const attached = replaceStructuredWording(
    replaceStructuredWording(data, summaryPath, "Original structured summary.", references),
    experiencePath,
    "Built the synthetic form.",
    references,
  );
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 1,
    data: attached,
    idempotencyKey: "attach-shared-support",
  });
  const generate = async (path: WordingPath, key: string) => {
    const task = await repository.startWording(
      actor,
      { ...request, path, revision: 2, idempotencyKey: key },
      { ...profile, contract: "river-wording-v2" },
    );
    if (!task.revisionId) throw new Error("Missing operation");
    await repository.publishWording(actor.id, task.id, task.revisionId, {
      ...output,
      evidence: references,
    });
    const result = await repository.inspectWording(actor.id, task.id);
    if (!result.proposal) throw new Error("Missing choice");
    return {
      taskId: task.id,
      id: result.proposal.id,
      revision: result.proposal.revision,
      digest: result.proposal.digest,
      wording: output.wording,
    };
  };
  const older = await generate(summaryPath, "before-context-change");
  await repository.saveContext(actor, {
    id: context.id,
    revision: 0,
    data: { ...contextData, details: "Changed context details" },
    idempotencyKey: "change-shared-context",
  });
  const newer = await generate(experiencePath, "after-context-change");
  expect(
    (await repository.inspectWording(actor.id, older.taskId)).staleReasons.join(" "),
  ).toContain("context changed");
  expect((await repository.inspectWording(actor.id, newer.taskId)).staleReasons).toEqual([]);
  await expect(
    repository.reviewWordingBatch(actor, {
      draftId: draft.id,
      revision: 2,
      items: [older, newer],
      idempotencyKey: "mixed-context-revisions",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await repository.getResume(actor.id, draft.id))?.data).toEqual(attached);
  for (const item of [older, newer])
    expect((await repository.inspectWording(actor.id, item.taskId)).proposal?.state).toBe(
      "Pending",
    );
});
