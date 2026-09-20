import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { expect, it } from "vitest";

async function fixture() {
  const repository = createRepository(env.DB),
    id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "Import fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { repository, actor };
}
it("stores supplied source text without a document dispatch and retains private associations", async () => {
  const { repository, actor } = await fixture(),
    other = await fixture(),
    id = newId();
  const input = {
    id,
    idempotencyKey: newId(),
    title: "Supplied text",
    filename: "facts.txt",
    mime: "text/plain" as const,
    text: "Worked at Northstar.",
    parser: "agent-text",
    parserVersion: "1",
    provenanceUrl: null,
    note: "",
  };
  const objects = {
    original: { key: `sources/${actor.id}/${id}/original`, digest: "a".repeat(64), size: 20 },
    text: { key: `sources/${actor.id}/${id}/text`, digest: "b".repeat(64) },
  };
  const result = await repository.saveExtractedSource(actor, input, objects);
  expect(await repository.saveExtractedSource(actor, input, objects)).toEqual(result);
  const source = await repository.db.select().from(schema.sources);
  expect(source.find((item) => item.id === id)).toMatchObject({
    ownerId: actor.id,
    state: "Ready",
  });
  const factId = newId();
  await expect(
    repository.saveWorkspaceRecord(other.actor, {
      id: factId,
      revision: 0,
      idempotencyKey: newId(),
      payload: {
        kind: "fact",
        data: {
          id: factId,
          key: "detail",
          label: "Detail",
          contextId: null,
          sourceId: id,
          value: { kind: "text", value: [{ text: "Copied" }] },
        },
      },
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("retains AI runs with idempotency, scoped ownership, and immutable completed results", async () => {
  const { repository, actor } = await fixture(),
    other = await fixture();
  const input = {
    idempotencyKey: newId(),
    kind: "fact-import" as const,
    targetId: null,
    input: JSON.stringify({ text: "Candidate text" }),
  };
  const run = await repository.beginWorkspaceRun(actor, input);
  expect(await repository.beginWorkspaceRun(actor, input)).toEqual(run);
  await expect(repository.getWorkspaceRun(other.actor.id, run.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  await repository.finishWorkspaceRun(actor.id, run.id, {
    result: JSON.stringify({ facts: [] }),
    metadata: JSON.stringify({ model: "test" }),
  });
  expect(await repository.getWorkspaceRun(actor.id, run.id)).toMatchObject({
    state: "Complete",
    metadata: JSON.stringify({ model: "test" }),
  });
  await expect(
    repository.finishWorkspaceRun(actor.id, run.id, { error: "Overwrite" }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("reserves existing scoring allowance and releases a failed attempt without charging it", async () => {
  const { repository, actor } = await fixture();
  const run = await repository.beginWorkspaceRun(actor, {
    idempotencyKey: newId(),
    kind: "template-score",
    targetId: null,
    input: "{}",
  });
  expect(await repository.readScoringAllowance(actor)).toMatchObject({ reserved: 3, used: 0 });
  await repository.finishWorkspaceRun(actor.id, run.id, { error: "Provider unavailable" });
  expect(await repository.readScoringAllowance(actor)).toMatchObject({ reserved: 0, used: 0 });
});
