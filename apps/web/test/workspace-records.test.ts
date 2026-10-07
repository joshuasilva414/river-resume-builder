import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { renderingFixture, type SaveRecord } from "@river/domain/workspace";
import { expect, it } from "vitest";

async function fixture() {
  const repository = createRepository(env.DB),
    id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "Workspace fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { repository, actor };
}
function factSave(id = newId()): SaveRecord {
  return {
    id,
    revision: 0,
    idempotencyKey: newId(),
    payload: {
      kind: "fact",
      data: {
        id,
        key: "skill",
        label: "Skill",
        contextId: null,
        sourceId: null,
        value: { kind: "skill", value: "TypeScript" },
      },
    },
  };
}
it("isolates owners, enforces scoped writes, detects conflicts and replays a committed request", async () => {
  const { repository, actor } = await fixture(),
    other = await fixture(),
    input = factSave();
  const saved = await repository.saveWorkspaceRecord(actor, input);
  expect(await repository.saveWorkspaceRecord(actor, input)).toEqual(saved);
  await expect(repository.getWorkspaceRecord(other.actor.ownerId, input.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  await expect(
    repository.saveWorkspaceRecord(actor, {
      ...input,
      payload: { kind: "context", data: { id: input.id, kind: "profile", label: "Changed" } },
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    repository.saveWorkspaceRecord(
      { kind: "agent", id: newId(), ownerId: actor.ownerId, scopes: ["facts:read"] },
      factSave(),
    ),
  ).rejects.toMatchObject({ code: "Forbidden" });
  const changed = { ...input, revision: 1, idempotencyKey: newId() };
  await repository.saveWorkspaceRecord(actor, changed);
  await expect(
    repository.saveWorkspaceRecord(actor, { ...changed, idempotencyKey: newId() }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("imports facts and contexts atomically and rejects foreign source or context associations", async () => {
  const { repository, actor } = await fixture(),
    other = await fixture(),
    contextId = newId();
  await repository.saveWorkspaceRecord(other.actor, {
    id: contextId,
    revision: 0,
    idempotencyKey: newId(),
    payload: { kind: "context", data: { id: contextId, label: "Private", kind: "profile" } },
  });
  const value = factSave().payload;
  if (value.kind !== "fact") throw Error("fixture");
  await expect(
    repository.importWorkspaceFacts(actor, {
      idempotencyKey: newId(),
      contexts: [],
      facts: [{ ...value.data, contextId }],
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(await repository.listWorkspaceRecords(actor.ownerId)).toHaveLength(0);
  const own = newId();
  await repository.importWorkspaceFacts(actor, {
    idempotencyKey: newId(),
    contexts: [{ id: own, label: "Profile", kind: "profile" }],
    facts: Array.from({ length: 50 }, () => ({ ...value.data, id: newId(), contextId: own })),
  });
  expect(await repository.listWorkspaceRecords(actor.ownerId, "fact")).toHaveLength(50);
  await expect(
    repository.deleteWorkspaceRecord(actor, { id: own, revision: 1, idempotencyKey: newId() }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("retains immutable versions while draft edits create new revisions", async () => {
  const { repository, actor } = await fixture(),
    resumeId = newId(),
    versionId = newId();
  const snapshot = renderingFixture(1);
  await repository.saveWorkspaceRecord(actor, {
    id: resumeId,
    revision: 0,
    idempotencyKey: newId(),
    payload: { kind: "resume", data: snapshot },
  });
  const version: SaveRecord = {
    id: versionId,
    revision: 0,
    idempotencyKey: newId(),
    payload: {
      kind: "version",
      data: { version: 1, name: "Before changes", resumeId, draftRevision: 1, snapshot },
    },
  };
  await repository.saveWorkspaceRecord(actor, version);
  await repository.saveWorkspaceRecord(actor, {
    id: resumeId,
    revision: 1,
    idempotencyKey: newId(),
    payload: { kind: "resume", data: { ...snapshot, name: "Changed" } },
  });
  await expect(
    repository.saveWorkspaceRecord(actor, { ...version, revision: 1, idempotencyKey: newId() }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(await repository.getWorkspaceRecord(actor.ownerId, versionId)).toMatchObject({
    data: { snapshot: { name: "Fictional rendering fixture" } },
  });
});
it("archives once, preserves owner boundaries, and leaves accounts and new facts intact", async () => {
  const { repository, actor } = await fixture(),
    other = await fixture();
  const id = newId(),
    revisionId = newId(),
    now = Date.now();
  await repository.db.insert(schema.contexts).values({
    id,
    ownerId: actor.ownerId,
    kind: "Owner Profile",
    label: "Historical profile",
    revision: 0,
    currentRevisionId: revisionId,
    createdAt: now,
    updatedAt: now,
  });
  await repository.saveWorkspaceRecord(actor, factSave());
  const first = await repository.archiveLegacyWorkspace(actor, newId());
  expect(first?.counts.contexts).toBe(1);
  expect(await repository.archiveLegacyWorkspace(actor, newId())).toEqual(first);
  const entries = await repository.listWorkspaceArchive(actor.ownerId);
  expect(entries).toHaveLength(1);
  await expect(
    repository.readWorkspaceArchive(other.actor.ownerId, "contexts", id),
  ).rejects.toMatchObject({ code: "NotFound" });
  expect(await repository.listWorkspaceRecords(actor.ownerId, "fact")).toHaveLength(1);
});
