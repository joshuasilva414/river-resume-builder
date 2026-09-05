import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { fingerprint, newId } from "@river/domain";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { backupResources, exportDatabase, retainBackupManifest } from "../src/server/backup-export";
import { backupSchema } from "../src/server/backup-workflow";

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
