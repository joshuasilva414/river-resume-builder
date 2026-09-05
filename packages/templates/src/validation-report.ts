import { Schema } from "effect";

export const ValidationReport = Schema.Struct({
  normalization: Schema.optional(Schema.String),
  pageCount: Schema.optional(Schema.Int),
  checks: Schema.optional(
    Schema.Struct({
      completeness: Schema.Boolean,
      multiplicity: Schema.Boolean,
      readingOrder: Schema.Boolean,
    }),
  ),
  locations: Schema.optional(
    Schema.Array(Schema.Struct({ locator: Schema.String, text: Schema.String })),
  ),
  firstDifference: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        locator: Schema.String,
        expectedText: Schema.String,
        expectedOffset: Schema.Int,
        extractedOffset: Schema.Int,
      }),
    ),
  ),
  passed: Schema.Boolean,
  expectedText: Schema.String,
  extractedText: Schema.String,
  errors: Schema.Array(Schema.String),
  warnings: Schema.Array(Schema.String),
});
export type ValidationReport = typeof ValidationReport.Type;
