import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { catalogQuery, resourcesFor, restoreDatabase, root, sha256 } from "./recovery.mjs";

test("restores accepted task history at capacity, then enforces admission on new tasks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "river-recovery-test-"));
  try {
    const names = (await readdir(join(root, "packages/db/migrations")))
      .filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name))
      .sort();
    const migrations = await Promise.all(
      names.map(async (name) => {
        const sql = await readFile(join(root, "packages/db/migrations", name), "utf8");
        return { name, sql, sha256: sha256(sql) };
      }),
    );
    const empty = new DatabaseSync(":memory:");
    for (const migration of migrations) empty.exec(migration.sql);
    const tables = empty
      .prepare(catalogQuery)
      .all()
      .map((row) => row.name);
    empty.close();
    const timestamp = Date.now() - 86_400_000;
    const task = (id, state) =>
      `INSERT INTO operations (id,owner_id,input,state,stage,created_at,updated_at)
       VALUES ('${id}','fixture-owner','{"type":"extract-source"}','${state}','Fixture',${timestamp},${timestamp});`;
    const data = `INSERT INTO user (id,name,email,email_verified,created_at,updated_at)
      VALUES ('fixture-owner','Fixture','fixture@example.test',1,${timestamp},${timestamp});
      ${Array.from({ length: 4 }, (_, index) => task(`active-${index}`, "Pending")).join("\n")}
      ${task("completed-history", "Succeeded")}`;
    const snapshot = {
      format: "river-d1-snapshot-v1",
      resources: resourcesFor("staging"),
      migrations,
      tables,
      data,
      dataSha256: sha256(data),
    };
    const { db } = await restoreDatabase(snapshot, join(directory, "restored.sqlite"), "staging");
    try {
      assert.equal(db.prepare("SELECT count(*) AS total FROM operations").get().total, 5);
      assert.equal(
        db.prepare("SELECT state FROM operations WHERE id='completed-history'").get().state,
        "Succeeded",
      );
      assert.throws(() => db.exec(task("new-work", "Pending")), /river_usage_owner_active/);
    } finally {
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
