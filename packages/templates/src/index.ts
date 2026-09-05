import type { ValidationReport } from "./validation-report";

export * from "./graph";
export * from "./refinement";
export * from "./source-proposals";
export { ValidationReport } from "./validation-report";

import {
  canonicalJson,
  type IntendedTextManifest,
  type ResumeDocument,
  type Theme,
  validateIntendedText,
} from "@river/domain";

export {
  fixedPack,
  packs,
  RENDERER_VERSION,
  TemplateManifest,
  TemplateRevision,
  templateInventory,
  validateTemplate,
} from "./manifests";

import { CUSTOM_RENDERER_VERSION, type TemplateGraph, validateGraph } from "./graph";
import {
  effectiveStyles,
  fixedPack,
  RENDERER_VERSION,
  type StyleTokens,
  type TemplateRevision,
} from "./manifests";

/** Scalar content is escaped once. Only compositor-owned fragments contain LaTeX. */
export function escapeTex(text: string): string {
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

export function expectedText(document: ResumeDocument): string {
  return [
    document.name,
    ...document.contact,
    ...document.sections.flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) => [
        block.heading,
        block.detail,
        ...block.paragraphs,
        ...block.bullets,
      ]),
    ]),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Normalize typography and line wrapping, while retaining word order and multiplicity. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2022\u25cf\u00b7]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const NORMALIZATION_VERSION = "river-text-nfkc-v2";
export function textLocations(document: ResumeDocument) {
  const fallback = [
    { locator: "contact/name", text: document.name },
    ...document.contact.map((text, index) => ({ locator: `contact/lines/${index}`, text })),
    ...document.sections.flatMap((section, sectionIndex) => [
      { locator: `${section.locator ?? sectionIndex}/heading`, text: section.heading },
      ...section.blocks.flatMap((block, blockIndex) => [
        {
          locator: `${block.locator ?? `${sectionIndex}/${blockIndex}`}/heading`,
          text: block.heading,
        },
        {
          locator: `${block.locator ?? `${sectionIndex}/${blockIndex}`}/detail`,
          text: block.detail,
        },
        ...block.paragraphs.map((text, index) => ({
          locator: `${block.locator ?? `${sectionIndex}/${blockIndex}`}/paragraphs/${index}`,
          text,
        })),
        ...block.bullets.map((text, index) => ({
          locator: `${block.locator ?? `${sectionIndex}/${blockIndex}`}/bullets/${index}`,
          text,
        })),
      ]),
    ]),
  ].filter((location) => location.text.length > 0);
  const locations = document.textLocators ?? fallback;
  if (
    normalizeText(locations.map((location) => location.text).join("\n")) !==
    normalizeText(expectedText(document))
  )
    throw new Error("Text locators must match the complete render input in reading order.");
  return locations;
}

export function validateText(document: ResumeDocument, extractedText: string): ValidationReport {
  return validateRequiredText(expectedText(document), textLocations(document), extractedText);
}

export function validateTextManifest(
  manifest: IntendedTextManifest,
  extractedText: string,
): ValidationReport {
  return validateRequiredText(validateIntendedText(manifest), manifest, extractedText);
}

