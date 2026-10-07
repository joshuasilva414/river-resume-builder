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

it("imports typed values without verification states and rejects malformed dates and dangling contexts", async () => {
  const { resolveImportPreview, typedValueFromText } = await import("./imports");
  const preview = resolveImportPreview(
    {
      contexts: [{ key: "job", label: "Northstar", kind: "employment" }],
      facts: [
        { key: "endDate", label: "End date", type: "date", value: "Present", contextKey: "job" },
        { key: "gpa", label: "GPA", type: "number", value: "0", contextKey: null },
        { key: "remote", label: "Remote", type: "boolean", value: "false", contextKey: "job" },
      ],
    },
    null,
  );
  expect(preview.facts[0]?.contextId).toBe(preview.contexts[0]?.id);
  expect(preview.facts[1]?.value).toEqual({ kind: "number", value: 0 });
  expect(preview.facts[2]?.value).toEqual({ kind: "boolean", value: false });
  expect(() => typedValueFromText("date", "2023-02-29")).toThrow();
  expect(() =>
    resolveImportPreview(
      {
        contexts: [],
        facts: [
          { key: "role", label: "Role", type: "text", value: "Engineer", contextKey: "missing" },
        ],
      },
      null,
    ),
  ).toThrow();
});

it("unwraps layout containers without changing field bindings or values", async () => {
  const { layoutPath, moveLayout, removeLayout } = await import("./layout");
  const resume = renderingFixture(2),
    definition = resume.template.document.definitions.find((item) => item.id === "education");
  if (!definition) throw Error("Missing fixture");
  const container =
    definition.layout.kind === "column"
      ? definition.layout.children.find((node) => node.kind === "row")
      : undefined;
  if (container?.kind !== "row") throw Error("Missing row");
  const children = container.children.map((node) => node.id),
    unwrapped = removeLayout(definition.layout, container.id);
  for (const id of children) expect(layoutPath(unwrapped, id)).toHaveLength(2);
  expect(moveLayout(unwrapped, unwrapped.id, children[0] ?? "", "inside")).toEqual(unwrapped);
});
it("deleting a nested template row keeps its section, while deleting the root removes only that section", async () => {
  const { removeTemplateNode } = await import("./layout");
  const template = standardTemplate(),
    contact = template.definitions.find((item) => item.id === "contact");
  if (contact?.layout.kind !== "column") throw Error("fixture");
  const row = contact.layout.children.find((item) => item.kind === "row");
  if (!row) throw Error("fixture");
  const unwrapped = parseTemplate(removeTemplateNode(template, contact.id, row.id, "contact"));
  expect(unwrapped.sections).toEqual(template.sections);
  expect(unwrapped.definitions.find((item) => item.id === "contact")?.fields).toEqual(
    contact.fields,
  );
  expect(
    removeTemplateNode(template, contact.id, contact.layout.id, "contact").sections.map(
      (item) => item.key,
    ),
  ).toEqual(template.sections.filter((item) => item.key !== "contact").map((item) => item.key));
});
it("hides conditional labels for empty nested groups, and prints zero and false with their prefixes", async () => {
  const { blankResume, blankGroup, addTemplateField } = await import("./index");
  const template = standardTemplate(),
    experience = template.definitions.find((item) => item.id === "experiences"),
    education = template.definitions.find((item) => item.id === "education");
  if (experience?.layout.kind !== "column" || !education) throw Error("fixture");
  experience.layout.children.unshift({
    id: "conditional",
    kind: "literal",
    text: "Available experience",
    whenField: "entries",
    style: {},
  });
  template.definitions = template.definitions.map((item) =>
    item.id === education.id
      ? addTemplateField(item, {
          id: "remote",
          key: "remote",
          label: "Remote",
          type: "boolean",
          repeat: false,
          required: false,
          prefix: "Remote: ",
          suffix: "",
          separator: "",
          dateFormat: "short",
        })
      : item,
  );
  const resume = blankResume(template, "template", 1),
    group = resume.sections.find((item) => item.key === "experiences"),
    schools = resume.sections.find((item) => item.key === "educations");
  if (group?.kind !== "group" || schools?.kind !== "group") throw Error("fixture");
  group.children.push(blankGroup(template, "experience", "entries", "Experience"));
  expect(resolveDocument(resume).expectedText.join(" ")).not.toContain("Available experience");
  const school = blankGroup(template, "education", "entries", "Education");
  school.children = school.children.map((item) =>
    item.kind === "field" && item.key === "gpa"
      ? { ...item, value: { kind: "number", value: 0 } }
      : item.kind === "field" && item.key === "remote"
        ? { ...item, value: { kind: "boolean", value: false } }
        : item,
  );
  schools.children.push(school);
  const text = resolveDocument(resume).expectedText.join(" ");
  expect(text).toContain("GPA: 0");
  expect(text).toContain("Remote: No");
});
it("applying a new template retains repeated entry counts and unused values", async () => {
  const { applyTemplate } = await import("./mapping");
  const resume = renderingFixture(3),
    template = structuredClone(resume.template.document),
    education = template.definitions.find((item) => item.id === "education");
  if (!education) throw Error("Missing fixture");
  const changed = applyTemplate(resume, { ...resume.template, revision: 2, document: template });
  const { findContent } = await import("./content");
  const visit = (nodes: typeof resume.sections) => {
    for (const node of nodes) {
      const after = findContent(changed.sections, node.id);
      expect(after).toBeDefined();
      if (node.kind === "field") {
        expect(after?.kind === "field" ? after.value : null).toEqual(node.value);
      } else visit(node.children);
    }
  };
  visit(resume.sections);
  const beforeEntries = resume.sections.find((node) => node.key === "experiences"),
    afterEntries = changed.sections.find((node) => node.key === "experiences");
  expect(afterEntries?.kind === "group" ? afterEntries.children.length : 0).toBe(
    beforeEntries?.kind === "group" ? beforeEntries.children.length : 0,
  );
  template.sections = template.sections.filter((section) => section.key !== "educations");
  const switched = applyTemplate(resume, { ...resume.template, revision: 3, document: template });
  expect(switched.sections.length + switched.unused.length).toBe(resume.sections.length);
});

