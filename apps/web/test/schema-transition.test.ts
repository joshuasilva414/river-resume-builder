import {
  builtInSchemaBundle,
  captureSchemaBundle,
  emptyStructuredContent,
  type LibraryGraphNode,
  placeSection,
  renderComposition,
  type SchemaBundle,
  StructuredContent,
  validateStructuredContent,
} from "@river/domain";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  builtInSchemaType,
  savedSchemaSnapshots,
  switchContentSchema,
} from "../src/components/library/schema-transition";

function experience(): StructuredContent {
  const content = emptyStructuredContent("experience", "section-1");
  return {
    ...content,
    record: {
      ...content.record,
      values: {
        heading: "Experience",
        entries: [
          {
            id: "entry-1",
            schema: { id: "experience-entry", revision: 1 },
            layout: { id: "experience-entry-compact", revision: 1 },
            values: {
              employer: "Example Company",
              title: "Engineer",
              accomplishments: ["Built accessible forms"],
            },
          },
        ],
      },
    },
  };
}

describe("schema switching preserves definitions and values", () => {
  it("renders a new section switched from Summary to Contact as the résumé header", () => {
    const original = emptyStructuredContent("summary", "record-1");
    const switched = switchContentSchema(original, builtInSchemaBundle, {
      id: "contact-section",
      revision: 1,
    });
    const structured: StructuredContent = {
      ...switched,
      record: {
        ...switched.record,
        values: { ...switched.record.values, name: "Alex Example", email: "alex@example.test" },
      },
    };
    const reference = { itemId: "contact-1", revisionId: "revision-1" };
    const graph = [
      {
        item: { id: reference.itemId, currentRevisionId: reference.revisionId },
        revision: {
          id: reference.revisionId,
          data: {
            kind: "section",
            type: builtInSchemaType(structured.record.schema) ?? "summary",
            heading: "",
            blocks: [],
            structured,
          },
        },
      },
    ] satisfies LibraryGraphNode[];
    const document = renderComposition(
      {
        name: "Fictional preview",
        theme: "classic",
        templateRevision: 1,
        sections: [placeSection(reference, graph, () => "placement-1")],
      },
      graph,
    );
    expect(document.name).toBe("Alex Example");
    expect(document.contact).toContain("alex@example.test");
    expect(document.sections).toEqual([]);
    expect(savedSchemaSnapshots(structured)[0]?.record.schema).toEqual(original.record.schema);
  });

  it("restores Experience after editing Projects without losing either set of entries", () => {
    const original = experience();
    const projectSchema = { id: "project-section", revision: 1 };
    const switched = switchContentSchema(original, builtInSchemaBundle, projectSchema);
    expect(switched.record.values.entries).toEqual(original.record.values.entries);
    expect(() => validateStructuredContent(switched)).toThrow(/requires project-entry/);
    const edited: StructuredContent = {
      ...switched,
      record: {
        ...switched.record,
        values: {
          ...switched.record.values,
          heading: "Projects",
          entries: [
            {
              id: "project-1",
              schema: { id: "project-entry", revision: 1 },
              layout: { id: "project-entry-classic", revision: 1 },
              values: { project: "Example App", description: "A scheduling tool" },
            },
          ],
        },
      },
    };
    const saved = Schema.decodeUnknownSync(StructuredContent)(JSON.parse(JSON.stringify(edited)));
    const restored = switchContentSchema(saved, builtInSchemaBundle, original.record.schema);
    expect(() => validateStructuredContent(restored)).not.toThrow();
    expect(restored.record.id).toBe(original.record.id);
    expect(restored.record.values.entries).toEqual(original.record.values.entries);
    const projectsAgain = switchContentSchema(restored, builtInSchemaBundle, projectSchema);
    expect(projectsAgain.record.values.entries).toEqual(edited.record.values.entries);
    expect(projectsAgain.record.values.heading).toBe("Projects");
    expect(savedSchemaSnapshots(projectsAgain)).toHaveLength(2);
  });

  it("keeps conflicting id and revision definitions in a restorable snapshot", () => {
    const original = experience();
    const changed: SchemaBundle = {
      ...original,
      schemas: original.schemas.map((schema) =>
        schema.id === "experience-entry"
          ? {
              ...schema,
              fields: [
                ...schema.fields,
                { id: "hours", label: "Hours", kind: "number", required: false },
              ],
            }
          : schema,
      ),
      layouts: original.layouts.map((layout) =>
        layout.schema.id === "experience-entry"
          ? { ...layout, source: `${layout.source}\n{{hours}}\\par` }
          : layout,
      ),
    };
    const switched = switchContentSchema(original, changed, original.record.schema);
    expect(() => validateStructuredContent(switched)).not.toThrow();
    expect(switched.record.values.entries).toEqual(original.record.values.entries);
    expect(
      switched.schemas.find((schema) => schema.id === "experience-entry")?.fields.at(-1)?.id,
    ).toBe("hours");
    const snapshot = savedSchemaSnapshots(switched)[0];
    expect(snapshot).toBeDefined();
    if (!snapshot) throw new Error("Expected prior definition snapshot");
    expect(snapshot.schemas).toEqual(original.schemas);
    expect(snapshot.layouts).toEqual(original.layouts);
    const restored = switchContentSchema(switched, snapshot, snapshot.record.schema);
    expect(captureSchemaBundle(restored, restored.record.schema)).toEqual(
      captureSchemaBundle(original, original.record.schema),
    );
    expect(restored.record.values.entries).toEqual(original.record.values.entries);
    expect(
      savedSchemaSnapshots(restored).some((item) =>
        item.layouts.some((layout) => layout.source.includes("{{hours}}")),
      ),
    ).toBe(true);
  });
});
