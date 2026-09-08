import {
  ContentRecord,
  contentLinkHref,
  isCurrentBuiltInLayout,
  renderedScalarText,
  resolveContentLayout,
  resolveContentSchema,
  type SchemaBundle,
  type StructuredContent,
  scalarText,
  validateSchemaBundle,
  validateStructuredContent,
} from "@river/domain";
import { Schema } from "effect";
import { fixedPack, validateTemplate } from "./manifests";

export const COMPOSABLE_RENDERER_VERSION = "river-composable-v3";
/** The fragment grammar stays closed; values are always escaped before substitution. */
export function validateComposableLayouts(value: SchemaBundle) {
  const bundle = validateSchemaBundle(value);
  const baseline = fixedPack("classic").sections[0];
  if (!baseline) throw new Error("Built-in section template unavailable.");
  for (const layout of bundle.layouts) {
    const source = layout.source.replace(/\{\{[a-zA-Z][a-zA-Z0-9_.-]*\}\}/g, "");
    validateTemplate({ manifest: { ...baseline.manifest, slots: [] }, source });
  }
  return bundle;
}
function escaped(text: string) {
  const replacements: Record<string, string> = {
    "\\": "\\textbackslash{}",
    "{": "\\{",
    "}": "\\}",
    $: "\\$",
    "&": "\\&",
    "#": "\\#",
    "%": "\\%",
    _: "\\_",
    "~": "\\textasciitilde{}",
    "^": "\\textasciicircum{}",
  };
  return text
    .replace(/[\\{}$&#%_~^]/g, (char) => replacements[char] ?? char)
    .replace(/\r?\n/g, " ");
}
export function renderStructuredContent(input: StructuredContent): string {
  const content = validateStructuredContent(input);
  validateComposableLayouts(content);
  const render = (record: ContentRecord): string => {
    const definition = resolveContentSchema(content, record.schema);
    const layout = resolveContentLayout(content, record.layout);
    const current = isCurrentBuiltInLayout(layout);
    const values = new Map(
      definition.fields.map((field) => {
        const value = record.values[field.id];
        let output = "";
        if (value !== undefined && value !== null) {
          if (field.kind === "record")
            output = render(Schema.decodeUnknownSync(ContentRecord)(value));
          else if (field.kind === "records")
            output = Schema.decodeUnknownSync(Schema.Array(ContentRecord))(value)
              .map(render)
              .join(current ? (field.id === "links" ? " · " : "\n\\par\\smallskip\n") : "\n");
          else if (field.kind === "list") {
            const lines = Schema.decodeUnknownSync(Schema.Array(Schema.Json))(value)
              .map((item) => escaped(scalarText(item)))
              .filter(Boolean);
            output =
              (field.id === "accomplishments" || (current && field.id === "details")) &&
              lines.length
                ? `\\begin{itemize}\n${lines.map((line) => `\\item ${current ? "\\raggedright " : ""}${line}`).join("\n")}\n\\end{itemize}`
                : lines.join(current ? " · " : "\\par\n");
          } else output = escaped(renderedScalarText(record, field, layout));
        }
        if (current && output) {
          if (["endDate", "expirationDate"].includes(field.id)) output = ` ${output}`;
          if (
            definition.id === "contact-section" &&
            ["phone", "location", "links"].includes(field.id)
          ) {
            const earlier = definition.fields.slice(
              1,
              definition.fields.findIndex((item) => item.id === field.id),
            );
            if (earlier.some((item) => scalarText(record.values[item.id]))) output = ` · ${output}`;
          }
          if (layout.id.endsWith("-compact") && ["title", "degree", "issuer"].includes(field.id))
            output = `· ${output}`;
        }
        return [field.id, output];
      }),
    );
    if (current && definition.id === "contact-link") {
      const url = scalarText(record.values.url);
      const label = escaped(scalarText(record.values.label) || url);
      const href = contentLinkHref(url);
      if (!href) return label;
      values.set("url", escaped(href));
      values.set("label", label);
    }
    return layout.source.replace(
      /\{\{([a-zA-Z][a-zA-Z0-9_.-]*)\}\}/g,
      (_, id: string) => values.get(id) ?? "",
    );
  };
  return render(content.record);
}
