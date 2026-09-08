import { expect, it } from "vitest";
import { allTypesDocument } from "./fixtures";
import { compose } from "./index";
import { isolateLayoutAdjustment } from "./layout-promotion";

const source = compose(allTypesDocument, "classic").tex;
it("isolates all supported layout properties into bounded generic values", () => {
  const result = isolateLayoutAdjustment(
    source,
    source
      .replace("[10pt,letterpaper]", "[11pt,letterpaper]")
      .replace("Latin Modern Roman", "Latin Modern Sans")
      .replace("margin=0.65in", "margin=0.7in")
      .replace("{\\parskip}{2pt}", "{\\parskip}{3pt}")
      .replace("{ 9pt }", "{ 8pt }"),
  );
  expect(result).toEqual({
    state: "Isolated",
    changes: [
      { property: "font", before: "Latin Modern Roman", after: "Latin Modern Sans" },
      { property: "bodySize", before: 10, after: 11 },
      { property: "margin", before: 0.65, after: 0.7 },
      { property: "paragraphSpacing", before: 2, after: 3 },
      { property: "sectionSpacing", before: 9, after: 8 },
    ],
  });
  expect(isolateLayoutAdjustment(source, source)).toEqual({ state: "Unchanged", changes: [] });
});
it("returns no source fragments for mixed wording, comments, duplicate commands or unsupported values", () => {
  const adjusted = source.replace("{\\parskip}{3pt}", "{\\parskip}{2pt}");
  for (const candidate of [
    adjusted.replace("\\begin{document}", "\\begin{document}\nPrivate changed wording"),
    `${adjusted}\n% Private comment`,
    adjusted.replace("\\begin{document}", "\\setlength{\\parskip}{1pt}\n\\begin{document}"),
    adjusted.replace("{\\parskip}{2pt}", "{\\parskip}{99pt}"),
    adjusted.replace("{\\parskip}{2pt}", "{\\parskip}{Private}"),
    adjusted.replace("itemsep=2pt", "itemsep=1pt"),
    `${adjusted}\\input{private}`,
  ])
    expect(isolateLayoutAdjustment(source, candidate)).toEqual({
      state: "Unavailable",
      changes: [],
    });
});
