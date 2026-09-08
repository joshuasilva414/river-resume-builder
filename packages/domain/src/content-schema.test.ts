import { describe, expect, it } from "vitest";
import { placeSection, renderComposition } from "./composition";
import { builtInSchemaBundle, emptyStructuredContent } from "./content-defaults";
import {
  readLegacyDate,
  type StructuredContent,
  validateSchemaBundle,
  validateStructuredContent,
} from "./content-schema";
import { type LibraryData, validateLibraryData } from "./library";

describe("composable content", () => {
  it("creates a direct Summary and renders without wording or block records", () => {
    const header = emptyStructuredContent("contact", "header");
    const summary = emptyStructuredContent("summary", "summary");
    const contents: StructuredContent[] = [
      { ...header, record: { ...header.record, values: { name: "Alex Example" } } },
      {
        ...summary,
        record: {
          ...summary.record,
          values: { heading: "Summary", summary: "Built accessible web applications." },
        },
      },
    ];
    const graph = contents.map((structured, index) => ({
      item: { id: String(index), currentRevisionId: `r${index}` },
      revision: {
        id: `r${index}`,
        data: {
          kind: "section",
          type: index === 0 ? "contact" : "summary",
          heading: index === 0 ? "" : "Summary",
          blocks: [],
          structured,
        } satisfies LibraryData,
      },
    }));
    for (const node of graph) validateLibraryData(node.revision.data);
    const sections = graph.map((node) =>
      placeSection({ itemId: node.item.id, revisionId: node.revision.id }, graph),
    );
    const document = renderComposition(
      { name: "Example", theme: "classic", templateRevision: 1, sections },
      graph,
    );
    expect(document.name).toBe("Alex Example");
    expect(document.sections[0]?.blocks[0]?.paragraphs).toEqual([
      "Built accessible web applications.",
    ]);
    expect(graph).toHaveLength(2);
    expect(sections.every((section) => section.blocks.length === 0)).toBe(true);
  });
  it("uses two compatible Experience layouts without changing data", () => {
    const original = emptyStructuredContent("experience", "experience");
    const values = {
      employer: "Example Labs",
      title: "Engineer",
      endDate: { kind: "present" },
      accomplishments: ["Built the editor."],
    };
    for (const layout of ["experience-entry-classic", "experience-entry-compact"]) {
      const content: StructuredContent = {
        ...original,
        record: {
          ...original.record,
          values: {
            heading: "Experience",
            entries: [
              {
                id: "entry",
                schema: { id: "experience-entry", revision: 2 },
                layout: { id: layout, revision: 2 },
                values,
              },
            ],
          },
        },
      };
      expect(validateStructuredContent(content).record.values.entries).toEqual(
        content.record.values.entries,
      );
    }
  });
  it("rejects cycles, missing saved revisions, and incompatible child layouts", () => {
    const base = emptyStructuredContent("experience", "experience");
    expect(() =>
      validateSchemaBundle({
        ...base,
        schemas: base.schemas.filter((schema) => schema.level === "section"),
      }),
    ).toThrow("Missing schema");
    const root = base.schemas.find((schema) => schema.level === "section");
    if (!root) throw new Error("Missing fixture.");
    const cyclic = {
      ...base,
      schemas: base.schemas.map((schema) =>
        schema === root
          ? {
              ...schema,
              fields: [
                {
                  id: "self",
                  label: "Self",
                  kind: "record",
                  required: false,
                  schema: { id: root.id, revision: 2 },
                  defaultLayout: { id: `${root.id}-classic`, revision: 2 },
                },
              ],
            }
          : schema,
      ),
    };
    expect(() => validateSchemaBundle(cyclic)).toThrow("cycle");
    expect(() =>
      validateSchemaBundle({
        ...base,
        schemas: base.schemas.map((schema) =>
          schema === root
            ? {
                ...schema,
                fields: schema.fields.map((field) =>
                  field.kind === "records"
                    ? { ...field, defaultLayout: { id: "experience-section-classic", revision: 2 } }
                    : field,
                ),
              }
            : schema,
        ),
      }),
    ).toThrow("child layout");
  });
  it("keeps custom values and ambiguous dates and validates GPA/date types", () => {
    expect(readLegacyDate("Autumn 2021 – Early 2024")).toEqual({
      kind: "legacy",
      text: "Autumn 2021 – Early 2024",
    });
    const original = emptyStructuredContent("summary", "summary");
    const content = {
      ...original,
      record: {
        ...original.record,
        values: { heading: "Summary", summary: "Built software.", unusedCustomField: 42 },
      },
    };
    expect(validateStructuredContent(content).record.values.unusedCustomField).toBe(42);
    const education = emptyStructuredContent("education", "education");
    const entry = {
      id: "edu",
      schema: { id: "education-entry", revision: 2 },
      layout: { id: "education-entry-classic", revision: 2 },
      values: { institution: "Example University", degree: "BS", gpa: "3.8" },
    };
    expect(() =>
      validateStructuredContent({
        ...education,
        record: { ...education.record, values: { heading: "Education", entries: [entry] } },
      }),
    ).toThrow("wrong value type");
    expect(() =>
      validateStructuredContent({
        ...education,
        record: {
          ...education.record,
          values: {
            heading: "Education",
            entries: [
              {
                ...entry,
                values: {
                  ...entry.values,
                  gpa: 3.8,
                  endDate: { kind: "day", value: "2026-02-30" },
                },
              },
            ],
          },
        },
      }),
    ).toThrow("valid calendar date");
    expect(() => validateSchemaBundle(builtInSchemaBundle)).not.toThrow();
  });
});
