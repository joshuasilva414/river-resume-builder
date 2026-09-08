import { expect, it } from "vitest";
import { readLegacyDate } from "./content-schema";

it.each([
  ["2025", { kind: "year", year: 2025 }],
  ["May 2025", { kind: "month", year: 2025, month: 5 }],
  ["Sept. 2024", { kind: "month", year: 2024, month: 9 }],
  ["05/2025", { kind: "month", year: 2025, month: 5 }],
  ["2025-05", { kind: "month", year: 2025, month: 5 }],
  ["2024-02-29", { kind: "day", value: "2024-02-29" }],
  [" present ", { kind: "present" }],
])("infers the supplied precision from %s", (text, expected) => {
  expect(readLegacyDate(text)).toEqual(expected);
});

it.each([
  "2021–2024",
  "May 2021 - Present",
  "03/04/2025",
  "May",
  "2025-02-29",
  "2025-13",
  "0000",
  " Summer 2025 ",
])("preserves ambiguous or invalid legacy text %s", (text) => {
  expect(readLegacyDate(text)).toEqual({ kind: "legacy", text });
});
