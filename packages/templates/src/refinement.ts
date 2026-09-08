import {
  canonicalJson,
  fingerprint,
  type IntendedTextManifest,
  validateIntendedText,
} from "@river/domain";

export const SOURCE_RENDERER_VERSION = "river-source-tectonic-0.1.0";
const commands = new Set([
  "documentclass",
  "usepackage",
  "setmainfont",
  "fontspec",
  "pagestyle",
  "setlength",
  "parindent",
  "parskip",
  "setlist",
  "titleformat",
  "titlerule",
  "titlespacing",
  "hyphenpenalty",
  "exhyphenpenalty",
  "clubpenalty",
  "widowpenalty",
  "begin",
  "end",
  "begingroup",
  "endgroup",
  "fontsize",
  "selectfont",
  "section",
  "subsection",
  "subsubsection",
  "item",
  "par",
  "textbf",
  "textit",
  "texttt",
  "textrm",
  "textsf",
  "textnormal",
  "emph",
  "underline",
  "bfseries",
  "mdseries",
  "itshape",
  "upshape",
  "rmfamily",
  "sffamily",
  "ttfamily",
  "tiny",
  "scriptsize",
  "footnotesize",
  "small",
  "normalsize",
  "large",
  "Large",
  "LARGE",
  "huge",
  "Huge",
  "vspace",
  "hspace",
  "vfill",
  "hfill",
  "smallskip",
  "medskip",
  "bigskip",
  "newpage",
  "clearpage",
  "pagebreak",
  "nopagebreak",
  "noindent",
  "indent",
  "centering",
  "raggedright",
  "raggedleft",
  "newline",
  "linebreak",
  "nolinebreak",
  "rule",
  "textwidth",
  "linewidth",
  "textheight",
  "baselineskip",
  "baselinestretch",
  "tabcolsep",
  "arraystretch",
  "multicolumn",
  "hline",
  "cline",
  "textbackslash",
  "textasciitilde",
  "textasciicircum",
  "textbullet",
  "href",
  "textendash",
  "textemdash",
  "&",
  "%",
  "$",
  "#",
  "_",
  "{",
  "}",
  "\\",
  " ",
  ",",
  ";",
  ":",
  "!",
]);
const environments = new Set([
  "document",
  "itemize",
  "enumerate",
  "tabular",
  "center",
  "flushleft",
  "flushright",
  "minipage",
  "quote",
]);
const packages = new Set(["fontspec", "geometry", "enumitem", "titlesec", "hyperref"]);
const fonts = new Set(["Latin Modern Roman", "Latin Modern Sans", "Latin Modern Mono"]);

/** Full source may change layout or wording, but cannot introduce executable macros, file access or unpinned assets. */
export function validateRefinedSource(source: string) {
  if (
    !source.trim() ||
    source.length > 250_000 ||
    new TextEncoder().encode(source).byteLength > 1_000_000
  )
    throw new Error("Refined LaTeX exceeds its source limit or is empty.");
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control bytes that can change TeX tokenization.
  if (source.includes("^^") || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(source))
    throw new Error("Prohibited LaTeX control encoding.");
  let normalized = "",
    depth = 0;
  const tokens: string[] = [];
  const control = /\\([A-Za-z]+|[^A-Za-z])/y;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === "%") {
      while (index < source.length && source[index] !== "\n") index++;
      normalized += "\n";
      continue;
    }
    if (character === "\\") {
      control.lastIndex = index;
      const token = control.exec(source);
      if (!token?.[1] || !commands.has(token[1]))
        throw new Error("Prohibited LaTeX command in refined source.");
      tokens.push(token[1]);
      normalized += token[0];
      index += token[0].length - 1;
      continue;
    }
    if (character === "{") depth++;
    if (character === "}" && --depth < 0) throw new Error("Unbalanced LaTeX groups.");
    normalized += character;
  }
  if (depth !== 0) throw new Error("Unbalanced LaTeX groups.");
  const classes = [...normalized.matchAll(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g)];
  if (
    classes.length !== 1 ||
    classes[0]?.[1] !== "article" ||
    tokens.filter((token) => token === "documentclass").length !== 1
  )
    throw new Error("Refined source requires the pinned article class.");
  const imports = [...normalized.matchAll(/\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/g)];
  if (
    imports.length !== tokens.filter((token) => token === "usepackage").length ||
    imports.some((match) =>
      match[2]
        ?.split(",")
        .some(
          (name) => !packages.has(name.trim()) || (name.trim() === "fontspec" && Boolean(match[1])),
        ),
    )
  )
    throw new Error("Refined source contains an unpinned package.");
  const selections = [...normalized.matchAll(/\\(?:setmainfont|fontspec)\s*\{([^{}]*)\}/g)];
  if (
    selections.length !==
      tokens.filter((token) => token === "setmainfont" || token === "fontspec").length ||
    selections.some(
      (match) =>
        !fonts.has(match[1] ?? "") ||
        normalized
          .slice(match.index + match[0].length)
          .trimStart()
          .startsWith("["),
    )
  )
    throw new Error("Refined source must use pinned font names without external options.");
  const blocks = [...normalized.matchAll(/\\(begin|end)\s*\{([^{}]*)\}/g)];
  if (blocks.length !== tokens.filter((token) => token === "begin" || token === "end").length)
    throw new Error("Invalid LaTeX environment name.");
  const stack: string[] = [];
  let documentCount = 0;
  for (const match of blocks) {
    const name = match[2] ?? "";
    if (!environments.has(name)) throw new Error("Unapproved LaTeX environment.");
    if (match[1] === "begin") {
      stack.push(name);
      if (name === "document") documentCount++;
    } else if (stack.pop() !== name) throw new Error("Unbalanced LaTeX environments.");
  }
  if (stack.length || documentCount !== 1)
    throw new Error("Refined source requires exactly one complete document environment.");
}

export async function refinedSourceIdentity(
  source: string,
  manifest: IntendedTextManifest,
  baseTemplateIdentity: string,
) {
  validateRefinedSource(source);
  validateIntendedText(manifest);
  return canonicalJson({
    renderer: SOURCE_RENDERER_VERSION,
    baseTemplateIdentity,
    source: await fingerprint(source),
    intendedText: await fingerprint(
      canonicalJson(manifest.map(({ locator, text }) => ({ locator, text }))),
    ),
  });
}
