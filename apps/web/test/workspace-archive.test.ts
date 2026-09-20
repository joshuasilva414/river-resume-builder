import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { Effect, Layer } from "effect";
import { expect, it } from "vitest";
import { Actor, Store } from "../src/server/services";
import { archivedFileStatus, readArchivedFile } from "../src/server/workspace-archive";

it("reads historical files only through owned archived manifests and leaves expired previews unavailable", async () => {
  const repository = createRepository(env.DB),
    id = newId(),
    otherId = newId();
  await repository.db.insert(schema.user).values(
    [id, otherId].map((id) => ({
      id,
      email: `${id}@test.invalid`,
      name: "Archive fixture",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
  const actor: Principal = { kind: "owner", id, ownerId: id };
  const available = newId(),
    expired = newId(),
    missing = newId();
  const key = `historical/${id}/retained.pdf`;
  await env.ARTIFACTS.put(key, "exact historical bytes");
  await repository.db.insert(schema.workspaceArchiveRecords).values([
    {
      ownerId: id,
      id: available,
      category: "artifacts",
      name: "Retained export",
      archivedAt: Date.now(),
      data: { createdAt: 1, input: {}, artifacts: { pdf: key } },
    },
    {
      ownerId: id,
      id: expired,
      category: "artifacts",
      name: "Expired preview",
      archivedAt: Date.now(),
      data: {
        createdAt: 1,
        input: { preview: { draftId: "historical", revision: 2 } },
        artifacts: { pdf: key },
      },
    },
    {
      ownerId: id,
      id: missing,
      category: "artifacts",
      name: "Missing file",
      archivedAt: Date.now(),
      data: { createdAt: 1, input: {}, artifacts: { pdf: "missing" } },
    },
  ]);
  const run = <A>(program: Effect.Effect<A, unknown, Actor | Store>, principal = actor) =>
    Effect.runPromise(
      program.pipe(
        Effect.provide(
          Layer.merge(Layer.succeed(Actor, principal), Layer.succeed(Store, repository)),
        ),
      ),
    );
  expect(await (await run(readArchivedFile(env, available, "pdf"))).object.text()).toBe(
    "exact historical bytes",
  );
  await expect(
    run(readArchivedFile(env, available, "pdf"), { kind: "owner", id: otherId, ownerId: otherId }),
  ).rejects.toThrow();
  expect(await run(archivedFileStatus(env, expired))).toMatchObject([{ status: "Expired" }]);
  await expect(run(readArchivedFile(env, expired, "pdf"))).rejects.toThrow();
  expect(await run(archivedFileStatus(env, missing))).toMatchObject([{ status: "Unavailable" }]);
  await expect(run(readArchivedFile(env, missing, "pdf"))).rejects.toThrow();
  expect(await repository.listOperations(id)).toHaveLength(0);
});
