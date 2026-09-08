import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { SetTrashRequest, type TrashKind } from "@river/contracts";
import { type createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { fixedPack } from "@river/templates";
import { eq } from "drizzle-orm";
import { Schema } from "effect";
import { beforeAll, expect, it } from "vitest";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
async function template(repository: ReturnType<typeof createRepository>, actor: Principal) {
  const saved = await repository.saveTemplate(actor, {
    id: null,
    revision: null,
    name: "Retained template",
    scope: { level: "document", type: null },
    base: { kind: "fixed", theme: "classic" },
    source: fixedPack("classic").document.source,
    overrides: {},
    idempotencyKey: "template",
  });
  if (!saved.revisionId) throw Error("Missing template revision");
  // Approval is fixture setup; these tests exercise deletion, not the compiler's approval path.
  await repository.db
    .update(schema.templateRevisions)
    .set({ state: "Approved" })
    .where(eq(schema.templateRevisions.id, saved.revisionId));
  return { ...saved, revisionId: saved.revisionId };
}

it("restores every retained kind without changing saved content, files, or template approval", async () => {
  const { repository, actor, draft, data, jobDetail } = await compositionFixture();
  const savedTemplate = await template(repository, actor);
  const sourceId = await repository.beginSource(actor, {
    idempotencyKey: "source",
    title: "Retained source",
    filename: "notes.txt",
    mime: "text/plain",
    kind: "pasted",
    provenanceUrl: null,
    note: "",
    digest: "a".repeat(64),
    byteLength: 5,
  });
  const source = await repository.getSource(actor.ownerId, sourceId);
  if (!source) throw Error("Missing source");
  await env.ARTIFACTS.put(source.objectKey, "notes");
  const material = { assertion: "Retained achievement", citations: [], contexts: [] };
  const claim = await repository.createEvidence(
    actor,
    {
      idempotencyKey: "evidence",
      material,
      metadata: { type: "Achievement", label: "", tags: [], notes: "" },
    },
    material,
  );
  const graph = await repository.libraryGraph(
    actor.ownerId,
    data.sections.map((section) => section.reference),
  );
  const checkpoint = await repository.captureCheckpoint(actor, {
    id: draft.id,
    revision: 0,
    idempotencyKey: "checkpoint",
  });
  const before = await repository.inspectCheckpoint(actor.ownerId, checkpoint.id);
  const records: { id: string; kind: TrashKind; revision: number }[] = [
    ...graph.map(({ item }) => ({ id: item.id, kind: item.kind, revision: item.revision })),
    { id: jobDetail.job.id, kind: "job", revision: jobDetail.job.revision },
    { id: sourceId, kind: "source", revision: source.revision },
    { id: claim.id, kind: "evidence", revision: claim.revision },
    { id: savedTemplate.id, kind: "template", revision: savedTemplate.revision },
  ];
  for (const record of records) {
    await repository.setTrash(
      actor,
      Schema.decodeUnknownSync(SetTrashRequest)({
        ...record,
        archived: true,
        idempotencyKey: `delete-${record.id}`,
      }),
    );
  }
  const trash = await repository.listTrash(actor.ownerId, { kind: null, query: "", offset: 0 });
  expect(trash.total).toBe(records.length);
  expect(new Set(trash.items.map((item) => item.kind))).toEqual(
    new Set(["source", "evidence", "job", "content", "block", "section", "template"]),
  );
  expect(
    (await repository.listTemplates(actor.ownerId, { state: "Approved", offset: 0 })).items,
  ).toEqual([]);
  const retained = await repository.getTemplateRevision(actor.ownerId, savedTemplate.revisionId);
  expect(retained.revision.state).toBe("Approved");
  expect(
    await repository.compositionTemplate(actor.ownerId, {
      ...data,
      template: { designId: savedTemplate.id, revisionId: savedTemplate.revisionId },
    }),
  ).toMatchObject({ graph: retained.revision.graph });
  expect((await repository.inspectCheckpoint(actor.ownerId, checkpoint.id)).checkpoint).toEqual(
    before.checkpoint,
  );
  expect(
    (
      await repository.libraryGraph(
        actor.ownerId,
        data.sections.map((section) => section.reference),
      )
    ).map((entry) => entry.revision),
  ).toEqual(graph.map((entry) => entry.revision));
  expect(await (await env.ARTIFACTS.get(source.objectKey))?.text()).toBe("notes");
  for (const item of trash.items)
    await repository.setTrash(actor, {
      id: item.id,
      kind: item.kind,
      revision: item.revision,
      archived: false,
      idempotencyKey: `restore-${item.id}`,
    });
  expect(
    (await repository.listTrash(actor.ownerId, { kind: null, query: "", offset: 0 })).total,
  ).toBe(0);
  expect(
    (await repository.getTemplateRevision(actor.ownerId, savedTemplate.revisionId)).revision,
  ).toEqual(retained.revision);
  expect((await repository.inspectCheckpoint(actor.ownerId, checkpoint.id)).checkpoint).toEqual(
    before.checkpoint,
  );
});

it("isolates Trash by owner and guards concurrent and retried template lifecycle changes", async () => {
  const { repository, actor } = await compositionFixture();
  const saved = await template(repository, actor);
  const input = {
    id: saved.id,
    kind: "template",
    revision: 0,
    archived: true,
    idempotencyKey: "delete",
  } satisfies SetTrashRequest;
  const stranger = { kind: "owner", id: newId(), ownerId: newId() } satisfies Principal;
  await expect(repository.setTrash(stranger, input)).rejects.toMatchObject({ code: "NotFound" });
  await expect(
    repository.setTrash({ kind: "agent", id: newId(), ownerId: actor.ownerId, scopes: [] }, input),
  ).rejects.toMatchObject({ code: "Forbidden" });
  const deleted = await Promise.all([
    repository.setTrash(actor, input),
    repository.setTrash(actor, input),
  ]);
  expect(deleted[0]).toEqual(deleted[1]);
  expect(
    (await repository.listTrash(stranger.ownerId, { kind: null, query: "", offset: 0 })).total,
  ).toBe(0);
  await expect(
    repository.resolveTemplateBase(actor.ownerId, { kind: "saved", revisionId: saved.revisionId }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    repository.setTrash(actor, { ...input, archived: false, idempotencyKey: "stale" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const restored = await Promise.allSettled(
    ["restore-a", "restore-b"].map((idempotencyKey) =>
      repository.setTrash(actor, { ...input, archived: false, revision: 1, idempotencyKey }),
    ),
  );
  expect(restored.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  expect(await repository.setTrash(actor, input)).toEqual(deleted[0]);
  expect(
    (await repository.getTemplateRevision(actor.ownerId, saved.revisionId)).design,
  ).toMatchObject({ archivedAt: null, revision: 2 });
  await expect(
    repository.setTrash(actor, { ...input, kind: "section", idempotencyKey: "wrong-kind" }),
  ).rejects.toMatchObject({ code: "NotFound" });
});

it("counts and paginates the complete matching Trash set with literal text search", async () => {
  const { repository, actor } = await compositionFixture();
  const now = Date.now();
  const rows = Array.from({ length: 53 }, (_, index) => ({
    id: newId(),
    ownerId: actor.ownerId,
    kind: "content" as const,
    type: "summary" as const,
    label: index === 52 ? "Literal %_ search" : `Deleted item ${index}`,
    revision: 1,
    currentRevisionId: newId(),
    archivedAt: now,
    createdAt: now,
    updatedAt: now,
  }));
  for (let offset = 0; offset < rows.length; offset += 8)
    await repository.db.insert(schema.libraryItems).values(rows.slice(offset, offset + 8));
  const first = await repository.listTrash(actor.ownerId, {
    kind: "content",
    query: "",
    offset: 0,
  });
  const second = await repository.listTrash(actor.ownerId, {
    kind: "content",
    query: "",
    offset: 50,
  });
  expect(first).toMatchObject({ total: 53, hasMore: true });
  expect(first.items).toHaveLength(50);
  expect(second.items).toHaveLength(3);
  expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(53);
  expect(
    (await repository.listTrash(actor.ownerId, { kind: null, query: "%_", offset: 0 })).items,
  ).toHaveLength(1);
});
