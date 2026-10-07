import {
  blankValue,
  type CandidateFact,
  type ContentGroup,
  type ContentNode,
  type EntryDefinition,
  newIdentity,
  type Resume,
  type VisualTemplate,
} from "./model";

export function blankGroup(
  template: VisualTemplate,
  definitionId: string,
  key: string,
  label?: string,
): ContentGroup {
  const definition = template.definitions.find((item) => item.id === definitionId);
  if (!definition) throw new Error("Unknown entry definition.");
  const children = definition.fields.flatMap((field): ContentNode[] => {
    if (field.repeat) return [];
    if (field.type === "group")
      return field.definitionId
        ? [blankGroup(template, field.definitionId, field.key, field.label)]
        : [];
    return [
      {
        kind: "field",
        id: newIdentity(),
        key: field.key,
        label: field.label,
        factIds: [],
        value: blankValue(field.type),
      },
    ];
  });
  return {
    kind: "group",
    id: newIdentity(),
    key,
    label: label ?? definition.label,
    definitionId,
    children,
  };
}
export function blankResume(
  template: VisualTemplate,
  templateId: string,
  revision: number,
  name = "Untitled résumé",
): Resume {
  return {
    version: 1,
    name,
    template: { id: templateId, revision, document: structuredClone(template) },
    job: null,
    unused: [],
    sections: template.sections.map((section) =>
      blankGroup(template, section.definitionId, section.key, section.label),
    ),
  };
}
export function cloneContent(node: ContentNode): ContentNode {
  return node.kind === "field"
    ? { ...structuredClone(node), id: newIdentity() }
    : { ...structuredClone(node), id: newIdentity(), children: node.children.map(cloneContent) };
}
export function contentFromFacts(facts: CandidateFact[], label: string): ContentGroup {
  return {
    kind: "group",
    id: newIdentity(),
    key: "facts",
    label,
    definitionId: null,
    children: facts.map((fact) => ({
      kind: "field",
      id: newIdentity(),
      key: fact.key,
      label: fact.label,
      value: structuredClone(fact.value),
      factIds: [fact.id],
    })),
  };
}
export function findContent(nodes: ContentNode[], id: string): ContentNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.kind === "group") {
      const found = findContent(node.children, id);
      if (found) return found;
    }
  }
}
export function mapContent(
  nodes: ContentNode[],
  id: string,
  update: (node: ContentNode) => ContentNode | null,
): ContentNode[] {
  return nodes.flatMap((node) => {
    if (node.id === id) {
      const next = update(node);
      return next ? [next] : [];
    }
    return [
      node.kind === "group" ? { ...node, children: mapContent(node.children, id, update) } : node,
    ];
  });
}
export function moveSibling(
  nodes: ContentNode[],
  sourceId: string,
  targetId: string,
  after = false,
): ContentNode[] {
  const source = nodes.find((item) => item.id === sourceId);
  const target = nodes.find((item) => item.id === targetId);
  if (source) {
    // Collection boundaries and primitive types cannot be crossed by a drag gesture.
    if (
      !target ||
      source === target ||
      (source.key !== target.key &&
        !(
          source.kind === "group" &&
          target.kind === "group" &&
          source.definitionId !== target.definitionId
        ))
    )
      return nodes;
    const next = nodes.filter((item) => item.id !== sourceId);
    next.splice(next.findIndex((item) => item.id === targetId) + Number(after), 0, source);
    return next;
  }
  return nodes.map((node) =>
    node.kind === "group"
      ? { ...node, children: moveSibling(node.children, sourceId, targetId, after) }
      : node,
  );
}
export type FieldMapping = Record<string, string>;
/** Match semantic keys and types. Unmatched values are returned intact for user mapping or retention. */
export function mapIntoDefinition(
  nodes: ContentNode[],
  definition: EntryDefinition,
  mapping: FieldMapping = {},
) {
  const accepted: ContentNode[] = [],
    unused: ContentNode[] = [];
  for (const node of nodes) {
    const key = mapping[node.id] ?? node.key;
    const field = definition.fields.find(
      (field) =>
        field.key === key &&
        (node.kind === "group" ? field.type === "group" : field.type === node.value.kind),
    );
    if (!field || (!field.repeat && accepted.some((item) => item.key === key))) {
      unused.push(structuredClone(node));
      continue;
    }
    accepted.push({ ...structuredClone(node), key, label: field.label });
  }
  return { accepted, unused };
}
