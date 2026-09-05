import { expect, it } from "vitest";
import { compareHistoryEntries, historyJson } from "./history";

it("retains complete repeated text, whitespace, removals and positions by exact locator", () => {
  const before = [
    { key: "a", label: "First", value: "Repeated\n🙂\n " },
    { key: "b", label: "Second", value: "Repeated\n🙂\n " },
    { key: "c", label: "Removed", value: "old" },
  ] as const;
  const after = [
    before[1],
    { ...before[0], value: "Repeated\n🙂\n" },
    { key: "d", label: "Added", value: "new" },
  ];
  const rows = compareHistoryEntries(before, after);
  expect(rows).toMatchObject([
    { key: "a", change: "Changed", moved: true },
    { key: "b", change: "Unchanged", moved: true },
    { key: "c", change: "Removed" },
    { key: "d", change: "Added" },
  ]);
  expect(rows[0]?.before?.value).toBe(before[0]?.value);
  expect(rows[0]?.after?.value).toBe(after[1]?.value);
  const material = {
    citations: [{ quote: "🙂\nexact", start: 2, end: 10, processingId: "processing-a" }],
    context: { field: "historic" },
    empty: "",
    removed: null,
  };
  expect(JSON.parse(historyJson("material", "Complete historical values", material).value)).toEqual(
    material,
  );
});
