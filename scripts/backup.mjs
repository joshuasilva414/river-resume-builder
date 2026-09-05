import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  catalogQuery,
  migrationQuery,
  privateFile,
  query,
  restoreDatabase,
  retainedObjects,
  root,
  sha256,
  staging,
  wrangler,
} from "./lib/recovery.mjs";

assert.deepEqual(
  process.argv.slice(2),
  ["--staging"],
  "Use: pnpm backup:staging. Production and other accounts are intentionally unsupported.",
);
const id = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`;
const directory = join(root, "test-results", "recovery", id);
await mkdir(directory, { recursive: true, mode: 0o700 });
const tables = (await query(catalogQuery)).map((row) => row.name);
const applied = (await query(migrationQuery)).map((row) => row.name);
const migrations = [];
for (const name of applied) {
  assert.match(name, /^\d{4}_[a-z_]+\.sql$/);
  const sql = await readFile(join(root, "packages/db/migrations", name), "utf8");
  migrations.push({ name, sql, sha256: sha256(sql) });
}
for (const name of tables) assert.match(name, /^[a-z_]+$/);
console.log(`Exporting ${tables.length} base tables from personal staging in one D1 snapshot.`);
const dataPath = join(directory, "data.sql");
await wrangler([
  "d1",
  "export",
  staging.database,
  "--remote",
  "--no-schema",
  "--output",
  dataPath,
  ...tables.flatMap((name) => ["--table", name]),
]);
await chmod(dataPath, 0o600);
assert.deepEqual(
  (await query(migrationQuery)).map((row) => row.name),
  applied,
  "Migrations changed during export; retry when deployment is idle.",
);
assert.deepEqual(
  (await query(catalogQuery)).map((row) => row.name),
  tables,
  "Tables changed during export; retry when deployment is idle.",
);
const data = await readFile(dataPath, "utf8");
const snapshot = {
  format: "river-d1-snapshot-v1",
  id,
  createdAt: new Date().toISOString(),
  resources: staging,
  tables,
  migrations,
  data,
  dataSha256: sha256(data),
};
const { db, counts } = await restoreDatabase(snapshot, join(directory, "validation.sqlite"));
snapshot.counts = counts;
snapshot.objects = retainedObjects(db);
db.close();
const bytes = gzipSync(JSON.stringify(snapshot));
const file = await privateFile(join(directory, "snapshot.json.gz"), bytes);
const key = `backups/database/staging/${id}/snapshot.json.gz`;
await wrangler([
  "r2",
  "object",
  "put",
  `${staging.bucket}/${key}`,
  "--remote",
  "--file",
  file,
  "--content-type",
  "application/gzip",
]);
await privateFile(
  join(directory, "receipt.json"),
  JSON.stringify(
    {
      id,
      key,
      sha256: sha256(bytes),
      bytes: bytes.length,
      tables: tables.length,
      counts,
      createdAt: snapshot.createdAt,
    },
    null,
    2,
  ),
);
await rm(dataPath);
await rm(join(directory, "validation.sqlite"));
console.log(
  JSON.stringify(
    {
      status: "backup-retained",
      key,
      sha256: sha256(bytes),
      receipt: join(directory, "receipt.json"),
    },
    null,
    2,
  ),
);
