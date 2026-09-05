import { newId, type SourceFields, sourceExportIssues } from "@river/domain";
import { describe, expect, it } from "vitest";
import { allTypesDocument } from "./fixtures";
import {
  captureSourceCandidate,
  compareSourceCandidate,
  completeTextDiff,
  compose,
  type SourceRefinementOutput,
  sourceCandidateDigest,
  textLocations,
} from "./index";

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
    expect(
      sourceExportIssues(candidate.fields, [], []).filter(
        (item) => item.kind === "Needs clarification",
      ),
    ).toHaveLength(2);
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
