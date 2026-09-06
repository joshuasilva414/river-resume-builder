import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import {
  type BlockData,
  type ContentData,
  type LibraryReference,
  newId,
  type Principal,
  type SectionData,
} from "@river/domain";
import { beforeAll, expect, it } from "vitest";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
async function fixture() {
  const repository = createRepository(env.DB);
  const id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "Library fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const save = async (data: ContentData | BlockData | SectionData, key: string, label = key) => {
    const outcome = await repository.saveLibrary(actor, {
      id: null,
      revision: null,
      idempotencyKey: key,
      label,
      data,
      rationale: "Synthetic fixture",
    });
    if (!outcome.revisionId) throw Error("Missing library revision");
    return { itemId: outcome.id, revisionId: outcome.revisionId } satisfies LibraryReference;
  };
  return { repository, actor, save };
}
it("keeps nested Content, Block, and Section revisions immutable after library edits", async () => {
  const { repository, actor, save } = await fixture();
  const title = await save(
    { kind: "content", type: "project", wording: "Original project", evidence: [] },
    "title",
  );
  const bullet = await save(
    { kind: "content", type: "project", wording: "Original accomplishment", evidence: [] },
    "bullet",
  );
  const blockData: BlockData = {
    kind: "block",
    type: "project",
    fields: [
      { key: "title", contents: [{ id: newId(), ...title }] },
      { key: "bullets", contents: [{ id: newId(), ...bullet }] },
    ],
  };
  const block = await save(blockData, "block");
  const section = await save(
    { kind: "section", type: "project", heading: "Projects", blocks: [{ id: newId(), ...block }] },
    "section",
  );
  await repository.saveLibrary(actor, {
    id: bullet.itemId,
    revision: 0,
    idempotencyKey: "edit-bullet",
    label: "Current bullet",
    rationale: "New reusable wording",
    data: { kind: "content", type: "project", wording: "New accomplishment", evidence: [] },
  });
  const graph = await repository.libraryGraph(actor.id, [section]);
  expect(graph).toHaveLength(4);
  expect(
    graph.find((entry) => entry.revision.id === bullet.revisionId)?.revision.data,
  ).toMatchObject({ wording: "Original accomplishment" });
  expect((await repository.getLibraryRevision(actor.id, block))?.revision.data).toEqual(blockData);
  expect((await repository.getLibraryItem(actor.id, bullet.itemId))?.currentRevisionId).not.toBe(
    bullet.revisionId,
  );
});
it("rejects incompatible fields and children and prevents agent library mutation", async () => {
  const { repository, actor, save } = await fixture();
  const skill = await save(
    { kind: "content", type: "skill", wording: "Synthetic skill", evidence: [] },
    "skill",
  );
  await expect(
    save(
      {
        kind: "block",
        type: "project",
        fields: [{ key: "title", contents: [{ id: newId(), ...skill }] }],
      },
      "wrong-type",
    ),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(
    save(
      {
        kind: "block",
        type: "summary",
        fields: [{ key: "title", contents: [{ id: newId(), ...skill }] }],
      },
      "wrong-field",
    ),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(
    save(
      { kind: "section", type: "skill", heading: "Skills", blocks: [{ id: newId(), ...skill }] },
      "wrong-child-kind",
    ),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(
    repository.saveLibrary(
      { kind: "agent", ownerId: actor.id, id: newId(), scopes: ["evidence:write", "jobs:write"] },
      {
        id: null,
        revision: null,
        label: "Forbidden",
        data: { kind: "content", type: "skill", wording: "No agent authoring", evidence: [] },
        rationale: "",
        idempotencyKey: "forbidden",
      },
    ),
  ).rejects.toMatchObject({ code: "Forbidden" });
  await expect(repository.libraryGraph(newId(), [skill])).rejects.toMatchObject({
    code: "NotFound",
  });
});
it("replays exact outcomes and allows only one concurrent library revision", async () => {
  const { repository, actor } = await fixture();
  const data: ContentData = {
    kind: "content",
    type: "summary",
    wording: "Original wording",
    evidence: [],
  };
  const request = {
    id: null,
    revision: null,
    label: "Summary",
    data,
    rationale: "",
    idempotencyKey: "create",
  };
  const results = await Promise.all([
    repository.saveLibrary(actor, request),
    repository.saveLibrary(actor, request),
  ]);
  expect(results[0]).toEqual(results[1]);
  const original = results[0];
  if (!original?.revisionId) throw Error("Missing revision");
  const updates = await Promise.allSettled(
    ["First", "Second"].map((wording) =>
      repository.saveLibrary(actor, {
        ...request,
        id: original.id,
        revision: 0,
        data: { ...data, wording },
        idempotencyKey: wording,
      }),
    ),
  );
  expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const detail = await repository.inspectLibrary(actor.id, { id: original.id });
  expect(detail.item.revision).toBe(1);
  expect(detail.history).toHaveLength(2);
  expect(await repository.saveLibrary(actor, request)).toEqual(original);
  await expect(
    repository.saveLibrary(actor, { ...request, label: "Changed payload" }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("keeps exact evidence links and derives staleness without relinking content", async () => {
  const { repository, actor, save } = await fixture();
  const material = { assertion: "Original synthetic evidence", citations: [], contexts: [] };
  const claim = await repository.createEvidence(
    actor,
    { material, metadata: { label: "", tags: [], notes: "" }, idempotencyKey: "claim" },
    material,
  );
  if (!claim.revisionId) throw Error("Missing evidence revision");
  const content = await save(
    {
      kind: "content",
      type: "experience",
      wording: "Synthetic wording",
      evidence: [{ claimId: claim.id, revisionId: claim.revisionId }],
    },
    "content",
  );
  await repository.editEvidence(
    actor,
    {
      id: claim.id,
      revision: 0,
      material: { ...material, assertion: "New evidence" },
      idempotencyKey: "edit",
    },
    { ...material, assertion: "New evidence" },
  );
  const detail = await repository.inspectLibrary(actor.id, { id: content.itemId });
  expect(detail.evidence[0]).toMatchObject({
    revisionId: claim.revisionId,
    assertion: material.assertion,
    state: "Draft",
    stale: true,
    unsupported: true,
  });
  expect(detail.item.revision).toBe(0);
});

it("archives every library kind without rewriting pinned drafts or checkpoints and restores the same revisions", async () => {
  const { repository, actor, draft, data } = await compositionFixture();
  const capture = await repository.captureCheckpoint(actor, {
    id: draft.id,
    revision: 0,
    idempotencyKey: "capture",
  });
  const before = await repository.inspectCheckpoint(actor.id, capture.id);
  const references = data.sections.map((section) => section.reference);
  const graph = await repository.libraryGraph(actor.id, references);
  const requests = [];
  for (const { item } of graph) {
    const request = {
      id: item.id,
      revision: item.revision,
      archived: true,
      rationale: "Retire synthetic library fixture",
      idempotencyKey: `archive-${item.id}`,
    };
    requests.push(request);
    const archived = await repository.setLibraryArchived(actor, request);
    expect(archived.revisionId).toBe(item.currentRevisionId);
    expect(archived.revision).toBe(item.revision + 1);
  }
  for (const kind of ["content", "block", "section"] as const) {
    const input = { kind, type: null, query: "", offset: 0 };
    expect((await repository.listLibrary(actor.id, input)).items).toHaveLength(0);
    expect(
      (await repository.listLibrary(actor.id, { ...input, archived: true })).items,
    ).toHaveLength(2);
  }
  expect(
    (await repository.libraryGraph(actor.id, references)).map((entry) => entry.revision),
  ).toEqual(graph.map((entry) => entry.revision));
  const after = await repository.inspectCheckpoint(actor.id, capture.id);
  expect(after.checkpoint).toEqual(before.checkpoint);
  expect(after.report).toEqual(before.report);
  expect((await repository.inspectResume(actor.id, draft.id)).draft.data).toEqual(data);
  for (const request of requests) {
    const restored = await repository.setLibraryArchived(actor, {
      ...request,
      archived: false,
      revision: 1,
      idempotencyKey: `restore-${request.id}`,
    });
    expect(restored.revision).toBe(2);
    expect(await repository.setLibraryArchived(actor, request)).toMatchObject({ revision: 1 });
    const detail = await repository.inspectLibrary(actor.id, { id: request.id });
    expect(detail.item.archivedAt).toBeNull();
    expect(detail.history).toHaveLength(1);
    expect(detail.lifecycle).toHaveLength(2);
    expect(detail.lifecycle.every((entry) => entry.rationale === request.rationale)).toBe(true);
  }
});

it("guards concurrent archive and editing, enforces Owner access, and permanently deduplicates lifecycle writes", async () => {
  const { repository, actor, save } = await fixture();
  const content = { kind: "content", type: "summary", wording: "Preserved", evidence: [] } as const;
  const ref = await save(content, "archive-race");
  const request = {
    id: ref.itemId,
    revision: 0,
    archived: true,
    rationale: "Fixture complete",
    idempotencyKey: "archive",
  };
  const agent: Principal = {
    kind: "agent",
    ownerId: actor.id,
    id: newId(),
    scopes: ["evidence:archive"],
  };
  await expect(repository.setLibraryArchived(agent, request)).rejects.toMatchObject({
    code: "Forbidden",
  });
  const other = newId();
  await expect(
    repository.setLibraryArchived({ kind: "owner", id: other, ownerId: other }, request),
  ).rejects.toMatchObject({ code: "NotFound" });
  await expect(
    repository.setLibraryArchived(actor, { ...request, rationale: "  " }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  const results = await Promise.all([
    repository.setLibraryArchived(actor, request),
    repository.setLibraryArchived(actor, request),
  ]);
  expect(results[0]).toEqual(results[1]);
  await expect(
    repository.saveLibrary(actor, {
      id: ref.itemId,
      revision: 0,
      idempotencyKey: "stale-edit",
      label: "Changed",
      data: content,
      rationale: "stale",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    repository.saveLibrary(actor, {
      id: ref.itemId,
      revision: 1,
      idempotencyKey: "archived-edit",
      label: "Changed",
      data: content,
      rationale: "archived",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    repository.setLibraryArchived(actor, { ...request, rationale: "Changed payload" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const detail = await repository.inspectLibrary(actor.id, { id: ref.itemId });
  expect(detail.item.revision).toBe(1);
  expect(detail.revision.data).toEqual(content);
  expect(detail.history).toHaveLength(1);
  expect(detail.lifecycle).toHaveLength(1);
  const restores = await Promise.allSettled(
    ["restore-a", "restore-b"].map((key) =>
      repository.setLibraryArchived(actor, {
        ...request,
        revision: 1,
        archived: false,
        idempotencyKey: key,
      }),
    ),
  );
  expect(restores.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect((await repository.inspectLibrary(actor.id, { id: ref.itemId })).lifecycle).toHaveLength(2);
});
