import { blankGroup, type FieldMapping, mapIntoDefinition } from "./content";
import type { ContentGroup, ContentNode, Resume, VisualTemplate } from "./model";

export function bindGroup(
  group: ContentGroup,
  template: VisualTemplate,
  definitionId: string,
  mapping: FieldMapping = {},
) {
  const definition = template.definitions.find((item) => item.id === definitionId);
  if (!definition) throw Error("Choose an available entry definition.");
  const { accepted, unused } = mapIntoDefinition(group.children, definition, mapping);
  const children: ContentNode[] = accepted.map((node) => {
    if (node.kind !== "group") return node;
    const field = definition.fields.find((item) => item.key === node.key);
    if (!field?.definitionId) return node;
    const nested = bindGroup(node, template, field.definitionId, mapping);
    unused.push(...nested.unused);
    return nested.group;
  });
  // Preserve incomplete fields as placeholders, while collections remain user-sized.
  const empty = blankGroup(template, definitionId, group.key);
  for (const field of definition.fields)
    if (!field.repeat && !children.some((node) => node.key === field.key)) {
      const placeholder = empty.children.find((node) => node.key === field.key);
      if (placeholder) children.push(placeholder);
    }
  return { group: { ...group, definitionId, children }, unused };
}
/** Capturing a new layout retains values, entry counts, and every unmatched value. */
export function applyTemplate(
  resume: Resume,
  captured: Resume["template"],
  mapping: FieldMapping = {},
): Resume {
  const template = captured.document,
    sections: ContentNode[] = [],
    unused: ContentNode[] = [...resume.unused];
  for (const node of resume.sections) {
    const targetKey = mapping[node.id] ?? node.key;
    const target = template.sections.find((section) => section.key === targetKey);
    if (!target || node.kind !== "group" || sections.some((section) => section.key === targetKey)) {
      unused.push(node);
      continue;
    }
    const bound = bindGroup(node, template, target.definitionId, mapping);
    sections.push({ ...bound.group, key: target.key, label: target.label });
    unused.push(...bound.unused);
  }
  for (const section of template.sections)
    if (!sections.some((node) => node.key === section.key))
      sections.push(blankGroup(template, section.definitionId, section.key, section.label));
  return { ...resume, template: structuredClone(captured), sections, unused };
}
