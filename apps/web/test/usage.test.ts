import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema, usageFailure } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { syntheticResume } from "@river/templates";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const input = { document: syntheticResume, theme: "classic" as const };

async function account() {
  const store = createRepository(env.DB),
    id = newId();
  await store.db.insert(schema.user).values({
    id,
    name: "Usage fixture",
    email: `${id}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const actor: Principal = { kind: "owner", id, ownerId: id };
  return { store, id, actor };
}

it("atomically caps competing operations, preserves retries and leaves other accounts capacity", async () => {
  const { store, id } = await account();
  const other = await account();
  const attempts = await Promise.allSettled(
    Array.from({ length: 8 }, (_, index) => store.startCompile(id, `competing-${index}`, input)),
  );
  expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(4);
  for (const result of attempts)
    if (result.status === "rejected")
      expect(usageFailure(result.reason)).toMatchObject({
        code: "RateLimited",
        message: expect.stringContaining("Four tasks"),
      });
  expect(await store.readUsage(id)).toMatchObject({ active: 4, today: 4 });
  const acceptedIndex = attempts.findIndex((result) => result.status === "fulfilled");
  await store.startCompile(id, `competing-${acceptedIndex}`, input);
  expect(await store.readUsage(id)).toMatchObject({ active: 4, today: 4 });
  const otherId = await store.startCompile(other.id, "other-account", input);
  expect((await store.getOperation(otherId))?.ownerId).toBe(other.id);
  const own = (await store.listOperations(id))[0];
  if (!own) throw Error("Expected an accepted operation");
  await store.cancelOperation(id, own.id, "release-capacity");
  await store.startCompile(id, "after-cancel", input);
  expect(await store.readUsage(id)).toMatchObject({ active: 4, today: 5 });
  // A rejected operation must not leave a dispatch, audit event or receipt behind.
  expect(
    await store.db.select().from(schema.receipts).where(eq(schema.receipts.actorId, id)),
  ).toHaveLength(6);
});

it("limits shared capacity across accounts while keeping system backups available", async () => {
  const accounts = await Promise.all(Array.from({ length: 5 }, account));
  for (const entry of accounts.slice(0, 4))
    for (let index = 0; index < 4; index++)
      await entry.store.startCompile(entry.id, `shared-${index}`, input);
  const next = accounts[4];
  if (!next) throw Error("Expected account");
  const failure = await next.store.startCompile(next.id, "global-full", input).catch(usageFailure);
  expect(failure).toMatchObject({
    code: "RateLimited",
    message: expect.stringContaining("current task limit"),
  });
  expect(await next.store.scheduleBackup(`${next.id}@example.test`, "2026-09-06")).not.toBeNull();
  expect(await next.store.readUsage(next.id)).toMatchObject({ active: 0, today: 0 });
});

it("counts completed, failed and cancelled attempts against the UTC daily budget and rolls back dependent uploads", async () => {
  const { store, id, actor } = await account();
  await env.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100)
    INSERT INTO operations (id,owner_id,state,stage,input,created_at,updated_at)
    SELECT 'daily-' || ? || '-' || x, ?, CASE x%3 WHEN 0 THEN 'Failed' WHEN 1 THEN 'Cancelled' ELSE 'Succeeded' END,
      'Fixture', '{}', unixepoch('now')*1000, unixepoch('now')*1000 FROM n`)
    .bind(id, id)
    .run();
  expect(await store.readUsage(id)).toMatchObject({ today: 100, active: 0 });
  const rejected = await store
    .beginSource(actor, {
      idempotencyKey: "over-budget-upload",
      title: "Private",
      filename: "private.txt",
      mime: "text/plain",
      kind: "pasted",
      provenanceUrl: null,
      note: "",
      digest: "ab".repeat(32),
      byteLength: 1,
    })
    .catch(usageFailure);
  expect(rejected).toMatchObject({
    code: "RateLimited",
    message: expect.stringContaining("100 tasks"),
  });
  expect(await store.listSources(id)).toHaveLength(0);
  expect(await store.activity(id)).toHaveLength(0);
  await env.DB.prepare(
    "UPDATE operations SET created_at = unixepoch('now', 'start of day')*1000-1 WHERE owner_id=?",
  )
    .bind(id)
    .run();
  await store.startCompile(id, "new-day", input);
  expect(await store.readUsage(id)).toMatchObject({ today: 1, active: 1 });
});

it("enforces the service daily ceiling without spending ordinary users' remaining budget", async () => {
  const accounts = await Promise.all(Array.from({ length: 10 }, account));
  for (const { id } of accounts) {
    await env.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100)
      INSERT INTO operations (id,owner_id,state,stage,input,created_at,updated_at)
      SELECT 'global-' || ? || '-' || x, ?, 'Succeeded', 'Fixture', '{}', unixepoch('now')*1000, unixepoch('now')*1000 FROM n`)
      .bind(id, id)
      .run();
  }
  const fresh = await account();
  const failure = await fresh.store
    .startCompile(fresh.id, "global-daily", input)
    .catch(usageFailure);
  expect(failure).toMatchObject({
    code: "RateLimited",
    message: expect.stringContaining("daily processing limit"),
  });
  expect(await fresh.store.readUsage(fresh.id)).toMatchObject({ active: 0, today: 0 });
});
