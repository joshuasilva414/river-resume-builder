import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { type JobTargetInput, jobMatchInputKey } from "@river/domain/workspace";
import { Effect, Layer } from "effect";
import { expect, it } from "vitest";
import { Actor, Store } from "../src/server/services";
import { suggestJobFacts } from "../src/server/workspace-job-matching";

async function fixture() {
  const repository = createRepository(env.DB),
    id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@test.invalid`,
    name: "Job fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const factId = newId();
  await repository.saveWorkspaceRecord(actor, {
    id: factId,
    revision: 0,
    idempotencyKey: newId(),
    payload: {
      kind: "fact",
      data: {
        id: factId,
        key: "skill",
        label: "Skill",
        value: { kind: "skill", value: "TypeScript" },
        contextId: null,
        sourceId: null,
      },
    },
  });
  const job: JobTargetInput = {
    id: newId(),
    revision: 0,
    idempotencyKey: newId(),
    details: { role: "Engineer", company: "Fictional", location: "Remote" },
    description: "Build accessible TypeScript products.",
    url: null,
    factIds: [factId],
    archived: false,
  };
  return { repository, actor, factId, job };
}
it("saves scoped fact selections with posting snapshots, replay and revision protection", async () => {
  const { repository, actor, job, factId } = await fixture(),
    other = await fixture();
  const saved = await repository.saveWorkspaceJob(actor, job);
  expect(await repository.saveWorkspaceJob(actor, job)).toEqual(saved);
  expect(await repository.getWorkspaceJob(actor.ownerId, job.id)).toMatchObject({
    factIds: [factId],
    description: job.description,
    snapshots: [{ text: job.description }],
  });
  await expect(repository.getWorkspaceJob(other.actor.ownerId, job.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  await expect(
    repository.saveWorkspaceJob(actor, { ...job, idempotencyKey: newId() }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    repository.saveWorkspaceJob(actor, {
      ...job,
      revision: 1,
      idempotencyKey: newId(),
      factIds: [other.factId],
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    repository.saveWorkspaceJob(
      { kind: "agent", id: newId(), ownerId: actor.ownerId, scopes: ["jobs:read"] },
      { ...job, revision: 1, idempotencyKey: newId() },
    ),
  ).rejects.toMatchObject({ code: "Forbidden" });
  await repository.saveWorkspaceJob(actor, {
    ...job,
    revision: 1,
    idempotencyKey: newId(),
    description: "Changed posting",
    factIds: [],
  });
  const after = await repository.getWorkspaceJob(actor.ownerId, job.id);
  expect(after.snapshots).toHaveLength(2);
  expect(after.factIds).toEqual([]);
  expect(await repository.getWorkspaceRecord(actor.ownerId, factId)).toMatchObject({
    data: { value: { value: "TypeScript" } },
  });
});
it("rejects stale job matching inputs before AI and keeps manual selection available without a configured provider", async () => {
  const { repository, actor, job } = await fixture();
  await repository.saveWorkspaceJob(actor, job);
  const inputKey = jobMatchInputKey(
    { id: job.id, description: job.description },
    await repository.listWorkspaceRecords(actor.ownerId, "fact"),
  );
  const run = (key: string) =>
    Effect.runPromise(
      suggestJobFacts(env, { jobId: job.id, inputKey: key, idempotencyKey: newId() }).pipe(
        Effect.provide(Layer.merge(Layer.succeed(Actor, actor), Layer.succeed(Store, repository))),
      ),
    );
  await expect(run("stale")).rejects.toThrow(/changed/);
  await expect(run(inputKey)).rejects.toThrow(/AI connection/);
  expect(await repository.listWorkspaceRuns(actor.ownerId, job.id)).toEqual([]);
  expect(await repository.getWorkspaceJob(actor.ownerId, job.id)).toMatchObject({
    factIds: job.factIds,
  });
});
it("restores facts only after their context and prevents stale or foreign restores", async () => {
  const { repository, actor, factId } = await fixture(),
    other = await fixture(),
    contextId = newId();
  await repository.saveWorkspaceRecord(actor, {
    id: contextId,
    revision: 0,
    idempotencyKey: newId(),
    payload: { kind: "context", data: { id: contextId, kind: "profile", label: "Profile" } },
  });
  const fact = await repository.getWorkspaceRecord(actor.ownerId, factId);
  if (fact.kind !== "fact") throw Error("fixture");
  await repository.saveWorkspaceRecord(actor, {
    id: factId,
    revision: 1,
    idempotencyKey: newId(),
    payload: { kind: "fact", data: { ...fact.data, contextId } },
  });
  await repository.deleteWorkspaceRecord(actor, {
    id: factId,
    revision: 2,
    idempotencyKey: newId(),
  });
  await repository.deleteWorkspaceRecord(actor, {
    id: contextId,
    revision: 1,
    idempotencyKey: newId(),
  });
  await expect(
    repository.restoreWorkspaceRecord(actor, { id: factId, revision: 3, idempotencyKey: newId() }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    repository.restoreWorkspaceRecord(other.actor, {
      id: contextId,
      revision: 2,
      idempotencyKey: newId(),
    }),
  ).rejects.toMatchObject({ code: "NotFound" });
  await repository.restoreWorkspaceRecord(actor, {
    id: contextId,
    revision: 2,
    idempotencyKey: newId(),
  });
  await expect(
    repository.restoreWorkspaceRecord(actor, { id: factId, revision: 2, idempotencyKey: newId() }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await repository.restoreWorkspaceRecord(actor, {
    id: factId,
    revision: 3,
    idempotencyKey: newId(),
  });
  expect(await repository.getWorkspaceRecord(actor.ownerId, factId)).toMatchObject({
    revision: 4,
    data: { contextId },
  });
});
