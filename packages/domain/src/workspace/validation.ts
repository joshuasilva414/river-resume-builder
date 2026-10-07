import {
  type ContentNode,
  type LayoutNode,
  resumeSchema,
  type VisualTemplate,
  visualTemplateSchema,
} from "./model";

/** Validate references and bounded nesting once at the persistence boundary. */
export function parseTemplate(input: unknown): VisualTemplate {
  const template = visualTemplateSchema.parse(input);
  const definitions = new Map(
    template.definitions.map((definition) => [definition.id, definition]),
  );
  if (definitions.size !== template.definitions.length)
    throw new Error("Entry definition IDs must be unique.");
  const allIds = new Set<string>();
  const unique = (id: string) => {
    if (allIds.has(id)) throw new Error(`Duplicate template identity: ${id}`);
    allIds.add(id);
  };
  for (const definition of template.definitions) {
    unique(definition.id);
    const keys = new Set<string>();
    for (const field of definition.fields) {
      unique(field.id);
      if (keys.has(field.key)) throw new Error("Field keys must be unique within an entry.");
      keys.add(field.key);
      if (field.type === "group" && (!field.definitionId || !definitions.has(field.definitionId)))
        throw new Error("A group needs an entry definition.");
      if (field.type !== "group" && field.definitionId)
        throw new Error("Only groups have entry definitions.");
    }
    const placed = new Set<string>();
    const visit = (node: LayoutNode, depth: number) => {
      unique(node.id);
      if (depth > 12) throw new Error("Layouts support up to twelve nested containers.");
      if ("children" in node) for (const child of node.children) visit(child, depth + 1);
      if (node.kind === "field") {
        if (!keys.has(node.fieldKey) || placed.has(node.fieldKey))
          throw new Error("Each field must have one valid layout binding.");
        placed.add(node.fieldKey);
      }
      if (node.kind === "literal" && node.whenField && !keys.has(node.whenField))
        throw new Error("A label refers to an unknown field.");
    };
    visit(definition.layout, 0);
    if (keys.size !== placed.size) throw new Error("Place every field in the layout.");
  }
  const acyclic = (id: string, path: string[]) => {
    if (path.includes(id) || path.length > 8)
      throw new Error("Entry definitions must not contain cycles or exceed eight levels.");
    for (const field of definitions.get(id)?.fields ?? [])
      if (field.definitionId) acyclic(field.definitionId, [...path, id]);
  };
  for (const definition of template.definitions) acyclic(definition.id, []);
  const sectionKeys = new Set<string>();
  for (const section of template.sections) {
    unique(section.id);
    if (!definitions.has(section.definitionId) || sectionKeys.has(section.key))
      throw new Error("Invalid section binding.");
    sectionKeys.add(section.key);
  }
  return template;
}
export function assertContent(nodes: ContentNode[]) {
  const ids = new Set<string>();
  let count = 0;
  const visit = (node: ContentNode, depth: number) => {
    if (depth > 8 || ++count > 10000 || ids.has(node.id))
      throw new Error("Content has duplicate IDs or excessive nesting.");
    ids.add(node.id);
    if (node.kind === "group") for (const child of node.children) visit(child, depth + 1);
  };
  for (const node of nodes) visit(node, 0);
}
export function parseResume(input: unknown) {
  const resume = resumeSchema.parse(input);
  parseTemplate(resume.template.document);
  assertContent([...resume.sections, ...resume.unused]);
  const definitions = new Map(resume.template.document.definitions.map((item) => [item.id, item]));
  const bind = (node: ContentNode, definitionId: string) => {
    const definition = definitions.get(definitionId);
    if (node.kind !== "group" || node.definitionId !== definitionId || !definition)
      throw new Error("Content groups must use their captured entry definition.");
    const seen = new Set<string>();
    for (const child of node.children) {
      const field = definition.fields.find((field) => field.key === child.key);
      if (!field || (!field.repeat && seen.has(child.key)))
        throw new Error("Unmatched or excess values must be retained as unused content.");
      seen.add(child.key);
      if (field.type === "group" && field.definitionId) bind(child, field.definitionId);
      else if (child.kind !== "field" || child.value.kind !== field.type)
        throw new Error("A field value must match its template type.");
    }
  };
  const sections = new Set<string>();
  for (const node of resume.sections) {
    const section = resume.template.document.sections.find((section) => section.key === node.key);
    if (!section || sections.has(node.key))
      throw new Error("Each résumé section needs one captured template binding.");
    sections.add(node.key);
    bind(node, section.definitionId);
  }
  return resume;
}
