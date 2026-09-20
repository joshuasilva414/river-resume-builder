import {
  type ContentNode,
  type DateValue,
  type FieldValue,
  type LayoutNode,
  populated,
  type Resume,
  type RichText,
  type TemplateField,
  type VisualStyle,
} from "./model";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export function formatDate(date: DateValue, format: TemplateField["dateFormat"] = "short"): string {
  if (date.precision === "present") return "Present";
  if (date.precision === "year") return String(date.year);
  const month =
    format === "numeric"
      ? String(date.month).padStart(2, "0")
      : format === "long"
        ? months[date.month - 1]
        : months[date.month - 1]?.slice(0, 3);
  if (format === "numeric")
    return `${date.year}-${month}${date.precision === "day" ? `-${String(date.day).padStart(2, "0")}` : ""}`;
  return `${month}${date.precision === "day" ? ` ${date.day},` : ""} ${date.year}`;
}
export function valueSpans(value: FieldValue, dateFormat?: TemplateField["dateFormat"]): RichText {
  if (value.value === null) return [];
  switch (value.kind) {
    case "text":
    case "bullet":
      return value.value;
    case "date":
      return [{ text: formatDate(value.value, dateFormat) }];
    case "number":
      return [{ text: String(value.value) }];
    case "boolean":
      return [{ text: value.value ? "Yes" : "No" }];
    case "skill":
      return [{ text: value.value }];
    case "link":
      return [{ text: value.value.label || value.value.href, href: value.value.href }];
  }
}
export type ResolvedNode = {
  id: string;
  layoutId: string;
  definitionId: string;
  contentId?: string;
  fieldKey?: string;
  style: VisualStyle;
  kind: "row" | "column" | "text";
  spans: RichText;
  children: ResolvedNode[];
  bullet?: boolean;
  placeholder?: string;
};
export type ResolvedDocument = {
  page: Resume["template"]["document"]["page"];
  style: VisualStyle;
  children: ResolvedNode[];
  expectedText: string[];
  warnings: string[];
};
const printable = (node: ResolvedNode): boolean =>
  node.kind === "text"
    ? node.spans.some((span) => span.text.length > 0)
    : node.children.some(printable);
/** This is the single authority for printable content and reading order. Editor placeholders never print. */
export function resolveDocument(resume: Resume, placeholders = false): ResolvedDocument {
  const template = resume.template.document;
  const definitions = new Map(
    template.definitions.map((definition) => [definition.id, definition]),
  );
  const warnings: string[] = [];
  const resolveGroup = (
    group: ContentNode,
    definitionId: string,
    depth: number,
  ): ResolvedNode | null => {
    const definition = definitions.get(definitionId);
    if (!definition || group.kind !== "group" || depth > 8) return null;
    const resolve = (node: LayoutNode): ResolvedNode | null => {
      const base = {
        id: `${group.id}:${node.id}`,
        layoutId: node.id,
        definitionId,
        style: node.style,
        spans: [],
        children: [],
      };
      if ("children" in node) {
        let children = node.children.flatMap((child) => {
          const result = resolve(child);
          return result ? [result] : [];
        });
        if (node.kind === "row" && node.separator && children.length > 1) {
          let populatedBefore = false;
          children = children.flatMap((child, i) => {
            const include = printable(child),
              separate = include && populatedBefore;
            populatedBefore ||= include;
            return separate
              ? [
                  {
                    ...base,
                    id: `${base.id}:separator:${i}`,
                    kind: "text" as const,
                    spans: [{ text: node.separator ?? "" }],
                    style: { grow: 0 },
                  },
                  child,
                ]
              : [child];
          });
        }
        return children.length || placeholders
          ? { ...base, kind: node.kind, children, contentId: group.id }
          : null;
      }
      if (node.kind === "literal") {
        const visible =
          !node.whenField ||
          group.children.some(
            (child) => child.key === node.whenField && hasPopulatedContent(child),
          );
        return visible && node.text
          ? { ...base, kind: "text", spans: [{ text: node.text }] }
          : null;
      }
      const field = definition.fields.find((field) => field.key === node.fieldKey);
      if (!field) return null;
      const values = group.children.filter((child) => child.key === field.key);
      if (field.required && !values.some(hasPopulatedContent))
        warnings.push(`${definition.label}: ${field.label} is empty.`);
      if (field.type === "group") {
        const children = values.flatMap((value) => {
          const child = field.definitionId && resolveGroup(value, field.definitionId, depth + 1);
          return child ? [child] : [];
        });
        return children.length || placeholders
          ? { ...base, kind: "column", fieldKey: field.key, contentId: group.id, children }
          : null;
      }
      const children: ResolvedNode[] = values.flatMap((child) => {
        if (child.kind !== "field") return [];
        if (child.value.kind !== field.type) {
          warnings.push(
            `${field.label}: an incompatible value was preserved but cannot be printed.`,
          );
          return [];
        }
        if (!populated(child.value) && !placeholders) return [];
        const spans = populated(child.value)
          ? [
              ...(field.prefix ? [{ text: field.prefix }] : []),
              ...valueSpans(child.value, field.dateFormat),
              ...(field.suffix ? [{ text: field.suffix }] : []),
            ]
          : [];
        return [
          {
            ...base,
            id: `${base.id}:${child.id}`,
            kind: "text",
            fieldKey: field.key,
            contentId: child.id,
            spans,
            bullet: field.type === "bullet",
            placeholder: field.label,
          },
        ];
      });
      if (!field.repeat)
        return (
          children[0] ??
          (placeholders
            ? {
                ...base,
                kind: "text",
                fieldKey: field.key,
                contentId: group.id,
                placeholder: field.label,
              }
            : null)
        );
      let populatedBefore = false;
      const spaced = field.separator
        ? children.flatMap((child, i) => {
            const include = printable(child),
              separate = include && populatedBefore;
            populatedBefore ||= include;
            return separate
              ? [
                  {
                    ...base,
                    id: `${base.id}:item-separator:${i}`,
                    kind: "text" as const,
                    style: { grow: 0 },
                    spans: [{ text: field.separator ?? "" }],
                  },
                  child,
                ]
              : [child];
          })
        : children;
      return spaced.length || placeholders
        ? {
            ...base,
            kind: field.type === "skill" || field.separator ? "row" : "column",
            fieldKey: field.key,
            contentId: group.id,
            children: spaced,
          }
        : null;
    };
    return resolve(definition.layout);
  };
  const children = resume.sections.flatMap((section) => {
    const binding = template.sections.find((item) => item.key === section.key);
    const resolved = binding && resolveGroup(section, binding.definitionId, 0);
    if (!binding) warnings.push(`${section.label} is retained without a template binding.`);
    return resolved ? [resolved] : [];
  });
  const texts = (node: ResolvedNode): string[] =>
    node.kind === "text"
      ? [(node.bullet ? "• " : "") + node.spans.map((span) => span.text).join("")].filter(Boolean)
      : node.children.flatMap(texts);
  return {
    page: template.page,
    style: template.style,
    children,
    expectedText: children.flatMap(texts),
    warnings,
  };
}
/** Compare normalized streams, preserving order and repetitions. No silent truncation allowance. */
export function validateRenderedText(expected: string[], actual: string) {
  const normalize = (value: string) => value.normalize("NFKC").replace(/[\s\u00ad]/gu, "");
  const wanted = normalize(expected.join(""));
  const received = normalize(actual);
  return { ok: wanted === received, expectedLength: wanted.length, actualLength: received.length };
}

function hasPopulatedContent(node: ContentNode): boolean {
  return node.kind === "field" ? populated(node.value) : node.children.some(hasPopulatedContent);
}
