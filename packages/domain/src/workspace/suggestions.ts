import { z } from "zod";
import { canonicalJson } from "../core";
import { findContent, mapContent } from "./content";
import {
  type ContentNode,
  contentNodeSchema,
  fieldValueSchema,
  identitySchema,
  type Resume,
} from "./model";

export const suggestionWireSchema = z.object({
  alternatives: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        explanation: z.string().min(1).max(1000),
        changes: z
          .array(
            z.object({
              id: identitySchema,
              value: fieldValueSchema,
              factIds: z.array(identitySchema).max(100),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .max(4),
});
export const suggestionResultSchema = z.object({
  runId: identitySchema,
  inputKey: z.string(),
  targetId: identitySchema,
  alternatives: z
    .array(
      z.object({
        title: z.string(),
        explanation: z.string(),
        source: z.enum(["wording", "library"]),
        replacement: contentNodeSchema,
      }),
    )
    .max(12),
});
export type SuggestionResult = z.infer<typeof suggestionResultSchema>;
export const suggestionInputKey = (target: ContentNode | undefined, job: Resume["job"]) =>
  canonicalJson({ target, job });
/** Provider output may update target values, but never field identity, type, or layout. */
export function wordingAlternatives(
  target: ContentNode,
  wire: z.infer<typeof suggestionWireSchema>,
  allowedFactIds: string[],
) {
  return wire.alternatives
    .map((alternative) => {
      let replacement = target;
      const changed = new Set<string>();
      for (const change of alternative.changes) {
        const field = findContent([target], change.id);
        if (
          field?.kind !== "field" ||
          field.value.kind !== change.value.kind ||
          changed.has(change.id) ||
          change.factIds.some((id) => !allowedFactIds.includes(id))
        )
          throw Error(
            "The provider changed a field identity/type or referenced an unavailable fact.",
          );
        changed.add(change.id);
        replacement =
          mapContent([replacement], change.id, (node) =>
            node.kind === "field"
              ? {
                  ...node,
                  value: change.value,
                  factIds: Array.from(new Set([...node.factIds, ...change.factIds])),
                }
              : node,
          )[0] ?? replacement;
      }
      return {
        title: alternative.title,
        explanation: alternative.explanation,
        source: "wording" as const,
        replacement,
      };
    })
    .filter((item) => JSON.stringify(item.replacement) !== JSON.stringify(target));
}
export function applySuggestion(resume: Resume, result: SuggestionResult, index: number): Resume {
  const target = findContent(resume.sections, result.targetId),
    item = result.alternatives[index];
  if (!target || !item || suggestionInputKey(target, resume.job) !== result.inputKey)
    throw Error("The target or selected job changed. Request a new preview.");
  return {
    ...resume,
    sections: mapContent(resume.sections, target.id, () => structuredClone(item.replacement)),
  };
}