function validateRequiredText(
  expected: string,
  locations: readonly { locator: string; text: string }[],
  extractedText: string,
): ValidationReport {
  const left = normalizeText(expected),
    right = normalizeText(extractedText);
  const count = (text: string) => {
    const words = new Map<string, number>();
    for (const word of text.split(" ").filter(Boolean)) words.set(word, (words.get(word) ?? 0) + 1);
    return words;
  };
  const required = count(left),
    actual = count(right);
  const completeness = [...required].every(([word, total]) => (actual.get(word) ?? 0) >= total);
  const multiplicity =
    required.size === actual.size &&
    [...required].every(([word, total]) => actual.get(word) === total);
  const passed = left === right;
  let firstDifference: ValidationReport["firstDifference"] = null;
  if (!passed) {
    let difference = 0;
    while (
      difference < left.length &&
      difference < right.length &&
      left[difference] === right[difference]
    )
      difference++;
    let offset = 0;
    for (const location of locations) {
      const length = normalizeText(location.text).length;
      if (difference <= offset + length) {
        firstDifference = {
          locator: location.locator,
          expectedText: location.text,
          expectedOffset: difference,
          extractedOffset: difference,
        };
        break;
      }
      offset += length + 1;
    }
    firstDifference ??= {
      locator: "document/end",
      expectedText: "",
      expectedOffset: left.length,
      extractedOffset: difference,
    };
  }
  return {
    passed,
    expectedText: expected,
    extractedText,
    normalization: NORMALIZATION_VERSION,
    checks: { completeness, multiplicity, readingOrder: passed },
    locations,
    firstDifference,
    errors: passed
      ? []
      : ["Extracted text differs from the document's required text or reading order."],
    warnings: [],
  };
}

class Fragment {
  constructor(
    readonly tex: string,
    readonly template: TemplateRevision,
  ) {}
}
type SlotValue = string | readonly string[] | readonly Fragment[];
/** Child fragments carry validated provenance. Scalar strings can never enter child-output slots. */
function render(
  template: TemplateRevision,
  values: Readonly<Record<string, SlotValue>>,
  inherited: StyleTokens,
  custom = false,
): Fragment {
  const tokens = effectiveStyles(inherited, template.manifest);
  const slots = new Map(template.manifest.slots.map((slot) => [slot.name, slot]));
  for (const key of Object.keys(values))
    if (!slots.has(key)) throw new Error(`Undeclared input: ${key}`);
  const tex = template.source.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, name: string) => {
    const slot = slots.get(name);
    if (!slot) throw new Error("Undeclared template slot.");
    if (slot.kind === "style") return escapeTex(String(tokens[slot.token]));
    const value = values[name];
    if (slot.kind === "text") {
      if (typeof value !== "string") throw new Error("A text slot requires scalar wording.");
      return escapeTex(value);
    }
    if (!Array.isArray(value)) throw new Error("A collection slot requires an ordered list.");
    if (slot.kind === "text-list") {
      const text = value.map((item: unknown) => {
        if (typeof item !== "string")
          throw new Error("Only scalar wording is allowed in text lists.");
        return escapeTex(item);
      });
      return slot.layout === "paragraphs"
        ? text.map((line) => `${line}\\par`).join("\n")
        : text.length
          ? `\\begin{itemize}\n${text.map((line) => `\\item ${line}`).join("\n")}\n\\end{itemize}`
          : "";
    }
    return value
      .map((child: unknown) => {
        if (
          !(child instanceof Fragment) ||
          child.template.manifest.level !== slot.level ||
          child.template.manifest.styleContract !== template.manifest.styleContract ||
          !child.template.manifest.contentTypes.every((type) => slot.types.includes(type))
        )
          throw new Error("Incompatible child fragment.");
        return child.tex;
      })
      .join("\n");
  });
  if (!custom || template.manifest.level === "document") return new Fragment(tex, template);
  const styles: string[] = [];
  if (tokens.font !== inherited.font) styles.push(`\\fontspec{${tokens.font}}`);
  if (tokens.bodySize !== inherited.bodySize)
    styles.push(
      `\\fontsize{${tokens.bodySize}pt}{${(tokens.bodySize * 1.2).toFixed(1)}pt}\\selectfont`,
    );
  if (template.manifest.level === "section" && tokens.sectionSpacing !== inherited.sectionSpacing)
    styles.push(`\\titlespacing*{\\section}{0pt}{${tokens.sectionSpacing}pt}{4pt}`);
  return new Fragment(styles.length ? `{${styles.join("\n")}\n${tex}\n}` : tex, template);
}

