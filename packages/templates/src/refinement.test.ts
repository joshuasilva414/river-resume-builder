import { validateIntendedText } from "@river/domain";
import { describe, expect, it } from "vitest";
import { allTypesDocument } from "./fixtures";
import {
  compose,
  composeGraph,
  expectedText,
  fixedPack,
  refinedSourceIdentity,
  textLocations,
  validateRefinedSource,
  validateText,
  validateTextManifest,
} from "./index";

describe("complete source refinement", () => {
  it.each(["classic", "minimal", "technical"] as const)(
    "accepts the complete composed %s source with escaped scalar content",
    (theme) => {
      const { tex } = compose(allTypesDocument, theme);
      expect(() => validateRefinedSource(tex)).not.toThrow();
      expect(() =>
        validateRefinedSource(
          tex.replace("\\begin{document}", "\\begin{document}\n% A layout note\n\\vspace{-2pt}"),
        ),
      ).not.toThrow();
      const graph = fixedPack(theme);
      const custom = composeGraph(allTypesDocument, {
        ...graph,
        document: {
          ...graph.document,
          manifest: {
            ...graph.document.manifest,
            overrides: { bodySize: 11, font: "Latin Modern Sans" },
          },
        },
      });
      expect(() => validateRefinedSource(custom.tex)).not.toThrow();
    },
  );

  it("rejects file access, macro construction, encoded commands and unpinned resources before compilation", () => {
    const { tex } = compose(allTypesDocument, "classic");
    for (const payload of [
      String.raw`\input{/etc/passwd}`,
      String.raw`\write18{touch marker}`,
      String.raw`\csname input\endcsname{file}`,
      String.raw`\catcode37=12`,
      "^^5cinput{file}",
      String.raw`\usepackage{shellesc}`,
      String.raw`\setmainfont[Path=/tmp/]{Latin Modern Roman}`,
      String.raw`\fontspec{Latin Modern Roman}[Path=/tmp/]`,
      String.raw`\usepackage[config=private]{fontspec}`,
      String.raw`\begin{verbatim}hidden\end{verbatim}`,
      String.raw`\begin{itemize}\end{enumerate}`,
      "\u0000",
      "}",
    ])
      expect(() =>
        validateRefinedSource(tex.replace("\\begin{document}", `\\begin{document}\n${payload}`)),
      ).toThrow();
    expect(() => validateRefinedSource(tex.replace("{article}", "{unapproved}"))).toThrow();
  });

  it("validates an independent manifest with stable locators, exact multiplicity and reading order", () => {
    const manifest = [
      { locator: "name", text: "Synthetic Person" },
      { locator: "first", text: "Repeated evidence." },
      { locator: "second", text: "Repeated evidence." },
    ];
    expect(
      validateTextManifest(manifest, "Synthetic Person Repeated evidence. Repeated evidence.")
        .passed,
    ).toBe(true);
    expect(
      validateTextManifest(manifest, "Synthetic Person Repeated evidence.").checks?.multiplicity,
    ).toBe(false);
    expect(
      validateTextManifest(manifest, "Repeated evidence. Synthetic Person Repeated evidence.")
        .checks?.readingOrder,
    ).toBe(false);
    expect(
      validateTextManifest(
        manifest,
        "Synthetic Person Repeated evidence. Repeated evidence. Added fact.",
      ).passed,
    ).toBe(false);
    expect(() =>
      validateIntendedText([
        { locator: "same", text: "One" },
        { locator: "same", text: "Two" },
      ]),
    ).toThrow("unique");
    expect(() => validateIntendedText([{ locator: "empty", text: " " }])).toThrow("empty");
    expect(() =>
      validateIntendedText(
        Array.from({ length: 6 }, (_, index) => ({
          locator: String(index),
          text: "x".repeat(20_000),
        })),
      ),
    ).toThrow("100,000");
    const original = validateText(allTypesDocument, expectedText(allTypesDocument));
    expect(original.passed).toBe(true);
    expect(original.expectedText).toBe(expectedText(allTypesDocument));
    expect(
      validateTextManifest(textLocations(allTypesDocument), original.extractedText).checks,
    ).toEqual(original.checks);
  });

  it("pins the full source, intended text identities and original template identity independently", async () => {
    const { tex } = compose(allTypesDocument, "classic"),
      manifest = textLocations(allTypesDocument);
    const identity = await refinedSourceIdentity(tex, manifest, "base-one");
    expect(await refinedSourceIdentity(tex, manifest, "base-one")).toBe(identity);
    expect(await refinedSourceIdentity(`${tex}\n% Layout note`, manifest, "base-one")).not.toBe(
      identity,
    );
    expect(await refinedSourceIdentity(tex, manifest, "base-two")).not.toBe(identity);
    expect(
      await refinedSourceIdentity(
        tex,
        manifest.map((item) => ({ ...item, locator: `changed/${item.locator}` })),
        "base-one",
      ),
    ).not.toBe(identity);
  });
});
