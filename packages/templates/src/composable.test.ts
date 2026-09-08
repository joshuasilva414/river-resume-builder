import { emptyStructuredContent } from "@river/domain";
import { describe, expect, it } from "vitest";
import { renderStructuredContent, validateComposableLayouts } from "./composable";
import { compose, expectedText, validateText } from "./index";

describe("composable rendering", () => {
  it("escapes direct values and retains the complete dependency bundle", () => {
    const original = emptyStructuredContent("summary", "summary");
    const structured = {
      ...original,
      record: {
        ...original.record,
        values: { heading: "Summary", summary: "Built A&B with 90% coverage." },
      },
    };
    const tex = renderStructuredContent(structured);
    expect(tex).toContain("A\\&B");
    expect(tex).toContain("90\\%");
    const document = {
      name: "Example",
      contact: [],
      sections: [
        {
          heading: "Summary",
          structured,
          blocks: [
            { heading: "", detail: "", paragraphs: ["Built A&B with 90% coverage."], bullets: [] },
          ],
        },
      ],
    };
    expect(compose(document, "classic").tex).toContain("90\\%");
    expect(validateText(document, expectedText(document)).passed).toBe(true);
  });
  it("rejects unsafe layout source while supporting isolated columns", () => {
    const content = emptyStructuredContent("summary", "summary");
    const layout = content.layouts[0];
    if (!layout) throw new Error("Missing fixture.");
    expect(() =>
      validateComposableLayouts({
        ...content,
        layouts: [{ ...layout, source: `\\input{secret}\n${layout.source}` }],
      }),
    ).toThrow("Prohibited");
    expect(() =>
      validateComposableLayouts({
        ...content,
        layouts: [
          {
            ...layout,
            source: `\\begin{minipage}{0.48\\textwidth}\n${layout.source}\n\\end{minipage}`,
          },
        ],
      }),
    ).not.toThrow();
  });
  it("reports reading order as a diagnostic and missing words as errors", () => {
    const document = { name: "Alex", contact: ["Example City"], sections: [] };
    expect(validateText(document, "Example City Alex")).toMatchObject({
      passed: true,
      checks: { readingOrder: false },
    });
    expect(validateText(document, "Alex City").passed).toBe(false);
  });
});
