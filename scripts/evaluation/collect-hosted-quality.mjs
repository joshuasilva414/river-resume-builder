import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { downloadObject, query, sha256 } from "../lib/recovery.mjs";

// Collect immutable files only after the normal UI has recorded each export.
const root = resolve(process.argv[2] ?? "test-results/v1.2.1-comparison");
const cases = JSON.parse(await readFile(process.argv[3], "utf8"));
const output = resolve(root, "hosted");
const objects = resolve(output, "objects");
await mkdir(objects, { recursive: true, mode: 0o700 });
const results = [];
for (const item of cases) {
  assert.match(item.checkpointId, /^[a-f0-9-]{36}$/);
  assert(["classic", "minimal", "technical"].includes(item.theme));
  assert(["classic", "compact"].includes(item.layout));
  assert(
    ["fictional-one-page", "fictional-two-page", "personal-comparison"].includes(item.dataset),
  );
  const [row] = await query(
    `SELECT c.data, e.operation_id, o.artifacts FROM checkpoint_exports e JOIN resume_checkpoints c ON c.id=e.checkpoint_id JOIN operations o ON o.id=e.operation_id WHERE e.checkpoint_id='${item.checkpointId}'`,
    "staging",
  );
  assert(row, "The normal workflow must have completed this export.");
  const data = JSON.parse(row.data);
  const artifacts = JSON.parse(row.artifacts);
  assert.equal(data.theme, item.theme);
  assert.equal(artifacts.validationPassed, true);
  const entryLayouts = (bundle, record) => {
    const schema = bundle.schemas.find(
      (schema) => schema.id === record.schema.id && schema.revision === record.schema.revision,
    );
    assert(schema);
    if (schema.level === "entry") assert.equal(record.layout.id, `${schema.id}-${item.layout}`);
    for (const field of schema.fields) {
      if (field.kind === "records")
        for (const child of record.values[field.id] ?? []) entryLayouts(bundle, child);
    }
  };
  for (const section of data.sections) entryLayouts(section.structured, section.structured.record);
  const dataset =
    item.dataset === "personal-comparison" ? "private/personal-comparison" : item.dataset;
  const folder = resolve(output, dataset);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  for (const file of ["reference.pdf", "frozen-content.json"])
    await copyFile(resolve(root, dataset, file), resolve(folder, file));
  const prefix = resolve(folder, `${item.theme}-${item.layout}`);
  for (const [kind, extension] of [
    ["pdf", ".pdf"],
    ["report", "-validation.json"],
  ]) {
    const existing = await readFile(`${prefix}${extension}`).catch(() => null);
    const bytes =
      existing && sha256(existing) === artifacts.objectDigests[kind]
        ? existing
        : await downloadObject(artifacts[kind], objects, "staging");
    assert.equal(sha256(bytes), artifacts.objectDigests[kind]);
    await writeFile(`${prefix}${extension}`, bytes, { mode: 0o600 });
  }
  const report = JSON.parse(await readFile(`${prefix}-validation.json`, "utf8"));
  assert.equal(report.passed, true);
  assert.equal(
    report.expectedText,
    await readFile(resolve(root, dataset, `${item.theme}-${item.layout}-expected.txt`), "utf8"),
    "The exported wording and order must match the frozen comparison.",
  );
  assert.equal(report.pageCount, item.dataset === "fictional-two-page" ? 2 : 1);
  results.push({
    ...item,
    operationId: row.operation_id,
    pages: report.pageCount,
    renderer: artifacts.rendererVersion,
    pdfSha256: artifacts.objectDigests.pdf,
    status: "passed",
  });
  console.log(`${item.dataset}/${item.theme}/${item.layout}: retained export verified`);
}
await writeFile(resolve(output, "exports.json"), `${JSON.stringify(results, null, 2)}\n`);
