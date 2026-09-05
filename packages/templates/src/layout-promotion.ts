import { Schema } from "effect";
import { StyleTokens } from "./manifests";
import { validateRefinedSource } from "./refinement";

export const LayoutAdjustment = Schema.Union([
  Schema.Struct({
    property: Schema.Literal("font"),
    before: StyleTokens.fields.font,
    after: StyleTokens.fields.font,
  }),
  Schema.Struct({
    property: Schema.Literal("bodySize"),
    before: StyleTokens.fields.bodySize,
    after: StyleTokens.fields.bodySize,
  }),
  Schema.Struct({
    property: Schema.Literal("sectionSpacing"),
    before: StyleTokens.fields.sectionSpacing,
    after: StyleTokens.fields.sectionSpacing,
  }),
  Schema.Struct({
    property: Schema.Literal("margin"),
    before: StyleTokens.fields.margin,
    after: StyleTokens.fields.margin,
  }),
  Schema.Struct({
    property: Schema.Literal("paragraphSpacing"),
    before: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 12 })),
    after: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 12 })),
  }),
]);
export type LayoutAdjustment = typeof LayoutAdjustment.Type;

const rules = [
  { property: "font", pattern: /^\\setmainfont\{(Latin Modern Roman|Latin Modern Sans)\}$/gm },
  { property: "bodySize", pattern: /^\\documentclass\[([0-9]+)pt,letterpaper\]\{article\}$/gm },
  { property: "margin", pattern: /^\\usepackage\[margin=([0-9]+(?:\.[0-9]+)?)in\]\{geometry\}$/gm },
  {
    property: "paragraphSpacing",
    pattern: /^\\setlength\{\\parskip\}\{([0-9]+(?:\.[0-9]+)?)pt\}$/gm,
  },
  {
    property: "sectionSpacing",
    pattern: /^\\titlespacing\*\{\\section\}\{0pt\}\{ *([0-9]+)pt *\}\{4pt\}$/gm,
  },
] as const;

/** Only exact, unique preamble commands become bounded values. Every other source byte must match. */
export function isolateLayoutAdjustment(before: string, after: string) {
  const unavailable = { state: "Unavailable" as const, changes: [] as readonly LayoutAdjustment[] };
  try {
    validateRefinedSource(before);
    validateRefinedSource(after);
    const split = (source: string) => {
      const index = source.indexOf("\\begin{document}");
      return { preamble: source.slice(0, index), body: source.slice(index) };
    };
    const left = split(before),
      right = split(after);
    if (left.body !== right.body) return unavailable;
    let normalizedBefore = left.preamble,
      normalizedAfter = right.preamble;
    const changes: LayoutAdjustment[] = [];
    for (const rule of rules) {
      const a = [...left.preamble.matchAll(rule.pattern)],
        b = [...right.preamble.matchAll(rule.pattern)];
      if (a.length !== 1 || b.length !== 1 || !a[0]?.[1] || !b[0]?.[1]) return unavailable;
      const change = Schema.decodeUnknownSync(LayoutAdjustment)({
        property: rule.property,
        before: rule.property === "font" ? a[0][1] : Number(a[0][1]),
        after: rule.property === "font" ? b[0][1] : Number(b[0][1]),
      });
      if (change.before !== change.after) changes.push(change);
      normalizedBefore = normalizedBefore.replace(
        rule.pattern,
        `__river_layout_${rule.property}__`,
      );
      normalizedAfter = normalizedAfter.replace(rule.pattern, `__river_layout_${rule.property}__`);
    }
    if (normalizedBefore !== normalizedAfter) return unavailable;
    return { state: changes.length ? ("Isolated" as const) : ("Unchanged" as const), changes };
  } catch {
    return unavailable;
  }
}
