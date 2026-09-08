import { ContentType, canonicalJson, contentTypes, type Theme } from "@river/domain";
import { Schema } from "effect";
import { templateInventory as legacyInventory, fixedPack as legacyPack } from "./manifests-v1";

export const RENDERER_VERSION = "river-tectonic-0.4.0";

export const StyleTokens = Schema.Struct({
  font: Schema.Literals(["Latin Modern Roman", "Latin Modern Sans"]),
  bodySize: Schema.Int.check(Schema.isBetween({ minimum: 9, maximum: 12 })),
  sectionSpacing: Schema.Int.check(Schema.isBetween({ minimum: 4, maximum: 20 })),
  margin: Schema.Number.check(Schema.isBetween({ minimum: 0.5, maximum: 1 })),
});
export type StyleTokens = typeof StyleTokens.Type;
const Token = Schema.Literals(["font", "bodySize", "sectionSpacing", "margin"]);
const SlotName = Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9]*$/));
const Slot = Schema.Union([
  Schema.Struct({ name: SlotName, kind: Schema.Literal("text") }),
  Schema.Struct({
    name: SlotName,
    kind: Schema.Literal("text-list"),
    layout: Schema.Literals(["paragraphs", "bullets"]),
  }),
  Schema.Struct({ name: SlotName, kind: Schema.Literal("style"), token: Token }),
  Schema.Struct({
    name: SlotName,
    kind: Schema.Literal("children"),
    level: Schema.Literals(["section", "block"]),
    types: Schema.Array(ContentType),
  }),
]);
export const TemplateManifest = Schema.Struct({
  id: Schema.NonEmptyString,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  level: Schema.Literals(["document", "section", "block"]),
  contentTypes: Schema.Array(ContentType),
  styleContract: Schema.Literal("river-v1"),
  inherits: Schema.Array(Token),
  overrides: Schema.Struct({
    font: Schema.optional(StyleTokens.fields.font),
    bodySize: Schema.optional(StyleTokens.fields.bodySize),
    sectionSpacing: Schema.optional(StyleTokens.fields.sectionSpacing),
    margin: Schema.optional(StyleTokens.fields.margin),
  }),
  assets: Schema.Array(Schema.Literal("fonts-lmodern@2.005-1")),
  slots: Schema.Array(Slot),
  validation: Schema.Literal("river-fragments-v1"),
});
export type TemplateManifest = typeof TemplateManifest.Type;
export function effectiveStyles(inherited: StyleTokens, manifest: TemplateManifest): StyleTokens {
  return Schema.decodeUnknownSync(StyleTokens)({ ...inherited, ...manifest.overrides });
}
export const TemplateRevision = Schema.Struct({
  manifest: TemplateManifest,
  source: Schema.NonEmptyString.check(Schema.isMaxLength(32768)),
});
export type TemplateRevision = typeof TemplateRevision.Type;

export const packs = {
  classic: {
    id: "classic",
    revision: 1,
    font: "Latin Modern Roman",
    bodySize: 10,
    sectionSpacing: 9,
    margin: 0.65,
  },
  minimal: {
    id: "minimal",
    revision: 1,
    font: "Latin Modern Sans",
    bodySize: 10,
    sectionSpacing: 11,
    margin: 0.7,
  },
  technical: {
    id: "technical",
    revision: 1,
    font: "Latin Modern Sans",
    bodySize: 10,
    sectionSpacing: 8,
    margin: 0.6,
  },
} as const satisfies Record<Theme, StyleTokens & { id: Theme; revision: 1 }>;

const allowedCommands = new Set([
  "documentclass",
  "usepackage",
  "setmainfont",
  "pagestyle",
  "setlength",
  "parindent",
  "parskip",
  "setlist",
  "titleformat",
  "section",
  "large",
  "bfseries",
  "titlespacing",
  "hyphenpenalty",
  "exhyphenpenalty",
  "clubpenalty",
  "widowpenalty",
  "begin",
  "end",
  "LARGE",
  "par",
  "textbf",
  "textit",
  "small",
  "hfill",
  "textwidth",
  "nopagebreak",
  "smallskip",
  "textbullet",
  "href",
  "linewidth",
  "raggedleft",
  "raggedright",
  "titlerule",
]);
/** This is a deliberately closed fragment grammar. It never evaluates template code. */
export function validateTemplate(template: TemplateRevision): void {
  Schema.decodeUnknownSync(TemplateRevision)(template);
  const { manifest, source } = template;
  const names = new Set(manifest.slots.map((slot) => slot.name));
  if (names.size !== manifest.slots.length) throw new Error("Duplicate template slot.");
  const placeholders = [...source.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)];
  for (const match of placeholders)
    if (!names.has(match[1] ?? "")) throw new Error("Undeclared template slot.");
  if (source.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, "").includes("{{"))
    throw new Error("Invalid template placeholder.");
  for (const slot of manifest.slots) {
    if (!placeholders.some((match) => match[1] === slot.name))
      throw new Error("Unused template slot.");
    if (
      slot.kind === "children" &&
      (manifest.level === "block" || (manifest.level === "section" && slot.level !== "block"))
    )
      throw new Error("Invalid child template level.");
  }
  if (source.includes("%") || source.includes("^^") || source.includes("\\\\"))
    throw new Error("Prohibited LaTeX construct.");
  for (const match of source.matchAll(/\\([A-Za-z]+|[^A-Za-z])/g))
    if (!allowedCommands.has(match[1] ?? ""))
      throw new Error(`Prohibited LaTeX command: ${match[1]}`);
  for (const match of source.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g))
    if (
      !["fontspec", "geometry", "enumitem", "titlesec", "multicol", "hyperref"].includes(
        match[1] ?? "",
      )
    )
      throw new Error("Unapproved LaTeX package.");
  for (const match of source.matchAll(/\\(?:begin|end)\{([^}]*)\}/g))
    if (!["document", "itemize", "minipage", "multicols"].includes(match[1] ?? ""))
      throw new Error("Unapproved LaTeX environment.");
  if (manifest.level === "document") {
    const normalized = source.replace(
      /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,
      (_, name: string) => `__slot_${name}__`,
    );
    const classes = [...normalized.matchAll(/\\documentclass(?:\[[^\]]*\])?\{([^}]*)\}/g)];
    if (classes.length !== 1 || classes[0]?.[1] !== "article")
      throw new Error("Document templates require the pinned article class.");
    const fonts = [...normalized.matchAll(/\\setmainfont\{([^}]*)\}/g)];
    if (fonts.length !== 1 || fonts[0]?.[1] !== "__slot_font__")
      throw new Error("Document typography must use its declared font slot.");
    if (
      (source.match(/\\begin\{document\}/g) ?? []).length !== 1 ||
      (source.match(/\\end\{document\}/g) ?? []).length !== 1
    )
      throw new Error("A Document template requires exactly one document environment.");
  }
  if (
    manifest.level !== "document" &&
    /\\(?:documentclass|usepackage|setmainfont|pagestyle|setlength|setlist|titleformat|titlespacing|hyphenpenalty|exhyphenpenalty)\b/.test(
      source,
    )
  )
    throw new Error("Child templates must inherit document styles.");
}

