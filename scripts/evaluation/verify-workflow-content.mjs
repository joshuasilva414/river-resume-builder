import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Compare hosted, schema-visible values with the frozen compiler/reference inputs.
// The input is a read-only snapshot of drafts assembled through the application.
const root = resolve(process.argv[2] ?? "test-results/v1.2.1-comparison");
const input = process.argv[3];
assert(input, "Provide the hosted draft snapshot JSON path.");
const drafts = JSON.parse(await readFile(input, "utf8"));
const present = (value) =>
  value !== undefined &&
  value !== null &&
  value !== "" &&
  (!Array.isArray(value) || value.length > 0);
function values(bundle, record) {
  const schema = bundle.schemas.find(
    (item) => item.id === record.schema.id && item.revision === record.schema.revision,
  );
  assert(schema, "A captured record must have a matching schema.");
  return Object.fromEntries(
    schema.fields.flatMap((field) => {
      const value = record.values[field.id];
      if (!present(value)) return [];
      return [
        [field.id, field.kind === "records" ? value.map((child) => values(bundle, child)) : value],
      ];
    }),
  );
}
const results = [];
for (const draft of drafts) {
  const folder =
    draft.dataset === "personal-comparison" ? "private/personal-comparison" : draft.dataset;
  const expected = JSON.parse(
    await readFile(resolve(root, folder, "classic-classic-workflow.json"), "utf8"),
  );
  const sections = expected.data.sections.map((section) => ({
    type: section.type,
    values: values(section.structured, section.structured.record),
  }));
  assert.deepStrictEqual(
    draft.sections,
    sections,
    `${draft.dataset}: frozen wording, dates, or section order changed`,
  );
  assert.equal(
    draft.templateRevision,
    2,
    "The editable draft must use the current built-in document revision.",
  );
  results.push({
    dataset: draft.dataset,
    draftId: draft.id,
    revision: draft.revision,
    sectionCount: sections.length,
    contentSha256: createHash("sha256").update(JSON.stringify(sections)).digest("hex"),
    status: "passed",
  });
}
await writeFile(
  resolve(root, "hosted-content-verification.json"),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(JSON.stringify(results, null, 2));
