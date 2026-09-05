import { ContentType, canonicalJson, RecordId, Revision, Theme } from "@river/domain";
import { Schema } from "effect";
import { TEMPLATE_FIXTURE_VERSION, templateFixtures } from "./fixtures";
import { graphTemplates, type TemplateGraph, validateGraph } from "./graph";
import type { LayoutAdjustment } from "./layout-promotion";
import { StyleTokens, type TemplateManifest, type TemplateRevision } from "./manifests";

export const TemplateScope = Schema.Union([
  Schema.Struct({ level: Schema.Literal("document"), type: Schema.Null }),
  Schema.Struct({
    level: Schema.Literal("section"),
    type: Schema.Literals(["summary", "experience", "project", "education", "skill", "credential"]),
  }),
  Schema.Struct({ level: Schema.Literal("block"), type: ContentType }),
]);
export type TemplateScope = typeof TemplateScope.Type;
export const TemplateBase = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("fixed"), theme: Theme }),
  Schema.Struct({ kind: Schema.Literal("saved"), revisionId: RecordId }),
]);
export type TemplateBase = typeof TemplateBase.Type;
export const TemplateOverrides = Schema.Struct({
  font: Schema.optional(StyleTokens.fields.font),
  bodySize: Schema.optional(StyleTokens.fields.bodySize),
  sectionSpacing: Schema.optional(StyleTokens.fields.sectionSpacing),
  margin: Schema.optional(StyleTokens.fields.margin),
});
export const TemplateBrief = Schema.Struct({
  structure: Schema.Literal("Single column"),
  density: Schema.Literals(["Compact", "Comfortable", "Open"]),
  character: Schema.NonEmptyString.check(Schema.isMaxLength(2000)),
  constraints: Schema.String.check(Schema.isMaxLength(4000)),
});
export type TemplateBrief = typeof TemplateBrief.Type;
export const TemplateLifecycle = Schema.Literals(["Draft", "Validated", "Approved", "Retired"]);
export type TemplateLifecycle = typeof TemplateLifecycle.Type;
export interface TemplateOrigin {
  readonly base: TemplateBase;
  readonly scope: TemplateScope;
  readonly componentIdentity: string;
}
export const TemplateAiProfile = Schema.Struct({
  model: Schema.NonEmptyString,
  contract: Schema.Literals([
    "river-template-generation-v1",
    "river-template-generation-v2",
    "river-template-generation-v3",
  ]),
  maxInputCharacters: Schema.Literal(160000),
  maxOutputTokens: Schema.Literal(12000),
  timeoutMs: Schema.Literal(60000),
});
export type TemplateAiProfile = typeof TemplateAiProfile.Type;
export interface TemplateAiInput {
  readonly type: "template-generation";
  readonly scope: TemplateScope;
  readonly brief: TemplateBrief;
  readonly layoutAdjustment?: readonly LayoutAdjustment[];
  readonly conversation?: {
    readonly id: string;
    readonly turn: number;
    readonly instruction: string;
    readonly priorInstructions: readonly {
      readonly taskId: string;
      readonly instruction: string;
    }[];
  };
  readonly baseGraph: TemplateGraph;
  readonly destination: {
    readonly id: string;
    readonly revision: number;
    readonly manifestRevision: number;
  };
  readonly fixtureSet: {
    readonly version: typeof TEMPLATE_FIXTURE_VERSION;
    readonly digest: string;
    readonly fixtures: typeof templateFixtures;
  };
}
export const TemplateAiOutput = Schema.Struct({
  source: Schema.NonEmptyString.check(Schema.isMaxLength(32768)),
  overrides: Schema.Struct({
    font: Schema.NullOr(StyleTokens.fields.font),
    bodySize: Schema.NullOr(StyleTokens.fields.bodySize),
    sectionSpacing: Schema.NullOr(StyleTokens.fields.sectionSpacing),
    margin: Schema.NullOr(StyleTokens.fields.margin),
  }),
  explanation: Schema.NonEmptyString.check(Schema.isMaxLength(4000)),
});
export type TemplateAiOutput = typeof TemplateAiOutput.Type;
export interface TemplateCandidate {
  readonly graph: TemplateGraph;
  readonly explanation: string;
}

export function scopedTemplate(graph: TemplateGraph, scope: TemplateScope): TemplateRevision {
  const template = graphTemplates(graph).find(
    (item) =>
      item.manifest.level === scope.level &&
      (scope.type === null || item.manifest.contentTypes.includes(scope.type)),
  );
  if (!template) throw new Error("The requested template component is unavailable.");
  return template;
}
export function replaceTemplate(
  graph: TemplateGraph,
  scope: TemplateScope,
  replacement: TemplateRevision,
): TemplateGraph {
  const selected = scopedTemplate(graph, scope);
  return validateGraph({
    ...graph,
    document: scope.level === "document" ? replacement : graph.document,
    sections: graph.sections.map((item) => (item === selected ? replacement : item)),
    blocks: graph.blocks.map((item) => (item === selected ? replacement : item)),
  });
}
export function editedGraph(
  graph: TemplateGraph,
  scope: TemplateScope,
  id: string,
  revision: number,
  source: string,
  overrides: TemplateManifest["overrides"],
) {
  Schema.decodeUnknownSync(RecordId)(id);
  Schema.decodeUnknownSync(Revision)(revision);
  const current = scopedTemplate(graph, scope);
  return replaceTemplate(graph, scope, {
    source,
    manifest: { ...current.manifest, id, revision, overrides },
  });
}
export function templateCandidate(input: TemplateAiInput, output: unknown): TemplateCandidate {
  const candidate = Schema.decodeUnknownSync(TemplateAiOutput)(output),
    values = candidate.overrides;
  if (!candidate.explanation.trim()) throw new Error("Explain the proposed template change.");
  const overrides = {
    ...(values.font === null ? {} : { font: values.font }),
    ...(values.bodySize === null ? {} : { bodySize: values.bodySize }),
    ...(values.sectionSpacing === null ? {} : { sectionSpacing: values.sectionSpacing }),
    ...(values.margin === null ? {} : { margin: values.margin }),
  };
  return {
    graph: editedGraph(
      input.baseGraph,
      input.scope,
      input.destination.id,
      input.destination.manifestRevision,
      candidate.source,
      overrides,
    ),
    explanation: candidate.explanation,
  };
}
export const fixtureSetPayload = () =>
  canonicalJson({ version: TEMPLATE_FIXTURE_VERSION, fixtures: templateFixtures });