it("rejects suggestion application after target or job changes, and keeps sibling values intact", async () => {
  const { applySuggestion, findContent, suggestionInputKey, wordingAlternatives } = await import(
    "./index"
  );
  const resume = renderingFixture(1),
    contact = resume.sections[0];
  if (contact?.kind !== "group") throw Error("fixture");
  const target = contact.children.find((item) => item.key === "name");
  if (target?.kind !== "field") throw Error("fixture");
  const alternatives = wordingAlternatives(
    target,
    {
      alternatives: [
        {
          title: "Short name",
          explanation: "Use a shorter form.",
          changes: [
            { id: target.id, value: { kind: "text", value: [{ text: "Maya" }] }, factIds: [] },
          ],
        },
      ],
    },
    [],
  );
  const result = {
    runId: "run",
    targetId: target.id,
    inputKey: suggestionInputKey(target, resume.job),
    alternatives,
  };
  const changed = applySuggestion(resume, result, 0);
  expect(findContent(changed.sections, target.id)).toMatchObject({
    value: { value: [{ text: "Maya" }] },
  });
  expect(changed.sections.slice(1)).toEqual(resume.sections.slice(1));
  expect(() => applySuggestion(changed, result, 0)).toThrow(/changed/);
  expect(() =>
    applySuggestion(
      { ...resume, job: { id: "new", title: "New job", description: "New description" } },
      result,
      0,
    ),
  ).toThrow(/changed/);
  expect(() =>
    wordingAlternatives(
      target,
      {
        alternatives: [
          {
            title: "Bad",
            explanation: "Bad target",
            changes: [{ id: "foreign", value: target.value, factIds: [] }],
          },
        ],
      },
      [],
    ),
  ).toThrow(/identity/);
});
