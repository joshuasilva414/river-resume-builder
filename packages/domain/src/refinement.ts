import { Schema } from "effect";

/** Ordered intended text is captured before compilation, independently of PDF extraction. */
export const IntendedTextManifest = Schema.Array(
  Schema.Struct({
    locator: Schema.NonEmptyString.check(Schema.isMaxLength(300)),
    text: Schema.NonEmptyString.check(Schema.isMaxLength(20_000)),
  }),
).check(Schema.isMinLength(1), Schema.isMaxLength(2000));
export type IntendedTextManifest = typeof IntendedTextManifest.Type;

export function validateIntendedText(manifest: IntendedTextManifest): string {
  Schema.decodeUnknownSync(IntendedTextManifest)(manifest);
  const locators = new Set<string>();
  for (const item of manifest) {
    if (locators.has(item.locator)) throw new Error("Intended-text locators must be unique.");
    if (!item.text.trim()) throw new Error("Intended text cannot contain an empty field.");
    locators.add(item.locator);
  }
  const expected = manifest.map((item) => item.text).join("\n");
  if (expected.length > 100_000) throw new Error("Intended text exceeds 100,000 characters.");
  return expected;
}
