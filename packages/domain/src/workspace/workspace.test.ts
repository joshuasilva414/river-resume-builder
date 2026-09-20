import { describe, expect, it } from "vitest";
import { cloneContent, contentFromFacts, mapIntoDefinition } from "./content";
import { type ContentLeaf, candidateFactSchema, dateValueSchema, populated } from "./model";
import { formatDate, resolveDocument, validateRenderedText } from "./resolve";
import { renderingFixture, standardTemplate } from "./starter";
import { parseResume, parseTemplate } from "./validation";

describe("workspace values and resolution", () => {
  it("accepts partial dates, Present, zero and false, and rejects impossible dates", () => {
    expect(formatDate({ precision: "year", year: 2024 })).toBe("2024");
    expect(formatDate({ precision: "month", year: 2024, month: 2 })).toBe("Feb 2024");
    expect(formatDate({ precision: "present" })).toBe("Present");
    expect(populated({ kind: "number", value: 0 })).toBe(true);
    expect(populated({ kind: "boolean", value: false })).toBe(true);
    expect(
      dateValueSchema.safeParse({ precision: "day", year: 2023, month: 2, day: 29 }).success,
    ).toBe(false);
  });
  it("copies facts into content, and copies library content with new identities", () => {
    const fact = candidateFactSchema.parse({
      id: "fact",
      label: "Skill",
      key: "skills",
      contextId: null,
      sourceId: null,
      value: { kind: "skill", value: "React" },
    });
    const content = contentFromFacts([fact], "Skills");
    fact.value = { kind: "skill", value: "Vue" };
    const copy = cloneContent(content);
    expect(content.children[0]).toMatchObject({ value: { value: "React" }, factIds: ["fact"] });
    expect(copy.id).not.toBe(content.id);
    if (copy.kind === "group") expect(copy.children[0]?.id).not.toBe(content.children[0]?.id);
  });
  it("validates shared layouts and preserves repeated content", () => {
    const resume = parseResume(renderingFixture(5));
    expect(
      resume.template.document.definitions.filter((item) => item.id === "experience"),
    ).toHaveLength(1);
    const text = resolveDocument(resume).expectedText.join(" ");
    expect(text.match(/Northstar Studio/g)).toHaveLength(5);
    expect(text.match(/Feb 2024\s+–\s+Present/g)).toHaveLength(5);
    expect(text).not.toContain("GPA:");
  });
  it("does not print labels or punctuation for absent dates", () => {
    const resume = renderingFixture(1);
    const section = resume.sections.find((item) => item.key === "experiences");
    if (section?.kind !== "group" || section.children[0]?.kind !== "group")
      throw new Error("fixture");
    section.children[0].children = section.children[0].children.filter(
      (item) => item.key !== "start",
    );
    const text = resolveDocument(resume).expectedText.join(" ");
    expect(text).toContain("Present");
    expect(text).not.toContain(" – ");
  });
  it("rejects layout cycles and double field placement", () => {
    const template = standardTemplate();
    const definition = template.definitions[0];
    if (!definition || !("children" in definition.layout)) throw new Error("fixture");
    definition.layout.children.push({
      kind: "field",
      id: "duplicate-binding",
      style: {},
      fieldKey: "name",
    });
    expect(() => parseTemplate(template)).toThrow("binding");
  });
  it("preserves unmatched content during mapping", () => {
    const node: ContentLeaf = {
      kind: "field",
      id: "value",
      key: "unmatched",
      label: "A fact",
      factIds: [],
      value: { kind: "number", value: 0 },
    };
    const definition = standardTemplate().definitions.find((item) => item.id === "education");
    if (!definition) throw new Error("fixture");
    expect(mapIntoDefinition([node], definition).unused).toEqual([node]);
    expect(mapIntoDefinition([node], definition, { value: "gpa" }).accepted[0]).toMatchObject({
      key: "gpa",
      value: { value: 0 },
    });
  });
  it("detects missing, repeated and reordered printed text", () => {
    expect(validateRenderedText(["A", "B", "A"], "A B A").ok).toBe(true);
    expect(validateRenderedText(["A", "B", "A"], "A B").ok).toBe(false);
    expect(validateRenderedText(["A", "B", "C"], "A C B").ok).toBe(false);
  });
});