function template(
  theme: Theme,
  level: TemplateManifest["level"],
  type: ContentType | null,
  slots: TemplateManifest["slots"],
  source: string,
): TemplateRevision {
  const result: TemplateRevision = {
    manifest: {
      id: `${theme}/${level}/${type ?? "resume"}`,
      revision: 2,
      level,
      contentTypes: type ? [type] : contentTypes,
      styleContract: "river-v1",
      inherits: ["font", "bodySize", "sectionSpacing", "margin"],
      overrides: {},
      assets: ["fonts-lmodern@2.005-1"],
      slots,
      validation: "river-fragments-v1",
    },
    source,
  };
  validateTemplate(result);
  return result;
}

export function fixedPack(theme: Theme, revision: 1 | 2 = 2) {
  if (revision === 1) return legacyPack(theme);
  const document = template(
    theme,
    "document",
    null,
    [
      ...(["font", "bodySize", "sectionSpacing", "margin"] as const).map((token) => ({
        name: token,
        kind: "style" as const,
        token,
      })),
      { name: "header", kind: "children", level: "block", types: ["contact"] },
      {
        name: "sections",
        kind: "children",
        level: "section",
        types: contentTypes.filter((type) => type !== "contact"),
      },
    ],
    String.raw`\documentclass[{{bodySize}}pt,letterpaper]{article}
\usepackage{fontspec}
\setmainfont{{{font}}}
\usepackage[margin={{margin}}in]{geometry}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage[hidelinks]{hyperref}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{2pt}
\setlist[itemize]{leftmargin=12pt,itemsep=2pt,topsep=2pt,parsep=0pt,beginpenalty=10000,label=\textbullet}
\titleformat{\section}{\large\bfseries}{}{0pt}{}${theme === "minimal" ? "" : "[\\titlerule]"}
\titlespacing*{\section}{0pt}{ {{sectionSpacing}}pt }{4pt}
\hyphenpenalty=10000
\exhyphenpenalty=10000
\clubpenalty=10000
\widowpenalty=10000
\begin{document}
\raggedright
{{header}}
{{sections}}
\end{document}
`,
  );
  const sections = contentTypes
    .filter((type) => type !== "contact")
    .map((type) =>
      template(
        theme,
        "section",
        type,
        [
          { name: "heading", kind: "text" },
          { name: "blocks", kind: "children", level: "block", types: [type] },
        ],
        String.raw`\section*{ {{heading}} }
\raggedright
{{blocks}}`,
      ),
    );
  const blocks = contentTypes.map((type) =>
    type === "contact"
      ? template(
          theme,
          "block",
          type,
          [
            { name: "name", kind: "text" },
            { name: "lines", kind: "text-list", layout: "paragraphs" },
          ],
          String.raw`{\LARGE\bfseries {{name}} }\par
{{lines}}`,
        )
      : template(
          theme,
          "block",
          type,
          [
            { name: "heading", kind: "text" },
            { name: "detail", kind: "text" },
            { name: "paragraphs", kind: "text-list", layout: "paragraphs" },
            { name: "bullets", kind: "text-list", layout: "bullets" },
          ],
          String.raw`\textbf{ {{heading}} }\par
{{detail}}\par
{{paragraphs}}
{{bullets}}`,
        ),
  );
  return {
    theme,
    revision: 2 as const,
    tokens: { ...packs[theme], revision: 2 },
    document,
    sections,
    blocks,
  };
}

/** A compact, deterministic inventory for checkpoints and artifact diagnostics. */
export function templateInventory(theme: Theme, revision: 1 | 2 = 2) {
  if (revision === 1) return legacyInventory(theme);
  const pack = fixedPack(theme);
  return {
    theme,
    renderer: RENDERER_VERSION,
    revision: pack.revision,
    tokens: pack.tokens,
    templates: [pack.document, ...pack.sections, ...pack.blocks].map((item) => ({
      id: item.manifest.id,
      revision: item.manifest.revision,
      identity: canonicalJson(item),
    })),
  };
}
