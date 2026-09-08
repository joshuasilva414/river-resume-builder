import {
  type Composition,
  emptyStructuredContent,
  type LibraryData,
  type LibraryGraphNode,
  newId,
  placeSection,
  renderComposition,
  type SourceFields,
  sourceExportIssues,
} from "@river/domain";
import { describe, expect, it } from "vitest";
import { allTypesDocument } from "./fixtures";
import { compose, textLocations, validateRefinedSource } from "./index";
import {
  captureSourceCandidate,
  compareSourceCandidate,
  completeTextDiff,
  type SourceRefinementOutput,
  sourceCandidateDigest,
  structuredSourceFields,
} from "./source-proposals";

function structuredFixture() {
  const evidence = [{ claimId: newId(), revisionId: newId() }];
  const contact = emptyStructuredContent("contact", newId());
  const experience = emptyStructuredContent("experience", newId());
  const entryId = newId();
  const graph: LibraryGraphNode[] = [
    {
      item: { id: newId(), currentRevisionId: newId() },
      revision: {
        id: newId(),
        data: {
          kind: "section",
          type: "contact",
          heading: "",
          blocks: [],
          structured: {
            ...contact,
            record: {
              ...contact.record,
              values: { name: "Alex Example", email: "alex@example.test" },
            },
          },
        },
      },
    },
    {
      item: { id: newId(), currentRevisionId: newId() },
      revision: {
        id: newId(),
        data: {
          kind: "section",
          type: "experience",
          heading: "Experience",
          blocks: [],
          structured: {
            ...experience,
            evidence,
            record: {
              ...experience.record,
              values: {
                heading: "Experience",
                entries: [
                  {
                    id: entryId,
                    schema: { id: "experience-entry", revision: 2 },
                    layout: { id: "experience-entry-classic", revision: 2 },
                    values: {
                      employer: "Northstar",
                      title: "Engineer",
                      accomplishments: ["Built accessible tools.", "Added focused tests."],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  ];
  const data: Composition = {
    name: "Structured refinement",
    theme: "classic",
    templateRevision: 1,
    sections: graph.map((node) =>
      placeSection({ itemId: node.item.id, revisionId: node.revision.id }, graph),
    ),
  };
  return { data, graph, evidence, entryId };
}

it("prepares nested structured text with stable field identities, obligations and evidence", () => {
  const { data, graph, evidence, entryId } = structuredFixture();
  const document = renderComposition(data, graph);
  expect(compose(document, "classic").tex).toContain("Alex Example");
  const fields = structuredSourceFields(data, graph);
  expect(fields.map(({ locator, text }) => ({ locator, text }))).toEqual(textLocations(document));
  expect(fields.find((field) => field.text === "Engineer")).toMatchObject({
    required: true,
    evidence,
  });
  expect(fields.find((field) => field.text === "Built accessible tools.")).toMatchObject({
    required: false,
    evidence,
  });
  expect(fields.find((field) => field.text === "Experience")).toMatchObject({
    role: "heading",
    evidence: [],
  });
  expect(fields.find((field) => field.text === "Engineer")?.locator).toContain(entryId);
  const candidate = captureSourceCandidate(fields, evidence, newId(), {
    source: compose(document, "classic").tex,
    fields: fields.map((field) => ({
      baseLocator: field.locator,
      text: field.text,
      evidence: field.evidence,
      meaning: { assessment: "Preserved", explanation: "Layout only." },
    })),
    explanation: "Layout only.",
  });
  expect(candidate.fields).toEqual(fields);
  expect(() =>
    captureSourceCandidate(fields, evidence, newId(), {
      ...candidate,
      fields: candidate.fields
        .filter((field) => field.text !== "Engineer")
        .map((field) => ({
          baseLocator: field.locator,
          text: field.text,
          evidence: field.evidence,
          meaning: { assessment: "Preserved", explanation: "Layout only." },
        })),
    }),
  ).toThrow("required structured field");
});

it("keeps legacy and structured entry identities together in a mixed document", () => {
  const { data, graph, evidence } = structuredFixture();
  const add = (value: LibraryData) => {
    const node = {
      item: { id: newId(), currentRevisionId: newId() },
      revision: { id: newId(), data: value },
    };
    graph.push(node);
    return { itemId: node.item.id, revisionId: node.revision.id };
  };
  const wording = add({ kind: "content", type: "summary", wording: "Legacy wording.", evidence });
  const block = add({
    kind: "block",
    type: "summary",
    fields: [{ key: "paragraphs", contents: [{ id: newId(), ...wording }] }],
  });
  const section = add({
    kind: "section",
    type: "summary",
    heading: "Summary",
    blocks: [{ id: newId(), ...block }],
  });
  const placement = placeSection(section, graph);
  const contact = data.sections[0];
  if (!contact) throw new Error("Missing contact fixture");
  const mixed = { ...data, sections: [contact, placement, ...data.sections.slice(1)] };
  const fields = structuredSourceFields(mixed, graph);
  expect(fields.map(({ locator, text }) => ({ locator, text }))).toEqual(
    textLocations(renderComposition(mixed, graph)),
  );
  const legacy = fields.find((field) => field.text === "Legacy wording.");
  expect(legacy).toMatchObject({ required: true, evidence });
  expect(legacy?.locator).toContain(
    `/paragraphs/${placement.blocks[0]?.fields[0]?.contents[0]?.id}`,
  );
  const retained = structuredSourceFields(data, graph);
  expect(fields.filter((field) => !field.locator.startsWith(placement.id))).toEqual(retained);
});

it("reports a bounded actionable preparation error without echoing saved content", () => {
  const { data, graph } = structuredFixture();
  expect(() =>
    structuredSourceFields({ ...data, sections: data.sections.slice(1) }, graph),
  ).toThrow("Refinement preparation failed");
});

const source = compose(allTypesDocument, "classic").tex;
const base: SourceFields = textLocations(allTypesDocument).map((field, index) => ({
  ...field,
  origin: "structured",
  role: "content",
  required: index === 0,
  reviewRequired: false,
  evidence: [],
}));
const output = (): SourceRefinementOutput => ({
  source,
  fields: base.map((field) => ({
    baseLocator: field.locator,
    text: field.text,
    evidence: [],
    meaning: { assessment: "Preserved", explanation: "No intended wording change." },
  })),
  explanation: "Complete synthetic candidate.",
});

describe("source proposal review contract", () => {
  it("preserves an inspectable invalid-source candidate while the compiler gate blocks execution", () => {
    const candidate = captureSourceCandidate(base, [], newId(), {
      ...output(),
      source: `${source}\n\\input{private}`,
    });
    expect(candidate.source).toContain("\\input{private}");
    expect(() => validateRefinedSource(candidate.source)).toThrow("Prohibited");
  });
  it("enforces required identities, text and exact supplied evidence before a candidate can be persisted", () => {
    const original = output(),
      id = newId();
    for (const fields of [
      original.fields.slice(1),
      [...original.fields, original.fields[0]],
      original.fields.map((field, index) => (index ? field : { ...field, baseLocator: "unknown" })),
      original.fields.map((field, index) => (index ? field : { ...field, text: "• · \u00ad" })),
      original.fields.map((field, index) =>
        index
          ? field
          : {
              ...field,
              evidence: [{ claimId: newId(), revisionId: newId() }],
            },
      ),
    ])
      expect(() => captureSourceCandidate(base, [], id, { ...original, fields })).toThrow();
    const allowed = [{ claimId: newId(), revisionId: newId() }];
    expect(() =>
      captureSourceCandidate(base, allowed, id, {
        ...original,
        fields: original.fields.map((field, index) =>
          index ? field : { ...field, evidence: [...allowed, ...allowed] },
        ),
      }),
    ).toThrow("repeat");
  });

  it("assigns additions a durable source-only identity and never trusts preserved-meaning claims to verify changed wording", () => {
    const original = output(),
      id = newId();
    const candidate = captureSourceCandidate(base, [], id, {
      ...original,
      fields: [
        ...original.fields.map((field, index) =>
          index ? field : { ...field, text: "Changed Person" },
        ),
        {
          baseLocator: null,
          text: "Added claim.",
          evidence: [],
          meaning: {
            assessment: "Preserved",
            explanation: "Untrusted model assessment.",
          },
        },
      ],
    });
    expect(candidate.fields[0]).toMatchObject({ required: true, reviewRequired: true });
    expect(candidate.fields.at(-1)).toMatchObject({
      locator: `source/${id}/added/${base.length}`,
      origin: "source",
      reviewRequired: true,
    });
    expect(sourceExportIssues(candidate.fields, [], [])).toEqual([]);
    const repeat = captureSourceCandidate(candidate.fields, [], newId(), {
      ...original,
      fields: candidate.fields.map((field) => ({
        baseLocator: field.locator,
        text: field.text,
        evidence: field.evidence,
        meaning: {
          assessment: "Preserved",
          explanation: "Unchanged since preceding source checkpoint.",
        },
      })),
    });
    expect(repeat.fields).toEqual(candidate.fields);
  });

  it("reports every manifest removal, addition, movement and support change separately from the model classification", async () => {
    const original = output(),
      id = newId(),
      ref = { claimId: newId(), revisionId: newId() };
    const first = original.fields[0];
    if (!first) throw new Error("Missing fixture field");
    const candidate = captureSourceCandidate(base, [ref], id, {
      ...original,
      fields: [
        ...original.fields.slice(2),
        { ...first, evidence: [ref] },
        {
          baseLocator: null,
          text: "New statement",
          evidence: [],
          meaning: { assessment: "Changed", explanation: "New factual wording." },
        },
      ],
    });
    const comparison = compareSourceCandidate(
      { source, fields: base, extractedText: "Before" },
      candidate,
      "After",
    );
    expect(comparison.layoutOnly).toBe(false);
    expect(comparison.fields.find((field) => field.locator === first.baseLocator)).toMatchObject({
      moved: true,
      supportChanged: true,
      classification: "Uncertain",
    });
    expect(comparison.fields.filter((field) => field.after === null)).toHaveLength(1);
    expect(comparison.fields.filter((field) => field.before === null)).toHaveLength(1);
    expect(await sourceCandidateDigest(candidate)).not.toBe(
      await sourceCandidateDigest({
        ...candidate,
        explanation: "Different attributable explanation.",
      }),
    );
  });

  it("uses layout-only only when complete intended fields and extracted bytes both remain unchanged", () => {
    const candidate = captureSourceCandidate(base, [], newId(), {
      ...output(),
      source: `${source}\n% Layout note`,
    });
    const input = { source, fields: base, extractedText: "Exact text\n" };
    expect(compareSourceCandidate(input, candidate, "Exact text\n").layoutOnly).toBe(true);
    expect(compareSourceCandidate(input, candidate, "Exact text ").layoutOnly).toBe(false);
  });

  it("reconstructs complete before and after bytes even for large diffs, repeated text and CRLF changes", () => {
    for (const [before, after] of [
      ["Preamble\nRepeat\nRepeat\nEnd", "Preamble\nRepeat\nInserted\nRepeat\nEnd\n"],
      ["Name\r\nRésumé 📄\n", "Name\nRésumé 📄 changed\n"],
      ["", "New"],
      [
        Array.from({ length: 2100 }, (_, i) => `old${i}\n`).join(""),
        Array.from({ length: 2100 }, (_, i) => `new${i}\n`).join(""),
      ],
      ["x\n".repeat(6000), "y\n".repeat(6000)],
    ]) {
      if (before === undefined || after === undefined) throw new Error("Invalid fixture");
      const diff = completeTextDiff(before, after, "fixture");
      expect(
        diff.segments
          .filter((part) => part.kind !== "Added")
          .map((part) => part.text)
          .join(""),
      ).toBe(before);
      expect(
        diff.segments
          .filter((part) => part.kind !== "Removed")
          .map((part) => part.text)
          .join(""),
      ).toBe(after);
      if (before.startsWith("old") || before.length > 10000)
        expect(diff.mode).toBe("complete-replacement");
      expect(diff.segments.at(-1)).toMatchObject({
        beforeEnd: before.length,
        afterEnd: after.length,
      });
    }
  });
});

it("prepares custom root layouts whose heading placeholder follows other fields", () => {
  const { data, graph } = structuredFixture();
  const custom: Composition = {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      reason: "Customized layout",
      structured: section.structured && {
        ...section.structured,
        layouts: section.structured.layouts.map((layout) =>
          layout.id === "contact-section-classic"
            ? { ...layout, source: "{{email}} {{name}} {{phone}} {{location}} {{links}}" }
            : layout.id === "experience-section-classic"
              ? { ...layout, source: "{{entries}} {{heading}}" }
              : layout,
        ),
      },
    })),
  };
  const rendered = renderComposition(custom, graph);
  expect(() => textLocations(rendered)).not.toThrow();
  const fields = structuredSourceFields(custom, graph);
  expect(fields[0]?.text).toBe("Alex Example");
  expect(fields.map((field) => field.text)).toContain("Built accessible tools.");
  expect(fields.map(({ locator, text }) => ({ locator, text }))).toEqual(
    textLocations(renderComposition(custom, graph)),
  );
});
