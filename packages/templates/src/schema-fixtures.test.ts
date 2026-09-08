import {
  builtInSchemaBundle,
  type ContentSchemaField,
  type SchemaBundle,
  schemaKey,
  validateStructuredContent,
} from "@river/domain";
import { describe, expect, it } from "vitest";
import { templateFixtures } from "./fixtures";
import { type TemplateGraph, validateGraph } from "./graph";
import { composeGraph } from "./index";
import { fixedPack } from "./manifests";
import { schemaSampleDocument, schemaValidationDocument } from "./schema-fixtures";

const graph = (composition: SchemaBundle): TemplateGraph =>
  validateGraph({ ...fixedPack("classic"), composition });

describe("schema validation samples", () => {
  it("renders every named layout, including child, custom and contact alternatives", () => {
    const contact = builtInSchemaBundle.layouts.find(
      (layout) => layout.schema.id === "contact-section",
    );
    if (!contact) throw new Error("Missing contact fixture.");
    const composition: SchemaBundle = {
      ...builtInSchemaBundle,
      schemas: [
        ...builtInSchemaBundle.schemas,
        {
          id: "custom",
          revision: 1,
          name: "Custom",
          level: "entry",
          fields: [{ id: "custom-value", label: "Custom value", kind: "text", required: true }],
        },
      ],
      layouts: [
        ...builtInSchemaBundle.layouts,
        {
          ...contact,
          id: "contact-alternative",
          name: "Contact alternative",
          source: `\\begin{minipage}{0.9\\textwidth}${contact.source}\\end{minipage}`,
        },
        {
          id: "custom-layout",
          revision: 1,
          name: "Custom layout",
          schema: { id: "custom", revision: 1 },
          source: "\\textit{ {{custom-value}} }",
        },
      ],
    };
    const document = schemaValidationDocument(graph(composition));
    const content = [
      document.structuredContact,
      ...document.sections.map((section) => section.structured),
    ].filter((item) => item !== undefined);
    expect(new Set(content.map((item) => schemaKey(item.record.layout)))).toEqual(
      new Set(composition.layouts.map(schemaKey)),
    );
    for (const item of content) expect(() => validateStructuredContent(item)).not.toThrow();
    const tex = composeGraph(document, graph(composition)).tex;
    expect(tex).toContain("\\textit{ Example custom value }");
    expect(tex).toContain("\\begin{minipage}{0.9\\textwidth}");
    expect(document.sections.length).toBeGreaterThan(
      schemaSampleDocument(graph(composition)).sections.length,
    );
  });

  it("sends a grammar-valid broken alternative to the compiler instead of approving only defaults", () => {
    const composition = {
      ...builtInSchemaBundle,
      layouts: builtInSchemaBundle.layouts.map((layout) =>
        layout.id === "experience-entry-compact"
          ? { ...layout, source: `\\begin{minipage}{invalid}${layout.source}\\end{minipage}` }
          : layout,
      ),
    };
    const invalid = graph(composition);
    expect(composeGraph(schemaSampleDocument(invalid), invalid).tex).not.toContain("{invalid}");
    expect(composeGraph(schemaValidationDocument(invalid), invalid).tex).toContain("{invalid}");
  });

  it.each(["number", "date", "boolean", "list"] as const)(
    "honors a %s field named heading",
    (kind) => {
      const heading: ContentSchemaField = {
        id: "heading",
        label: "Heading",
        required: true,
        ...(kind === "list" ? ({ kind, items: "date" } as const) : { kind }),
      };
      const composition: SchemaBundle = {
        version: 2,
        schemas: [{ id: "typed", revision: 1, name: "Typed", level: "section", fields: [heading] }],
        layouts: [
          {
            id: "typed-layout",
            revision: 1,
            name: "Typed",
            schema: { id: "typed", revision: 1 },
            source: "{{heading}}\\par",
          },
        ],
      };
      const document = schemaValidationDocument(graph(composition));
      expect(() => validateStructuredContent(document.sections[0]?.structured)).not.toThrow();
      expect(document.sections[0]?.heading).not.toBe("Typed");
    },
  );

  it("bounds concrete expansion even when a small acyclic graph has many repeated child paths", () => {
    const composition: SchemaBundle = {
      version: 2,
      schemas: Array.from({ length: 12 }, (_, index) => ({
        id: `s${index}`,
        revision: 1,
        name: `Schema ${index}`,
        level: "section",
        fields:
          index === 11
            ? [{ id: "value", label: "Value", kind: "text", required: true }]
            : ["left", "right"].map((id) => ({
                id,
                label: id,
                kind: "record",
                required: true,
                schema: { id: `s${index + 1}`, revision: 1 },
                defaultLayout: { id: `l${index + 1}`, revision: 1 },
              })),
      })),
      layouts: Array.from({ length: 12 }, (_, index) => ({
        id: `l${index}`,
        revision: 1,
        name: `Layout ${index}`,
        schema: { id: `s${index}`, revision: 1 },
        source: index === 11 ? "{{value}}\\par" : "{{left}}{{right}}\\par",
      })),
    };
    expect(() => schemaValidationDocument(graph(composition))).toThrow("record or nesting limit");
  });

  it("preserves the exact legacy fixture when no composition bundle exists", () => {
    expect(schemaValidationDocument(fixedPack("classic"))).toBe(templateFixtures[0].document);
    expect(schemaSampleDocument(fixedPack("classic"))).toBe(templateFixtures[0].document);
  });
});