/** Resolve a fixed internally compatible pack. No scripts, mutable records, or cross-pack substitution. */
export function compose(document: ResumeDocument, theme: Theme): { tex: string; identity: string } {
  return composeWithPack(document, fixedPack(theme), RENDERER_VERSION, false);
}

/** Custom graphs use a separate renderer identity; built-in historical captures keep their identity. */
export function composeGraph(document: ResumeDocument, graph: TemplateGraph) {
  return composeWithPack(document, validateGraph(graph), CUSTOM_RENDERER_VERSION, true);
}
function composeWithPack(
  document: ResumeDocument,
  pack: TemplateGraph,
  rendererVersion: string,
  custom: boolean,
): { tex: string; identity: string } {
  const documentStyles = effectiveStyles(pack.tokens, pack.document.manifest);
  const blockTemplate = (
    type: (typeof pack.blocks)[number]["manifest"]["contentTypes"][number],
  ) => {
    const template = pack.blocks.find((template) => template.manifest.contentTypes.includes(type));
    if (!template) throw new Error("Unsupported Block type.");
    return template;
  };
  const header = render(
    blockTemplate("contact"),
    { name: document.name, lines: document.contact },
    documentStyles,
    custom,
  );
  const sections = document.sections.map((section) => {
    // Older Phase 0 resolved inputs did not carry a type. Their generic shape remains renderable.
    const type = section.type ?? "summary";
    const template = pack.sections.find((template) =>
      template.manifest.contentTypes.includes(type),
    );
    if (!template) throw new Error("Unsupported Section type.");
    const sectionStyles = effectiveStyles(documentStyles, template.manifest);
    const blocks = section.blocks.map((block) => {
      if (block.type && block.type !== type) throw new Error("Section and Block types must agree.");
      return render(
        blockTemplate(type),
        {
          heading: block.heading,
          detail: block.detail,
          paragraphs: block.paragraphs,
          bullets: block.bullets,
        },
        sectionStyles,
        custom,
      );
    });
    return render(template, { heading: section.heading, blocks }, documentStyles, custom);
  });
  const output = render(pack.document, { header: [header], sections }, pack.tokens, custom);
  return {
    tex: custom
      ? output.tex.replace(
          "\\begin{document}",
          `\\begin{document}\n\\fontsize{${documentStyles.bodySize}pt}{${(documentStyles.bodySize * 1.2).toFixed(1)}pt}\\selectfont`,
        )
      : output.tex,
    identity: canonicalJson({ document, pack, rendererVersion }),
  };
}

export const syntheticResume: ResumeDocument = {
  name: "Alex Morgan",
  contact: ["Sample City | alex@example.com | portfolio.example"],
  sections: [
    {
      heading: "Summary",
      blocks: [
        {
          heading: "",
          detail: "",
          paragraphs: [
            "Software engineer building thoughtful web applications with TypeScript, React, and relational data.",
          ],
          bullets: [],
        },
      ],
    },
    {
      heading: "Projects",
      blocks: [
        {
          heading: "Fieldnotes",
          detail: "Web application",
          paragraphs: [],
          bullets: [
            "Built a typed React editor with reusable content blocks and persistent drafts.",
            "Designed REST endpoints for storing and retrieving versioned documents.",
          ],
        },
      ],
    },
    {
      heading: "Education",
      blocks: [
        {
          heading: "Sample University",
          detail: "B.S. Computer Science",
          paragraphs: ["Concentration in Software Engineering"],
          bullets: [],
        },
      ],
    },
    {
      heading: "Technical skills",
      blocks: [
        {
          heading: "",
          detail: "",
          paragraphs: ["TypeScript, JavaScript, React, SQL, Git, REST APIs"],
          bullets: [],
        },
      ],
    },
  ],
};

export { TEMPLATE_FIXTURE_VERSION, templateFixtures } from "./fixtures";
export { effectiveStyles } from "./manifests";
export * from "./studio";
