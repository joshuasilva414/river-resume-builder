import type { Composition, LibraryGraphNode } from "./composition";
import { contentValue } from "./composition";
import { canonicalJson } from "./core";
import type { SourceFields } from "./refinement";

export interface HistoryEntry {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}
/** Stable placement locators distinguish repeated text; copied placements remain distinct. */
export function historyWording(
  data: Composition,
  graph: readonly LibraryGraphNode[],
  sourceFields?: SourceFields,
): HistoryEntry[] {
  if (sourceFields)
    return sourceFields.map((field, index) => ({
      key: field.locator,
      label: `Source field ${index + 1} · ${field.role}`,
      value: field.text,
    }));
  const entries: HistoryEntry[] = [];
  for (const [sectionIndex, section] of data.sections.entries()) {
    entries.push({
      key: `${section.id}/heading`,
      label: `Section ${sectionIndex + 1} heading`,
      value: section.heading,
    });
    for (const [blockIndex, block] of section.blocks.entries())
      for (const field of block.fields)
        for (const [index, content] of field.contents.entries())
          entries.push({
            key: `${section.id}/${block.id}/${field.key}/${content.id}`,
            label: `${section.heading || "Contact / header"} · Block ${blockIndex + 1} · ${field.key} ${index + 1}`,
            value: contentValue(content, graph).wording,
          });
  }
  return entries;
}
export function historyJson(key: string, label: string, value: unknown): HistoryEntry {
  return { key, label, value: JSON.stringify(JSON.parse(canonicalJson(value)), null, 2) };
}
export function compareHistoryEntries(
  before: readonly HistoryEntry[],
  after: readonly HistoryEntry[],
) {
  const left = new Map(before.map((value, index) => [value.key, { ...value, index }])),
    right = new Map(after.map((value, index) => [value.key, { ...value, index }]));
  return [...new Set([...left.keys(), ...right.keys()])].map((key) => {
    const a = left.get(key),
      b = right.get(key);
    return {
      key,
      before: a ?? null,
      after: b ?? null,
      change: !a ? "Added" : !b ? "Removed" : a.value !== b.value ? "Changed" : "Unchanged",
      moved: !!a && !!b && a.index !== b.index,
    } as const;
  });
}
