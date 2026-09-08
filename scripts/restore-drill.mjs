import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  assertRetainedInventory,
  downloadObject,
  privateFile,
  restoreDatabase,
  retainedObjects,
  root,
  sha256,
} from "./lib/recovery.mjs";

const [receiptPath, flag = "--staging"] = process.argv.slice(2);
const environment = flag === "--production" ? "production" : "staging";
assert.ok(
  receiptPath && process.argv.length <= 4 && ["--staging", "--production"].includes(flag),
  "Use: pnpm restore:drill /absolute/path/to/receipt.json [--production]",
);
const receipt = JSON.parse(await readFile(resolve(receiptPath), "utf8"));
assert.ok(
  receipt.key.startsWith(`backups/database/${environment}/`),
  "Select the receipt's River environment.",
);
assert.match(
  receipt.key,
  /^backups\/database\/(staging|production)\/[A-Za-z0-9:.-]+\/(snapshot\.json\.gz|manifest\.json)$/,
);
const directory = join(root, "test-results", "recovery", `drill-${randomUUID()}`);
await mkdir(directory, { recursive: true, mode: 0o700 });
const bytes = await downloadObject(receipt.key, directory, environment);
assert.equal(sha256(bytes), receipt.sha256, "Downloaded backup differs from its receipt.");
let snapshot;
if (receipt.key.endsWith("manifest.json")) {
  const manifest = JSON.parse(bytes.toString("utf8"));
  assert.equal(manifest.format, "river-d1-export-v2");
  assert.equal(manifest.data.key, receipt.key.replace(/manifest\.json$/, "data.sql"));
  const sql = await downloadObject(manifest.data.key, directory, environment);
  assert.equal(sql.byteLength, manifest.data.bytes);
  assert.ok(sql.byteLength <= 64 * 1024 * 1024);
  assert.equal(sha256(sql), manifest.data.sha256);
  snapshot = {
    ...manifest,
    format: "river-d1-snapshot-v1",
    data: sql.toString("utf8"),
    dataSha256: manifest.data.sha256,
  };
} else {
  snapshot = JSON.parse(gunzipSync(bytes, { maxOutputLength: 100 * 1024 * 1024 }).toString("utf8"));
}
const { db, counts } = await restoreDatabase(
  snapshot,
  join(directory, "restored.sqlite"),
  environment,
);
try {
  const references = retainedObjects(db);
  if (snapshot.objects) assertRetainedInventory(references, snapshot.objects);
  const objects = new Map();
  console.log(
    `Restored ${snapshot.tables.length} tables. Checking ${references.length} retained objects.`,
  );
  for (const reference of references) {
    const value = await downloadObject(reference.key, directory, environment);
    if (reference.digest) assert.equal(sha256(value), reference.digest);
    if (reference.kind === "pdf") assert.equal(value.subarray(0, 5).toString(), "%PDF-");
    objects.set(reference.key, value);
  }
  const extractions = new Map(
    db
      .prepare("SELECT id, source_id, object_key FROM source_processing_results")
      .all()
      .map((row) => [
        row.id,
        { sourceId: row.source_id, ...JSON.parse(objects.get(row.object_key).toString("utf8")) },
      ]),
  );
  let citations = 0;
  for (const row of db.prepare("SELECT material FROM evidence_revisions").all()) {
    for (const citation of JSON.parse(row.material).citations) {
      const extraction = extractions.get(citation.processingId);
      assert.ok(extraction);
      assert.equal(extraction.sourceId, citation.sourceId);
      assert.equal(extraction.text.slice(citation.start, citation.end), citation.quote);
      citations++;
    }
  }
  let exports = 0;
  for (const row of db
    .prepare(
      "SELECT operations.artifacts FROM checkpoint_exports JOIN operations ON operations.id = checkpoint_exports.operation_id",
    )
    .all()) {
    const artifacts = JSON.parse(row.artifacts);
    for (const field of ["pdf", "tex", "text", "report"]) assert.ok(objects.has(artifacts[field]));
    const report = JSON.parse(objects.get(artifacts.report).toString("utf8"));
    assert.equal(report.passed, true);
    assert.equal(objects.get(artifacts.text).toString("utf8"), report.extractedText);
    exports++;
  }
  let templateFixtures = 0;
  if (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='template_validation_fixtures'",
      )
      .get()
  ) {
    for (const row of db.prepare("SELECT result FROM template_validation_fixtures").all()) {
      const fixture = JSON.parse(row.result);
      if (!fixture.artifacts) continue;
      for (const field of ["pdf", "tex", "text", "report"])
        assert.ok(objects.has(fixture.artifacts[field]));
      const report = JSON.parse(objects.get(fixture.artifacts.report).toString("utf8"));
      assert.equal(objects.get(fixture.artifacts.text).toString("utf8"), report.extractedText);
      assert.equal(report.passed, fixture.validation.passed);
      templateFixtures++;
    }
  }
  const report = {
    status: "passed",
    completedAt: new Date().toISOString(),
    backup: receipt.key,
    database: "isolated local SQLite",
    environment,
    published: false,
    counts,
    citations,
    exportedCheckpoints: exports,
    templateFixtures,
    objectCount: references.length,
    objects: references.map(({ key }) => ({ key, sha256: sha256(objects.get(key)) })),
  };
  await privateFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        status: report.status,
        citations,
        exportedCheckpoints: exports,
        objectCount: references.length,
        report: join(directory, "report.json"),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
