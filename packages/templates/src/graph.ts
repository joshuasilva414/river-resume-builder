import { canonicalJson, contentTypes, SchemaBundle, Theme } from "@river/domain";
import { Schema } from "effect";
import { validateComposableLayouts } from "./composable";
import { fixedPack, StyleTokens, TemplateRevision, validateTemplate } from "./manifests";

export const CUSTOM_RENDERER_VERSION = "river-tectonic-0.3.0";
export const GRAPH_VALIDATOR_VERSION = "river-template-graph-v1";
export const MAX_GRAPH_CHARACTERS = 60000;
export const TemplateGraph = Schema.Struct({
  composition: Schema.optional(SchemaBundle),
  theme: Theme,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  tokens: StyleTokens,
  document: TemplateRevision,
  sections: Schema.Array(TemplateRevision).check(Schema.isLengthBetween(6, 6)),
  blocks: Schema.Array(TemplateRevision).check(Schema.isLengthBetween(7, 7)),
});
export type TemplateGraph = typeof TemplateGraph.Type;
export const graphTemplates = (graph: TemplateGraph) => [
  graph.document,
  ...graph.sections,
  ...graph.blocks,
];

/** Check the entire declared graph, including every required renderer binding, before compilation. */
export function validateGraph(value: unknown): TemplateGraph {
  const graph = Schema.decodeUnknownSync(TemplateGraph)(value);
  if (graph.composition) validateComposableLayouts(graph.composition);
  if (canonicalJson(graph).length > MAX_GRAPH_CHARACTERS)
    throw new Error(`Template graph exceeds ${MAX_GRAPH_CHARACTERS.toLocaleString()} characters.`);
  const identities = new Set<string>();
  for (const component of graphTemplates(graph)) {
    validateTemplate(component);
    const key = `${component.manifest.id}@${component.manifest.revision}`;
    if (identities.has(key))
      throw new Error("A component identity occurs more than once in the graph.");
    identities.add(key);
    if (
      component.manifest.level !== "document" &&
      component.manifest.overrides.margin !== undefined
    )
      throw new Error("Page margins belong to the Document template.");
    if (
      component.manifest.level === "block" &&
      component.manifest.overrides.sectionSpacing !== undefined
    )
      throw new Error("Section spacing belongs to Document and Section templates.");
    const effective = {
      ...graph.tokens,
      ...graph.document.manifest.overrides,
      ...component.manifest.overrides,
    };
    Schema.decodeUnknownSync(StyleTokens)(effective);
    if (new Set(component.manifest.inherits).size !== component.manifest.inherits.length)
      throw new Error("Duplicate inherited style token.");
    for (const slot of component.manifest.slots)
      if (
        slot.kind === "style" &&
        !component.manifest.inherits.includes(slot.token) &&
        component.manifest.overrides[slot.token] === undefined
      )
        throw new Error(`Style token ${slot.token} is neither inherited nor provided.`);
    if (!component.manifest.assets.includes("fonts-lmodern@2.005-1"))
      throw new Error("The component must declare its pinned font resource.");
  }
  const baseline = fixedPack(graph.theme);
  const checkBindings = (component: TemplateRevision, expected: TemplateRevision) => {
    if (component.manifest.level !== expected.manifest.level)
      throw new Error("Component level does not match its graph position.");
    const sortedTypes = (template: TemplateRevision) => [...template.manifest.contentTypes].sort();
    if (canonicalJson(sortedTypes(component)) !== canonicalJson(sortedTypes(expected)))
      throw new Error("Each graph position requires its exact declared content types.");
    if (component.manifest.styleContract !== graph.document.manifest.styleContract)
      throw new Error("Incompatible inherited style contract.");
    if (component.manifest.level === "document") {
      const styles = component.manifest.slots
        .filter((slot) => slot.kind === "style")
        .sort((a, b) => a.name.localeCompare(b.name));
      const expectedStyles = expected.manifest.slots
        .filter((slot) => slot.kind === "style")
        .sort((a, b) => a.name.localeCompare(b.name));
      if (canonicalJson(styles) !== canonicalJson(expectedStyles))
        throw new Error("Document templates must preserve the four typed style slots.");
    }
    const nonStyle = (template: TemplateRevision) =>
      template.manifest.slots
        .filter((slot) => slot.kind !== "style")
        .map((slot) =>
          slot.kind === "children" ? { ...slot, types: [...slot.types].sort() } : slot,
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    if (canonicalJson(nonStyle(component)) !== canonicalJson(nonStyle(expected)))
      throw new Error(
        "Typed scalar and child-output slots do not match the required renderer bindings.",
      );
    for (const slot of component.manifest.slots.filter((slot) => slot.kind !== "style")) {
      const occurrences = [...component.source.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].filter(
        (match) => match[1] === slot.name,
      ).length;
      if (occurrences !== 1) throw new Error(`Required slot ${slot.name} must occur exactly once.`);
    }
  };
  checkBindings(graph.document, baseline.document);
  for (const type of contentTypes) {
    const block = graph.blocks.filter((item) => item.manifest.contentTypes.includes(type));
    const expectedBlock = baseline.blocks.find((item) => item.manifest.contentTypes.includes(type));
    if (block.length !== 1 || !block[0] || !expectedBlock)
      throw new Error(`The graph needs exactly one ${type} Block.`);
    checkBindings(block[0], expectedBlock);
    if (type === "contact") continue;
    const section = graph.sections.filter((item) => item.manifest.contentTypes.includes(type));
    const expectedSection = baseline.sections.find((item) =>
      item.manifest.contentTypes.includes(type),
    );
    if (section.length !== 1 || !section[0] || !expectedSection)
      throw new Error(`The graph needs exactly one ${type} Section.`);
    checkBindings(section[0], expectedSection);
  }
  return graph;
}

export function graphInventory(value: TemplateGraph) {
  const graph = validateGraph(value);
  return {
    theme: graph.theme,
    renderer: CUSTOM_RENDERER_VERSION,
    validator: GRAPH_VALIDATOR_VERSION,
    revision: graph.revision,
    ...(graph.composition
      ? { composition: graph.composition, compositionRenderer: "river-composable-v2" }
      : {}),
    tokens: graph.tokens,
    templates: graphTemplates(graph).map((item) => ({
      id: item.manifest.id,
      revision: item.manifest.revision,
      identity: canonicalJson(item),
    })),
  };
}
