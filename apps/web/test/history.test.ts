import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { schema } from "@river/db";
import { newId, type Principal, renderComposition } from "@river/domain";
import { expectedText } from "@river/templates";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
it("captures an immutable label and restores an exact historical composition into an independent branch", async () => {
  const { repository, actor, draft, data, content } = await compositionFixture();
  const request = {
    id: draft.id,
    revision: 0,
    label: "  Before tailoring  ",
    idempotencyKey: "history-capture",
  };
  const checkpoint = await repository.captureCheckpoint(actor, request);
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: { ...data, name: "Newer original draft" },
    idempotencyKey: "newer-draft",
  });
  await repository.saveLibrary(actor, {
    id: content.itemId,
    revision: 0,
    label: "New library wording",
    rationale: "A separate current revision",
    data: {
      kind: "content",
      type: "summary",
      wording: "Newer library text must not enter history.",
      evidence: [],
    },
    idempotencyKey: "newer-library",
  });
  const original = await repository.inspectCheckpoint(actor.ownerId, checkpoint.id);
  expect(original.checkpoint.label).toBe("Before tailoring");
  expect(await repository.captureCheckpoint(actor, request)).toEqual(checkpoint);
  const restore = {
    checkpointId: checkpoint.id,
    name: "Historical branch",
    idempotencyKey: "restore-historical",
  };
  const branch = await repository.restoreCheckpoint(actor, restore);
  expect(await repository.restoreCheckpoint(actor, restore)).toEqual(branch);
  const detail = await repository.inspectResume(actor.ownerId, branch.id);
  expect(detail.draft.data.name).toBe("Historical branch");
  expect(detail.draft.branchOf).toBe(draft.id);
  expect(detail.draft.branchRevision).toBe(0);
  expect(detail.draft.snapshotId).toBe(original.checkpoint.snapshotId);
  expect(detail.draft.data.sections[0]?.id).not.toBe(data.sections[0]?.id);
  expect(detail.draft.data.sections[0]?.blocks[0]?.id).not.toBe(data.sections[0]?.blocks[0]?.id);
  expect(expectedText(renderComposition(detail.draft.data, detail.graph))).toBe(
    expectedText(original.checkpoint.document),
  );
  const lineage = await repository.db
    .select()
    .from(schema.resumeCheckpointBranches)
    .where(eq(schema.resumeCheckpointBranches.draftId, branch.id));
  expect(lineage).toEqual([
    { draftId: branch.id, fromCheckpointId: checkpoint.id, structuredBaseId: checkpoint.id },
  ]);
  await repository.saveResume(actor, {
    id: branch.id,
    revision: 0,
    data: { ...detail.draft.data, name: "Changed branch" },
    idempotencyKey: "branch-edit",
  });
  expect((await repository.getResume(actor.ownerId, draft.id))?.data.name).toBe(
    "Newer original draft",
  );
  expect((await repository.inspectCheckpoint(actor.ownerId, checkpoint.id)).checkpoint).toEqual(
    original.checkpoint,
  );
  expect(
    (await repository.listCheckpoints(actor.ownerId, { draftId: draft.id, offset: 0 })).items[0]
      ?.label,
  ).toBe("Before tailoring");
});
it("requires Owner access and explicit confirmation for a replacement template while preserving the source", async () => {
  const { repository, actor, draft } = await compositionFixture();
  const checkpoint = await repository.captureCheckpoint(actor, {
    id: draft.id,
    revision: 0,
    idempotencyKey: "replacement-capture",
  });
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: actor.ownerId,
    scopes: ["jobs:write"],
  };
  const request = {
    checkpointId: checkpoint.id,
    name: "Minimal branch",
    replacement: { theme: "minimal" as const, template: null, confirmed: false },
    idempotencyKey: "replacement-branch",
  };
  await expect(repository.restoreCheckpoint(agent, request)).rejects.toMatchObject({
    code: "Forbidden",
  });
  await expect(repository.inspectCheckpointBranch(agent, checkpoint.id)).rejects.toMatchObject({
    code: "Forbidden",
  });
  await expect(repository.restoreCheckpoint(actor, request)).rejects.toMatchObject({
    code: "InvalidInput",
  });
  expect(
    (await repository.listResumes(actor.ownerId, { jobId: null, offset: 0 })).items,
  ).toHaveLength(1);
  const branch = await repository.restoreCheckpoint(actor, {
    ...request,
    replacement: { ...request.replacement, confirmed: true },
  });
  expect((await repository.getResume(actor.ownerId, branch.id))?.data.theme).toBe("minimal");
  expect(
    (await repository.inspectCheckpoint(actor.ownerId, checkpoint.id)).checkpoint.data.theme,
  ).toBe("classic");
  await expect(
    repository.restoreCheckpoint(actor, { ...request, name: "Changed request" }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
