import { expect, it } from "vitest";
import type { Composition } from "./composition";
import { emptyStructuredContent } from "./content-defaults";
import type { ContentRecord, StructuredContent } from "./content-schema";
import { newId } from "./core";
import {
  applyWordingProposal,
  captureWordingTarget,
  undoAcceptedWording,
  type WordingProposal,
} from "./wording";
import {
  replaceStructuredWording,
  type StructuredWordingPath,
  structuredWordingPaths,
} from "./wording-structured";

const proposal: WordingProposal = {
  wording: "Improved the synthetic form validation.",
  evidence: [],
  reason: "Concise phrasing",
  meaning: { assessment: "Preserved", explanation: "Same synthetic fact." },
  passages: [],
};
function fixture() {
  const id = newId();
  const entry: ContentRecord = {
    id: "first-entry",
    schema: { id: "experience-entry", revision: 1 },
    layout: { id: "experience-entry-classic", revision: 1 },
    values: {
      employer: "Synthetic employer",
      title: "Developer",
      accomplishments: ["Built synthetic form validation.", "Tested the synthetic form."],
      retainedValue: "Preserve this unused field",
    },
  };
  const other: ContentRecord = {
    ...entry,
    id: "second-entry",
    values: { ...entry.values, employer: "Other synthetic employer" },
  };
  const content: StructuredContent = {
    ...emptyStructuredContent("experience", "root"),
    record: {
      id: "root",
      schema: { id: "experience-section", revision: 1 },
      layout: { id: "experience-section-classic", revision: 1 },
      values: { heading: "Experience", entries: [entry, other] },
    },
    evidence: [
      { claimId: newId(), revisionId: newId() },
      { claimId: newId(), revisionId: newId() },
    ],
  };
  const data: Composition = {
    name: "Synthetic résumé",
    theme: "classic",
    templateRevision: 1,
    sections: [
      {
        id,
        reference: { itemId: newId(), revisionId: newId() },
        type: "experience",
        heading: "Experience",
        reason: null,
        blocks: [],
        structured: content,
      },
    ],
  };
  const path: StructuredWordingPath = {
    kind: "structured-field",
    sectionId: id,
    blockId: null,
    records: [{ fieldId: "entries", recordId: entry.id }],
    fieldId: "accomplishments",
    index: 0,
  };
  return { data, content, entry, other, path };
}

it("targets a nested record by identity across layout changes and sibling reordering", () => {
  const { data, content, entry, other, path } = fixture();
  const original = captureWordingTarget(data, [], path);
  const changed: Composition = {
    ...data,
    name: "Unrelated name",
    sections: data.sections.map((section) => ({
      ...section,
      structured: {
        ...content,
        record: {
          ...content.record,
          values: {
            ...content.record.values,
            entries: [
              other,
              {
                ...entry,
                layout: { id: "experience-entry-compact", revision: 1 },
                values: {
                  ...entry.values,
                  title: "Renamed title",
                  accomplishments: ["Built synthetic form validation.", "Changed sibling wording."],
                },
              },
            ],
          },
        },
      },
    })),
  };
  expect(captureWordingTarget(changed, [], path)).toEqual(original);
  const applied = applyWordingProposal(changed, path, proposal);
  expect(captureWordingTarget(applied, [], path).content.wording).toBe(proposal.wording);
  expect(applied.sections[0]?.structured?.record.values.entries).toEqual([
    other,
    {
      ...entry,
      layout: { id: "experience-entry-compact", revision: 1 },
      values: {
        ...entry.values,
        title: "Renamed title",
        accomplishments: [proposal.wording, "Changed sibling wording."],
      },
    },
  ]);
  expect(applied.sections[0]?.structured?.evidence).toEqual(content.evidence);
  expect(data.sections[0]?.structured).toEqual(content);
});

it("detects target or list-shape changes and excludes date fields and headings", () => {
  const { data, content, entry, other, path } = fixture();
  const original = captureWordingTarget(data, [], path);
  expect(
    captureWordingTarget(replaceStructuredWording(data, path, "Changed target"), [], path),
  ).not.toEqual(original);
  const changed: Composition = {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      structured: {
        ...content,
        record: {
          ...content.record,
          values: {
            heading: "Experience",
            entries: [
              {
                ...entry,
                values: {
                  ...entry.values,
                  accomplishments: [
                    "Built synthetic form validation.",
                    "Inserted list item",
                    "Tested the synthetic form.",
                  ],
                },
              },
              other,
            ],
          },
        },
      },
    })),
  };
  expect(captureWordingTarget(changed, [], path)).not.toEqual(original);
  expect(() =>
    captureWordingTarget(data, [], { ...path, fieldId: "startDate", index: null }),
  ).toThrow();
  expect(() =>
    captureWordingTarget(data, [], { ...path, records: [], fieldId: "heading", index: null }),
  ).toThrow();
  const fields = structuredWordingPaths(content, path.sectionId);
  expect(
    fields.some((item) => item.path.fieldId === "heading" || item.path.fieldId === "startDate"),
  ).toBe(false);
  expect(fields.filter((item) => item.path.fieldId === "accomplishments")).toHaveLength(4);
});

it("builds a scoped Undo without discarding other field edits or evidence references", () => {
  const { data, path, content } = fixture();
  const original = captureWordingTarget(data, [], path);
  const applied = applyWordingProposal(data, path, {
    ...proposal,
    evidence: content.evidence.slice(0, 1),
  });
  const sibling = { ...path, index: 1 };
  const later = replaceStructuredWording(applied, sibling, "Independent sibling edit");
  const undone = undoAcceptedWording(later, [], original, {
    ...proposal,
    evidence: content.evidence.slice(0, 1),
  });
  expect(undone).toEqual(replaceStructuredWording(data, sibling, "Independent sibling edit"));
  expect(
    undoAcceptedWording(
      replaceStructuredWording(later, path, "Later target edit"),
      [],
      original,
      proposal,
    ),
  ).toBeNull();
});

it("captures direct Summary text and a structured entry in a legacy section without projection", () => {
  const { data, path, content, entry } = fixture();
  const summary = emptyStructuredContent("summary", "summary-root");
  const section = data.sections[0];
  if (!section) throw new Error("Missing fixture section");
  const summaryData: Composition = {
    ...data,
    sections: [
      {
        ...section,
        type: "summary",
        structured: {
          ...summary,
          record: {
            ...summary.record,
            values: { heading: "Summary", summary: "Original synthetic summary." },
          },
        },
      },
    ],
  };
  const summaryPath: StructuredWordingPath = {
    ...path,
    records: [],
    fieldId: "summary",
    index: null,
  };
  expect(captureWordingTarget(summaryData, [], summaryPath)).toMatchObject({
    scope: "structured-field-v1",
    content: { wording: "Original synthetic summary." },
  });
  const blockId = newId();
  const nested: Composition = {
    ...data,
    sections: [
      {
        ...section,
        structured: undefined,
        blocks: [
          {
            id: blockId,
            type: "experience",
            reference: section.reference,
            reason: null,
            fields: [],
            structured: { ...content, record: entry },
          },
        ],
      },
    ],
  };
  expect(captureWordingTarget(nested, [], { ...path, blockId, records: [] }).content.wording).toBe(
    "Built synthetic form validation.",
  );
});
