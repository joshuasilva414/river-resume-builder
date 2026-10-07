import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { fingerprint, newId, type Principal } from "@river/domain";
import { renderingFixture, resolveDocument } from "@river/domain/workspace";
import { Effect, Layer } from "effect";
import { expect, it } from "vitest";
import { Actor, Store } from "../src/server/services";
import { archiveWorkspacePdf, readWorkspacePdf } from "../src/server/workspace-exports";

it("archives frozen bytes idempotently, isolates owners, and rejects text loss and mismatched bytes", async () => {
  const repository = createRepository(env.DB),
    ownerId = newId();
  const actor: Principal = { kind: "owner", id: ownerId, ownerId };
  await repository.db.insert(schema.user).values({
    id: ownerId,
    email: `${ownerId}@test.invalid`,
    name: "PDF fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const resumeId = newId(),
    versionId = newId(),
    snapshot = renderingFixture(1);
  await repository.saveWorkspaceRecord(actor, {
    id: resumeId,
    revision: 0,
    idempotencyKey: newId(),
    payload: { kind: "resume", data: snapshot },
  });
  await expect(
    repository.saveWorkspaceRecord(actor, {
      id: newId(),
      revision: 0,
      idempotencyKey: newId(),
      payload: {
        kind: "version",
        data: {
          version: 1,
          name: "Wrong snapshot",
          resumeId,
          draftRevision: 1,
          snapshot: { ...snapshot, name: "Changed" },
        },
      },
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await repository.saveWorkspaceRecord(actor, {
    id: versionId,
    revision: 0,
    idempotencyKey: newId(),
    payload: {
      kind: "version",
      data: { version: 1, name: "Frozen", resumeId, draftRevision: 1, snapshot },
    },
  });
  // Archival contract fixture only. Browser acceptance separately validates actual PDF rendering/text.
  const bytes = new TextEncoder().encode("%PDF-1.7\narchival-fixture\n%%EOF");
  const input = {
    id: newId(),
    versionId,
    idempotencyKey: newId(),
    pdfBase64: btoa(new TextDecoder().decode(bytes)),
    metadata: {
      renderer: "test",
      fonts: "test",
      text: resolveDocument(snapshot).expectedText.join("\n"),
      pages: 1,
      byteLength: bytes.length,
      digest: await fingerprint(bytes),
      warnings: [],
    },
  };
  const context = Layer.merge(Layer.succeed(Actor, actor), Layer.succeed(Store, repository));
  const run = <A>(program: Effect.Effect<A, unknown, Actor | Store>) =>
    Effect.runPromise(program.pipe(Effect.provide(context)));
  await expect(
    run(
      archiveWorkspacePdf(env, { ...input, metadata: { ...input.metadata, text: "lost content" } }),
    ),
  ).rejects.toThrow();
  await expect(
    run(
      archiveWorkspacePdf(env, {
        ...input,
        metadata: { ...input.metadata, digest: "0".repeat(64) },
      }),
    ),
  ).rejects.toThrow();
  expect(await repository.listWorkspaceExports(ownerId, resumeId)).toHaveLength(0);
  expect(await run(archiveWorkspacePdf(env, input))).toMatchObject({
    state: "Complete",
    id: input.id,
  });
  expect(await run(archiveWorkspacePdf(env, input))).toMatchObject({
    state: "Complete",
    id: input.id,
  });
  const object = await run(readWorkspacePdf(env, input.id));
  expect(new Uint8Array(await object.arrayBuffer())).toEqual(bytes);
  await expect(repository.getWorkspaceExport(newId(), input.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  await expect(
    repository.prepareWorkspaceExport(actor, {
      id: input.id,
      versionId,
      idempotencyKey: input.idempotencyKey,
      objectKey: "wrong",
      metadata: input.metadata,
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const preparedId = newId();
  await repository.prepareWorkspaceExport(actor, {
    id: preparedId,
    versionId,
    idempotencyKey: newId(),
    objectKey: "pending",
    metadata: input.metadata,
  });
  await expect(run(readWorkspacePdf(env, preparedId))).rejects.toThrow();
  expect(await repository.listWorkspaceExports(ownerId, resumeId)).toHaveLength(2);
});
