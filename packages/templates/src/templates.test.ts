import { describe, expect, it } from "vitest";
import { allTypesDocument } from "./fixtures";
import {
  compose,
  escapeTex,
  expectedText,
  fixedPack,
  syntheticResume,
  validateTemplate,
  validateText,
} from "./index";

describe("safe composition and text integrity", () => {
  it("escapes scalar input including apparent LaTeX commands", () => {
    expect(escapeTex("A&B 50% $x_1 {hi} \\input{secret}")).toBe(
      "A\\&B 50\\% \\$x\\_1 \\{hi\\} \\textbackslash{}input\\{secret\\}",
    );
    const result = compose({ ...syntheticResume, name: "\\input{/etc/passwd}" }, "classic");
    expect(result.tex).not.toContain("\\input{/etc/passwd}");
  });
  it.each(["classic", "minimal", "technical"] as const)(
    "produces deterministic source for %s",
    (theme) => {
      expect(compose(syntheticResume, theme)).toEqual(compose(syntheticResume, theme));
    },
  );
  it("blocks missing and duplicated text while reporting reordered text", () => {
    const expected = expectedText(syntheticResume);
    expect(validateText(syntheticResume, expected).passed).toBe(true);
    expect(validateText(syntheticResume, expected.replace("Fieldnotes", "")).passed).toBe(false);
    expect(validateText(syntheticResume, `${expected} Fieldnotes`).passed).toBe(false);
    expect(validateText(syntheticResume, expected.split("\n").reverse().join("\n"))).toMatchObject({
      passed: true,
      checks: { readingOrder: false },
    });
  });
});

describe("three-level fixed packs", () => {
  it.each(["classic", "minimal", "technical"] as const)(
    "pins and validates every %s fragment",
    (theme) => {
      const pack = fixedPack(theme);
      expect(pack.blocks).toHaveLength(7);
      expect(pack.sections).toHaveLength(6);
      for (const revision of [pack.document, ...pack.sections, ...pack.blocks])
        expect(() => validateTemplate(revision)).not.toThrow();
      const result = compose(allTypesDocument, theme);
      expect(result.tex).toContain("\\section*");
      expect(validateText(allTypesDocument, expectedText(allTypesDocument)).passed).toBe(true);
      expect(JSON.parse(result.identity).pack.blocks).toHaveLength(7);
    },
  );
  it("rejects executable constructs and undeclared slots before compilation", () => {
    const template = fixedPack("classic").document;
    for (const source of [
      "\\input{private}",
      "\\write18{command}",
      "\\csname input\\endcsname",
      "^^5cinput{private}",
      "\\usepackage{shellesc}",
      "{{unknown}}",
      "{{malformed",
      "\\begin{filecontents}x\\end{filecontents}",
    ]) {
      expect(() => validateTemplate({ ...template, source: template.source + source })).toThrow();
    }
  });
  it("rejects incompatible child content types", () => {
    expect(() =>
      compose(
        {
          name: "Synthetic",
          contact: [],
          sections: [
            {
              type: "summary",
              heading: "Summary",
              blocks: [
                { type: "project", heading: "Project", detail: "", paragraphs: [], bullets: [] },
              ],
            },
          ],
        },
        "classic",
      ),
    ).toThrow("Section and Block types must agree");
  });
});

describe("complete custom graphs", () => {
  it("uses stable synthetic placement locators across fixture runs", () => {
    for (const location of allTypesDocument.textLocators ?? []) {
      for (const segment of location.locator.split("/"))
        if (segment.includes("-")) expect(segment).toMatch(/^00000000-0000-7000-8000-/);
    }
  });
  it("accepts compatible components across fixed packs and retains exact identities", async () => {
    const { validateGraph, graphInventory, composeGraph } = await import("./index");
    const classic = fixedPack("classic"),
      minimal = fixedPack("minimal");
    const graph = validateGraph({ ...classic, blocks: minimal.blocks });
    expect(graph.blocks.every((block) => block.manifest.id.startsWith("minimal/"))).toBe(true);
    expect(graphInventory(graph).renderer).toBe("river-tectonic-0.3.0");
    expect(composeGraph(allTypesDocument, graph)).toEqual(composeGraph(allTypesDocument, graph));
    expect(JSON.parse(compose(allTypesDocument, "classic").identity).rendererVersion).toBe(
      "river-tectonic-0.2.0",
    );
  });
  it("rejects missing types, duplicate content slots, incompatible bindings, and invalid inherited styles", async () => {
    const { validateGraph } = await import("./index");
    const base = fixedPack("classic"),
      block = base.blocks[0];
    if (!block) throw Error("Missing fixture block");
    expect(() => validateGraph({ ...base, blocks: base.blocks.slice(1) })).toThrow();
    expect(() =>
      validateGraph({
        ...base,
        document: { ...base.document, source: `${base.document.source}{{header}}` },
      }),
    ).toThrow("exactly once");
    expect(() =>
      validateGraph({
        ...base,
        document: {
          ...base.document,
          manifest: {
            ...base.document.manifest,
            slots: base.document.manifest.slots.map((slot) =>
              slot.name === "header" ? { name: "header", kind: "text" } : slot,
            ),
          },
        },
      }),
    ).toThrow("renderer bindings");
    expect(() =>
      validateGraph({
        ...base,
        blocks: [
          { ...block, manifest: { ...block.manifest, overrides: { margin: 0.7 } } },
          ...base.blocks.slice(1),
        ],
      }),
    ).toThrow("Document template");
    expect(() => validateGraph({ ...base, tokens: { ...base.tokens, bodySize: 8 } })).toThrow();
  });
  it("propagates document and section styles while preserving explicit block overrides", async () => {
    const { composeGraph, validateGraph } = await import("./index");
    const base = fixedPack("classic");
    const graph = validateGraph({
      ...base,
      document: {
        ...base.document,
        manifest: {
          ...base.document.manifest,
          overrides: { font: "Latin Modern Sans", bodySize: 11 },
        },
      },
      sections: base.sections.map((section) =>
        section.manifest.contentTypes.includes("summary")
          ? {
              ...section,
              manifest: { ...section.manifest, overrides: { bodySize: 9, sectionSpacing: 18 } },
            }
          : section,
      ),
      blocks: base.blocks.map((block) =>
        block.manifest.contentTypes.includes("summary")
          ? {
              ...block,
              manifest: {
                ...block.manifest,
                overrides: { font: "Latin Modern Roman", bodySize: 10 },
              },
            }
          : block,
      ),
    });
    const { tex } = composeGraph(allTypesDocument, graph);
    expect(tex).toContain("\\setmainfont{Latin Modern Sans}");
    expect(tex).toContain("\\fontsize{11pt}{13.2pt}\\selectfont");
    expect(tex).toContain("\\fontsize{9pt}{10.8pt}\\selectfont");
    expect(tex).toContain("\\fontspec{Latin Modern Roman}");
    expect(tex).toContain("\\fontsize{10pt}{12.0pt}\\selectfont");
    expect(tex).toContain("\\titlespacing*{\\section}{0pt}{18pt}{4pt}");
  });
});
