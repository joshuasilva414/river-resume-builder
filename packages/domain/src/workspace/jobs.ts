import { z } from "zod";
import { identitySchema, safeLinkSchema } from "./model";

export const jobTargetInputSchema = z.object({
  id: identitySchema,
  revision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1).max(128),
  details: z.object({
    role: z.string().trim().min(1).max(200),
    company: z.string().trim().min(1).max(200),
    location: z.string().max(200),
  }),
  description: z.string().trim().min(1).max(200000),
  url: safeLinkSchema.nullable(),
  factIds: z
    .array(identitySchema)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Select each fact once."),
  archived: z.boolean(),
});
export type JobTargetInput = z.infer<typeof jobTargetInputSchema>;

/** Transparent keyword overlap is navigation help, never a qualification or verification score. */
export function matchingTerms(description: string, content: string) {
  const stop = new Set([
    "and",
    "the",
    "with",
    "for",
    "from",
    "this",
    "that",
    "will",
    "your",
    "you",
    "our",
    "are",
    "have",
    "has",
    "was",
    "work",
    "role",
    "team",
    "experience",
  ]);
  const terms = new Set(
    description.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{2,}/gu) ?? [],
  );
  const words = new Set(content.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{2,}/gu) ?? []);
  return [...terms].filter((term) => !stop.has(term) && words.has(term)).slice(0, 20);
}
