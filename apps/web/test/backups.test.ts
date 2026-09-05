import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { fingerprint, newId, type Principal } from "@river/domain";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import {
  backupResources,
  exportDatabase,
  retainBackupManifest,
  safeBackupFailure,
} from "../src/server/backup-export";
import { backupSchema } from "../src/server/backup-workflow";
import { retainedBackupStatus } from "../src/server/backups";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
it("deduplicates daily dispatch atomically and records completion only after retained manifest publication", async () => {
  const store = createRepository(env.DB),
    id = newId(),
    email = `${id}@example.test`;
  await store.db.insert(schema.user).values({
    id,
    name: "Synthetic backup Owner",
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  expect(await store.scheduleBackup("missing@example.test", "2026-01-01")).toBeNull();
  const [first, duplicate] = await Promise.all([
    store.scheduleBackup(email, "2026-01-01"),
    store.scheduleBackup(email, "2026-01-01"),
  ]);
  expect(first).toEqual(duplicate);
  if (!first) throw Error("Missing scheduled backup");
  const operations = await store.db
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.ownerId, id));
  expect(operations).toHaveLength(1);
  expect(
    (await store.pendingDispatches()).filter((item) => item.operationId === first.operationId),
  ).toHaveLength(1);
  const manifest = {
    key: `backups/database/staging/fixture-${first.operationId}/manifest.json`,
    sha256: "a".repeat(64),
    bytes: 100,
  };
  expect(await store.completeBackup(first.date, first.operationId, manifest)).toBe(true);
  expect(await store.completeBackup(first.date, first.operationId, manifest)).toBe(true);
  expect((await store.getOperation(first.operationId))?.state).toBe("Succeeded");
  expect(await store.scheduleBackup(email, "2026-01-01")).toMatchObject({ manifest });
  const second = await store.scheduleBackup(email, "2026-01-02");
  if (!second) throw Error("Missing second backup");
  await store.cancelOperation(id, second.operationId, "cancel-backup");
  expect(await store.completeBackup(second.date, second.operationId, manifest)).toBe(false);
  expect((await store.getBackup(second.date))?.manifest).toBeNull();
});

it("captures exact migration resources and excludes derived FTS tables from the export catalog", async () => {
  const captured = await backupSchema(env.DB);
  expect(captured.tables).toContain("database_backups");
  expect(captured.tables).toContain("evidence_claims");
  expect(captured.tables).not.toContain("evidence_search");
  expect(captured.tables).not.toContain("evidence_search_data");
  expect(captured.tables).not.toContain("d1_migrations");
  expect(captured.migrations.map((item) => item.name)).toEqual(
    env.TEST_MIGRATIONS.map((item) => item.name),
  );
  for (const migration of captured.migrations)
    expect(await fingerprint(migration.sql)).toBe(migration.sha256);
});

it("polls one export, streams SQL into private R2, and recovers immutable upload without another export", async () => {
  const key = `backups/database/staging/fixture-${newId()}/data.sql`,
    sql = "INSERT INTO fixture VALUES ('Synthetic backup data');";
  let calls = 0;
  const transport: typeof fetch = async (input, init) => {
    calls++;
    if (String(input).startsWith("https://api.cloudflare.com/")) {
      expect(String(input)).toContain(
        `/accounts/${backupResources.accountId}/d1/database/${backupResources.databaseId}/export`,
      );
      const body = JSON.parse(String(init?.body));
      expect(body.dump_options).toEqual({ no_schema: true, no_data: false, tables: ["fixture"] });
      if (calls === 1)
        return Response.json({
          success: true,
          result: { success: true, status: "active", at_bookmark: "fixture-bookmark" },
        });
      expect(body.current_bookmark).toBe("fixture-bookmark");
      return Response.json({
        success: true,
        result: {
          success: true,
          status: "complete",
          result: {
            signed_url: "https://fixture.example.test/private?signature=not-a-real-secret",
          },
        },
      });
    }
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(new Headers(init?.headers).get("Accept-Encoding")).toBe("identity");
    return new Response(sql, {
      headers: { "Content-Length": String(new TextEncoder().encode(sql).byteLength) },
    });
  };
  const settings = {
    token: "synthetic-token",
    tables: ["fixture"],
    key,
    bucket: env.ARTIFACTS,
    transport,
    pause: async () => {},
  };
  const first = await exportDatabase(settings);
  expect(first).toEqual({
    key,
    bytes: new TextEncoder().encode(sql).byteLength,
    sha256: await fingerprint(sql),
  });
  expect(calls).toBe(3);
  expect(await exportDatabase(settings)).toEqual(first);
  expect(calls).toBe(3);
  expect(await (await env.ARTIFACTS.get(key))?.text()).toBe(sql);
  const manifestKey = key.replace("data.sql", "manifest.json"),
    content = JSON.stringify({ data: first });
  const manifest = await retainBackupManifest(env.ARTIFACTS, manifestKey, content);
  expect(await retainBackupManifest(env.ARTIFACTS, manifestKey, content)).toEqual(manifest);
  await expect(
    retainBackupManifest(env.ARTIFACTS, manifestKey, "different immutable manifest"),
  ).rejects.toThrow("differs");
  expect(await (await env.ARTIFACTS.get(manifestKey))?.text()).toBe(content);
});

