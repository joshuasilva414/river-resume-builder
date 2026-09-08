import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  adaptLibraryContent,
  builtInSchemaBundle,
  type Composition,
  ContentRecord,
  ContentType,
  ContentValues,
  canonicalJson,
  captureSchemaBundle,
  LibraryData,
  type LibraryGraphNode,
  newId,
  placeSection,
  readLegacyDate,
  renderComposition,
  resolveContentSchema,
  type SchemaReference,
  type StructuredContent,
  validateStructuredContent,
} from "@river/domain";
import { expectedText, templateInventory } from "@river/templates";
import { Schema } from "effect";

const Benchmark = Schema.Struct({
  id: Schema.String,
  targetPages: Schema.Number,
  sections: Schema.Array(Schema.Struct({ type: ContentType, values: ContentValues })),
});
const directory = resolve(process.argv[2] ?? "test-results/v1.2.1-comparison");
await mkdir(directory, { recursive: true });
const fictional = Schema.decodeUnknownSync(Schema.Array(Benchmark))(
  JSON.parse(await readFile("scripts/evaluation/resume-quality-content.json", "utf8")),
);
function record(reference: SchemaReference, values: ContentValues): ContentRecord {
  const schema = resolveContentSchema(builtInSchemaBundle, reference);
  const typed = Object.fromEntries(
    schema.fields.flatMap((field) => {
      const value = values[field.id];
      if (value === undefined) return [];
      if (field.kind === "records")
        return [
          [
            field.id,
            Schema.decodeUnknownSync(Schema.Array(ContentValues))(value).map((child) =>
              record(field.schema, child),
            ),
          ],
        ];
      if (field.kind === "date" && typeof value === "string")
        return [[field.id, readLegacyDate(value)]];
      return [[field.id, value]];
    }),
  );
  return {
    id: newId(),
    schema: reference,
    layout: { id: `${reference.id}-classic`, revision: reference.revision },
    values: typed,
  };
}
const sets: {
  id: string;
  targetPages: number;
  contents: { type: ContentType; structured: StructuredContent }[];
}[] = fictional.map((benchmark) => ({
  id: benchmark.id,
  targetPages: benchmark.targetPages,
  contents: benchmark.sections.map((section) => {
    const reference = {
      id: `${section.type === "skill" ? "skills" : section.type}-section`,
      revision: 2,
    };
    const structured = {
      ...captureSchemaBundle(builtInSchemaBundle, reference),
      record: record(reference, section.values),
      evidence: [],
    };
    validateStructuredContent(structured);
    return { type: section.type, structured };
  }),
}));
const personalPath = resolve(directory, "private/personal-source.json");
const personal = Schema.decodeUnknownSync(
  Schema.Struct({
    rows: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        item_id: Schema.String,
        label: Schema.String,
        data: LibraryData,
      }),
    ),
  }),
)(JSON.parse(await readFile(personalPath, "utf8")));
const graph: LibraryGraphNode[] = personal.rows.map((row) => ({
  item: { id: row.item_id, currentRevisionId: row.id },
  revision: { id: row.id, data: row.data },
}));
const order: ContentType[] = ["contact", "experience", "project", "education", "skill"];
sets.push({
  id: "personal-comparison",
  targetPages: 1,
  contents: order.flatMap((type) =>
    personal.rows
      .filter((row) => row.data.kind === "section" && row.data.type === type)
      .map((row) => ({ type, structured: adaptLibraryContent(row.data, graph) })),
  ),
});

function entryLayout(content: StructuredContent, style: "classic" | "compact"): StructuredContent {
  const update = (current: ContentRecord): ContentRecord => {
    const definition = resolveContentSchema(content, current.schema);
    const values = { ...current.values };
    for (const field of definition.fields) {
      if (field.kind === "records" && values[field.id])
        values[field.id] = Schema.decodeUnknownSync(Schema.Array(ContentRecord))(
          values[field.id],
        ).map(update);
      if (field.kind === "record" && values[field.id])
        values[field.id] = update(Schema.decodeUnknownSync(ContentRecord)(values[field.id]));
    }
    const layout =
      definition.level === "entry"
        ? content.layouts.find(
            (layout) =>
              layout.id === `${definition.id}-${style}` &&
              layout.schema.revision === definition.revision,
          )
        : undefined;
    return {
      ...current,
      values,
      ...(layout ? { layout: { id: layout.id, revision: layout.revision } } : {}),
    };
  };
  return { ...content, record: update(content.record) };
}
for (const benchmark of sets) {
  const target = resolve(
    directory,
    benchmark.id === "personal-comparison" ? "private/personal-comparison" : benchmark.id,
  );
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, "frozen-content.json"), JSON.stringify(benchmark, null, 2));
  for (const style of ["classic", "compact"] as const)
    for (const theme of ["classic", "minimal", "technical"] as const) {
      const library = benchmark.contents.map(({ type, structured }) => {
        const itemId = newId(),
          revisionId = newId();
        const content = entryLayout(structured, style);
        const data: LibraryData = {
          kind: "section",
          type,
          heading:
            typeof content.record.values.heading === "string" ? content.record.values.heading : "",
          blocks: [],
          structured: content,
        };
        return {
          item: { id: itemId, currentRevisionId: revisionId },
          revision: { id: revisionId, data },
        };
      });
      const data: Composition = {
        name: `v1.2.1 comparison · ${benchmark.id} · ${theme} · ${style}`,
        theme,
        templateRevision: 2,
        sections: library.map((node) =>
          placeSection({ itemId: node.item.id, revisionId: node.revision.id }, library),
        ),
      };
      const document = renderComposition(data, library);
      await writeFile(
        resolve(target, `${theme}-${style}.json`),
        JSON.stringify(
          {
            type: "compile-resume",
            jobId: `${benchmark.id}-${theme}-${style}`,
            theme,
            document,
            templateIdentity: canonicalJson(templateInventory(theme)),
          },
          null,
          2,
        ),
      );
      await writeFile(
        resolve(target, `${theme}-${style}-workflow.json`),
        JSON.stringify({ data, library }, null, 2),
      );
      await writeFile(resolve(target, `${theme}-${style}-expected.txt`), expectedText(document));
    }
}
console.log(
  "Prepared three frozen datasets and eighteen render/workflow inputs; personal facts remain in the ignored private directory.",
);
