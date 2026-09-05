import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { historyWording, newId, type Principal } from "@river/domain";
import { beforeAll, expect, it } from "vitest";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
it("pins complete content and rejects an obsolete working revision without changing history", async () => {
  const { repository, actor, draft, data } = await compositionFixture();
  const checkpoint = await repository.captureCheckpoint(actor, {
    id: draft.id,
    revision: 0,
    idempotencyKey: "comparison-capture",
  });
  const base = await repository.historySnapshot(actor, { kind: "checkpoint", id: checkpoint.id });
  const working = await repository.historySnapshot(actor, {
    kind: "draft",
    id: draft.id,
    revision: 0,
  });
  expect(working.content).toEqual(base.content);
  expect(working.pdf).toBeNull();
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: {
      ...data,
      name: "New draft name",
      sections: data.sections.map((section) =>
        section.type === "summary"
          ? { ...section, heading: "New heading", reason: "Compare the changed heading" }
          : section,
      ),
    },
    idempotencyKey: "comparison-newer",
  });
  expect((await repository.historyDraftHead(actor, draft.id)).revision).toBe(1);
  expect(working.content.data.name).toBe(data.name);
  await expect(
    repository.historySnapshot(actor, { kind: "draft", id: draft.id, revision: 0 }),
  ).rejects.toMatchObject({ code: "Conflict", expectedRevision: 0, observedRevision: 1 });
  const fresh = await repository.historySnapshot(actor, {
    kind: "draft",
    id: draft.id,
    revision: 1,
  });
  expect(fresh.digest).not.toBe(working.digest);
  expect(fresh.content.posting).toEqual(base.content.posting);
  expect(
    historyWording(fresh.content.data, fresh.content.graph).map((item) => item.value),
  ).toContain("New heading");
  expect(
    (await repository.historySnapshot(actor, { kind: "checkpoint", id: checkpoint.id })).digest,
  ).toBe(base.digest);
  const other = await compositionFixture();
  await expect(
    repository.historySnapshot(other.actor, { kind: "checkpoint", id: checkpoint.id }),
  ).rejects.toMatchObject({ code: "NotFound" });
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: actor.ownerId,
    scopes: ["jobs:read"],
  };
  await expect(
    repository.historySnapshot(agent, { kind: "draft", id: draft.id, revision: 1 }),
  ).rejects.toMatchObject({ code: "Forbidden" });
  await expect(repository.historyDraftHead(agent, draft.id)).rejects.toMatchObject({
    code: "Forbidden",
  });
});
it("compares incomplete saved drafts without requiring successful document compilation", async () => {
  const { repository, actor, draft, data } = await compositionFixture();
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: { ...data, sections: [] },
    idempotencyKey: "empty-composition",
  });
  const result = await repository.historySnapshot(actor, {
    kind: "draft",
    id: draft.id,
    revision: 1,
  });
  expect(result.content.data.sections).toEqual([]);
  expect(result.content.graph).toEqual([]);
  expect(result.pdf).toBeNull();
});
