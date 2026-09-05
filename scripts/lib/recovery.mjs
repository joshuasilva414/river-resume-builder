import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
const targets = JSON.parse(await readFile(resolve(root, "config/backup-resources.json"), "utf8"));
export function resourcesFor(environment) {
  assert.ok(
    environment === "staging" || environment === "production",
    "Select a River environment.",
  );
  return targets[environment];
}
export const catalogQuery =
  "SELECT name FROM pragma_table_list WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name";
export const migrationQuery = "SELECT name FROM d1_migrations ORDER BY id";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Do not echo Wrangler output: D1 exports print a signed URL granting temporary backup access. */
export async function wrangler(args, environment) {
  const resources = resourcesFor(environment);
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@river/web", "exec", "wrangler", ...args, "--env", environment],
      {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: resources.accountId },
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.resume();
    child.once("error", () =>
      reject(Error("Wrangler could not start. Check the installed pnpm and credentials.")),
    );
    child.once("close", (code) =>
      code === 0
        ? resolveResult(output)
        : reject(
            Error(
              `Wrangler ${args.slice(0, 2).join(" ")} failed (${code}). Its output was withheld because it can contain credentials or database values.`,
            ),
          ),
    );
  });
}

export async function query(sql, environment) {
  const resources = resourcesFor(environment);
  const results = JSON.parse(
    await wrangler(
      ["d1", "execute", resources.database, "--remote", "--json", "--command", sql],
      environment,
    ),
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].success, true);
  return results[0].results;
}

export async function privateFile(path, bytes) {
  await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
  return path;
}

/** Restore into an unpublished SQLite file. Foreign keys and FTS triggers are active during import. */
export async function restoreDatabase(snapshot, destination, environment) {
  assert.equal(snapshot.format, "river-d1-snapshot-v1");
  assert.deepEqual(
    snapshot.resources,
    resourcesFor(environment),
    "The snapshot must match the selected personal River environment.",
  );
  assert.equal(sha256(snapshot.data), snapshot.dataSha256);
  // Exclusive creation prevents accidental overwrite of a previous drill or application database.
  await privateFile(destination, "");
  const db = new DatabaseSync(destination);
  try {
    db.exec("PRAGMA foreign_keys=ON;BEGIN;PRAGMA defer_foreign_keys=ON;");
    for (const migration of snapshot.migrations) {
      assert.equal(sha256(migration.sql), migration.sha256);
      db.exec(migration.sql);
    }
    db.exec(snapshot.data);
    db.exec("COMMIT;");
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const tables = db
      .prepare(catalogQuery)
      .all()
      .map((row) => row.name);
    assert.deepEqual(
      tables,
      snapshot.tables,
      "The migration bundle must recreate every exported base table.",
    );
    const counts = Object.fromEntries(
      tables.map((table) => {
        assert.match(table, /^[a-z_]+$/);
        return [table, db.prepare(`SELECT count(*) AS total FROM "${table}"`).get().total];
      }),
    );
    const claims = db.prepare("SELECT id, search_text FROM evidence_claims ORDER BY id").all();
    const search = db
      .prepare("SELECT claim_id AS id, search_text FROM evidence_search ORDER BY claim_id")
      .all();
    assert.deepEqual(search, claims, "Restored FTS index must exactly match current evidence.");
    if (snapshot.counts) assert.deepEqual(counts, snapshot.counts);
    return { db, counts };
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Locate retained object references from the restored snapshot, without printing private content. */
export function retainedObjects(db) {
  const references = new Map();
  const add = (key, digest, kind) => {
    assert.equal(typeof key, "string");
    assert.ok(
      key.startsWith("retained/"),
      "A retained reference must not point into transient storage.",
    );
    const previous = references.get(key);
    if (previous?.digest && digest) assert.equal(previous.digest, digest);
    references.set(key, { key, digest: digest ?? previous?.digest ?? null, kind });
  };
  // Uploading records can legitimately precede their original object. They remain recoverable after restore.
  for (const row of db
    .prepare("SELECT object_key, digest FROM sources WHERE state != 'Uploading'")
    .all())
    add(row.object_key, row.digest, "original");
  for (const row of db.prepare("SELECT object_key, digest FROM source_processing_results").all())
    add(row.object_key, row.digest, "extraction");
  for (const row of db
    .prepare("SELECT artifacts FROM operations WHERE artifacts IS NOT NULL")
    .all()) {
    const artifacts = JSON.parse(row.artifacts);
    if (artifacts.pdf.startsWith("transient/")) continue;
    for (const field of ["pdf", "tex", "text", "report"]) add(artifacts[field], null, field);
  }
  // Older snapshots predate the template registry. New snapshots retain every published fixture.
  if (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='template_validation_fixtures'",
      )
      .get()
  ) {
    for (const row of db.prepare("SELECT result FROM template_validation_fixtures").all()) {
      const artifacts = JSON.parse(row.result).artifacts;
      if (artifacts)
        for (const field of ["pdf", "tex", "text", "report"]) add(artifacts[field], null, field);
    }
  }
  if (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='template_scoring_fixtures'",
      )
      .get()
  ) {
    for (const row of db
      .prepare("SELECT document FROM template_scoring_fixtures WHERE document IS NOT NULL")
      .all()) {
      const artifacts = JSON.parse(row.document).artifacts;
      for (const field of ["pdf", "tex", "text", "report"])
        add(artifacts[field], artifacts.objectDigests?.[field], field);
    }
  }
  return [...references.values()].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
  );
}

export async function downloadObject(key, directory, environment) {
  const resources = resourcesFor(environment);
  const path = resolve(directory, `${sha256(key)}.object`);
  await wrangler(
    ["r2", "object", "get", `${resources.bucket}/${key}`, "--remote", "--file", path],
    environment,
  );
  await chmod(path, 0o600);
  return readFile(path);
}