it("bounds export polling and strips private API error details", async () => {
  const base = {
    token: "synthetic-token",
    tables: ["fixture"],
    key: `backups/database/staging/fixture-${newId()}/data.sql`,
    bucket: env.ARTIFACTS,
    pause: async () => {},
  };
  let calls = 0;
  await expect(
    exportDatabase({
      ...base,
      transport: async () => {
        calls++;
        return Response.json({
          success: true,
          result: { success: true, status: "active", at_bookmark: "waiting" },
        });
      },
    }),
  ).rejects.toThrow("60-poll");
  expect(calls).toBe(60);
  await expect(
    exportDatabase({
      ...base,
      transport: async () => Response.json({ error: "PRIVATE_SQL_MARKER" }, { status: 403 }),
    }),
  ).rejects.toThrow("dedicated token");
  expect(await env.ARTIFACTS.get(base.key)).toBeNull();
});

it("serializes explicit daily retries, preserves old operations, and enforces the permanent three-attempt limit", async () => {
  const store = createRepository(env.DB),
    id = newId(),
    email = `${id}@example.test`;
  const actor: Principal = { kind: "owner", id, ownerId: id };
  const agent: Principal = { kind: "agent", id: newId(), ownerId: id, scopes: [] };
  await store.db.insert(schema.user).values({
    id,
    name: "Retry fixture",
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const first = await store.scheduleBackup(email, "2026-02-01");
  if (!first) throw Error("Backup missing");
  const input = { date: first.date, attempt: 1, idempotencyKey: "backup-retry" };
  await expect(store.readBackupStatus(agent)).rejects.toMatchObject({ code: "Forbidden" });
  await expect(store.retryBackup(agent, input, true)).rejects.toMatchObject({ code: "Forbidden" });
  await expect(store.retryBackup(actor, input, true)).rejects.toMatchObject({ code: "Conflict" });
  await store.updateOperation(first.operationId, { state: "Failed", stage: "Synthetic failure" });
  await expect(store.retryBackup(actor, input, false)).rejects.toMatchObject({
    code: "Unavailable",
  });
  const raced = await Promise.allSettled([
    store.retryBackup(actor, input, true),
    store.retryBackup(actor, { ...input, idempotencyKey: "competing-retry" }, true),
  ]);
  expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(raced.filter((result) => result.status === "rejected")).toHaveLength(1);
  const winnerIndex = raced.findIndex((result) => result.status === "fulfilled");
  const winningInput = winnerIndex === 0 ? input : { ...input, idempotencyKey: "competing-retry" };
  const second = await store.getBackup(first.date);
  if (!second) throw Error("Retry missing");
  expect(second.attempts).toBe(2);
  expect(second.operationId).not.toBe(first.operationId);
  expect(await store.retryBackup(actor, winningInput, false)).toMatchObject({
    id: second.operationId,
    revision: 2,
  });
  expect((await store.readBackupStatus(actor)).attempts).toHaveLength(2);
  expect((await store.getOperation(first.operationId))?.state).toBe("Failed");
  expect(
    await store.completeBackup(first.date, first.operationId, {
      key: "old/manifest.json",
      sha256: "a".repeat(64),
      bytes: 20,
    }),
  ).toBe(false);
  await store.cancelOperation(id, second.operationId, "cancel-second-backup");
  const third = await store.retryBackup(
    actor,
    { ...input, attempt: 2, idempotencyKey: "third-backup" },
    true,
  );
  await store.updateOperation(third.id, { state: "Failed", stage: "Third failure" });
  await expect(
    store.retryBackup(actor, { ...input, attempt: 3, idempotencyKey: "fourth-backup" }, true),
  ).rejects.toMatchObject({ code: "Conflict" });
  const status = await store.readBackupStatus(actor);
  expect(status.latest).toMatchObject({ operationId: third.id, attempt: 3, state: "Failed" });
  expect(status.attempts.map((item) => item.state)).toEqual(["Failed", "Cancelled", "Failed"]);
  expect(
    (await store.pendingDispatches()).filter((item) =>
      status.attempts.some((attempt) => attempt.id === item.operationId),
    ),
  ).toHaveLength(3);
  expect((await store.scheduleBackup(email, first.date))?.operationId).toBe(third.id);
  const other: Principal = { kind: "owner", id: newId(), ownerId: newId() };
  expect((await store.readBackupStatus(other)).latest).toBeNull();
  await expect(store.retryBackup(other, input, true)).rejects.toMatchObject({ code: "NotFound" });
});

it("pages UTC dates without replacing the latest attempt or another Owner's history", async () => {
  const store = createRepository(env.DB),
    id = newId(),
    email = `${id}@example.test`;
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await store.db.insert(schema.user).values({
    id,
    name: "History fixture",
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  for (let day = 1; day <= 11; day++)
    await store.scheduleBackup(email, `2026-03-${String(day).padStart(2, "0")}`);
  const first = await store.readBackupStatus(actor);
  expect(first.dates).toHaveLength(10);
  expect(first.latest?.date).toBe("2026-03-11");
  const second = await store.readBackupStatus(actor, {
    before: first.nextBefore,
    date: "2026-03-01",
  });
  expect(second.dates.map((item) => item.date)).toEqual(["2026-03-01"]);
  expect(second.latest?.date).toBe("2026-03-11");
  expect(second.selectedDate).toBe("2026-03-01");
  expect(second.attempts).toHaveLength(1);
  expect(second.nextBefore).toBeNull();
});

it("requires both immutable artifacts before reporting a retained daily success", async () => {
  const key = `backups/database/staging/${newId()}/data.sql`,
    content = "Synthetic SQL fixture",
    bytes = new TextEncoder().encode(content).byteLength;
  await env.ARTIFACTS.put(key, content);
  const manifest = await retainBackupManifest(
    env.ARTIFACTS,
    key.replace("data.sql", "manifest.json"),
    JSON.stringify({
      format: "river-d1-export-v2",
      id: newId(),
      createdAt: new Date().toISOString(),
      resources: backupResources,
      tables: ["fixture"],
      migrations: [],
      data: { key, bytes, sha256: await fingerprint(content) },
    }),
  );
  const candidate = { date: "2026-09-05", completedAt: Date.now(), manifest };
  const candidates = [candidate];
  expect(await retainedBackupStatus(env.ARTIFACTS, candidates)).toMatchObject({
    date: candidates[0]?.date,
    format: "river-d1-export-v2",
    bytes,
  });
  expect(
    await retainedBackupStatus(env.ARTIFACTS, [
      { ...candidate, manifest: { ...manifest, sha256: "a".repeat(64) } },
    ]),
  ).toBeNull();
  await env.ARTIFACTS.delete(key);
  expect(await retainedBackupStatus(env.ARTIFACTS, candidates)).toBeNull();
});

it("exposes only allowlisted transfer diagnostics and retains nothing when the download length is missing", async () => {
  const key = `backups/database/staging/${newId()}/data.sql`;
  const transport: typeof fetch = async (input) =>
    String(input).startsWith("https://api.cloudflare.com/")
      ? Response.json({
          success: true,
          result: {
            success: true,
            status: "complete",
            result: { signed_url: "https://fixture.example.test/private?signature=PRIVATE_MARKER" },
          },
        })
      : new Response("PRIVATE_SQL_MARKER");
  let failure: unknown;
  try {
    await exportDatabase({
      token: "synthetic-token",
      tables: ["fixture"],
      key,
      bucket: env.ARTIFACTS,
      transport,
    });
  } catch (error) {
    failure = error;
  }
  expect(safeBackupFailure(failure)).toContain("bounded-content-length");
  expect(safeBackupFailure(failure)).not.toContain("PRIVATE");
  expect(safeBackupFailure(new Error("PRIVATE_SQL_MARKER"))).not.toContain("PRIVATE");
  expect(
    safeBackupFailure(
      new Error(
        "The database backup download or immutable upload failed at PRIVATE_MARKER. No backup completion was recorded.",
      ),
    ),
  ).not.toContain("PRIVATE");
  expect(await env.ARTIFACTS.get(key)).toBeNull();
});
