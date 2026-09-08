import { Schema } from "effect";
import { expect, it } from "vitest";
import { builtInSchemaBundleV1 } from "./content-defaults-v1";
import { ContentRecord, captureSchemaBundle, type StructuredContent } from "./content-schema";
import { upgradeBuiltInContent } from "./content-upgrades";

const previous: StructuredContent = {
  ...captureSchemaBundle(builtInSchemaBundleV1, { id: "experience-section", revision: 1 }),
  record: {
    id: "experience",
    schema: { id: "experience-section", revision: 1 },
    layout: { id: "experience-section-classic", revision: 1 },
    values: {
      heading: "Experience",
      savedUnknown: "Preserve this field",
      entries: [
        {
          id: "role",
          schema: { id: "experience-entry", revision: 1 },
          layout: { id: "experience-entry-compact", revision: 1 },
          values: {
            employer: "Fictional Company",
            title: "Engineer",
            startDate: { kind: "legacy", text: "2022–2025" },
            accomplishments: ["Built the fictional feature."],
            savedUnknown: { text: "Retained" },
          },
        },
      ],
    },
  },
  evidence: [{ claimId: "claim", revisionId: "revision" }],
};

it("advances unchanged built-ins once without changing facts, identities, evidence, or saved history", () => {
  const original = structuredClone(previous);
  const upgraded = upgradeBuiltInContent(previous);
  expect(upgraded.record.schema.revision).toBe(2);
  expect(upgraded.record.values.savedUnknown).toBe("Preserve this field");
  const entries = Schema.decodeUnknownSync(Schema.Array(ContentRecord))(
    upgraded.record.values.entries,
  );
  const originals = Schema.decodeUnknownSync(Schema.Array(ContentRecord))(
    original.record.values.entries,
  );
  expect(entries).toEqual([
    {
      ...originals[0],
      schema: { id: "experience-entry", revision: 2 },
      layout: { id: "experience-entry-compact", revision: 2 },
    },
  ]);
  expect(upgraded.evidence).toBe(previous.evidence);
  expect(upgradeBuiltInContent(upgraded)).toBe(upgraded);
  expect(previous).toEqual(original);
});

it("preserves custom sources, customized definitions, and non-built-in identities", () => {
  for (const custom of [
    {
      ...previous,
      layouts: previous.layouts.map((layout) => ({ ...layout, source: `${layout.source}\n` })),
    },
    {
      ...previous,
      schemas: previous.schemas.map((schema) => ({ ...schema, name: `My ${schema.name}` })),
    },
    { ...previous, layouts: previous.layouts.map((layout) => ({ ...layout, revision: 7 })) },
  ])
    expect(upgradeBuiltInContent(custom)).toBe(custom);
});
