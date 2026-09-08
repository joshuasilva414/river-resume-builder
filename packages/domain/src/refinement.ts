import { Schema } from "effect";
import type { CapturedEvidence, EvidenceStatus, ExportIssue } from "./checkpoints";
import { EvidenceReference } from "./library";

/** Ordered intended text is captured before compilation, independently of PDF extraction. */
const IntendedTextField = Schema.Struct({
  locator: Schema.NonEmptyString.check(Schema.isMaxLength(300)),
  text: Schema.NonEmptyString.check(Schema.isMaxLength(20_000)),
});
export const IntendedTextManifest = Schema.Array(IntendedTextField).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(2000),
);
export type IntendedTextManifest = typeof IntendedTextManifest.Type;

/** Origin, required-field obligations and review status are assigned by River, never the model. */
export const SourceField = Schema.Struct({
  ...IntendedTextField.fields,
  origin: Schema.Literals(["structured", "source"]),
  role: Schema.Literals(["heading", "content"]),
  required: Schema.Boolean,
  evidence: Schema.Array(EvidenceReference).check(Schema.isMaxLength(20)),
  reviewRequired: Schema.Boolean,
});
export type SourceField = typeof SourceField.Type;
export const SourceFields = Schema.Array(SourceField).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(2000),
);
export type SourceFields = typeof SourceFields.Type;

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

/** Accepted source wording receives its own issue report; historical acknowledgments never verify new wording. */
export function sourceExportIssues(
  fields: SourceFields,
  evidence: readonly CapturedEvidence[],
  statuses: readonly EvidenceStatus[],
): readonly ExportIssue[] {
  const issues: ExportIssue[] = [];
  for (const field of fields) {
    const issue = (
      kind: ExportIssue["kind"],
      rationale: string,
      reference?: EvidenceReference,
      contextId: string | null = null,
    ) =>
      issues.push({
        id: `${field.locator}/${reference?.claimId ?? "wording"}/${reference?.revisionId ?? "local"}/${kind}/${contextId ?? "claim"}`,
        kind,
        locator: field.locator,
        wording: field.text,
        claimId: reference?.claimId ?? null,
        revisionId: reference?.revisionId ?? null,
        contextId,
        rationale,
      });
    if (field.role === "heading") continue;
    for (const reference of field.evidence) {
      const matches = (row: { claimId: string; revisionId: string }) =>
        row.claimId === reference.claimId && row.revisionId === reference.revisionId;
      const captured = evidence.find(matches),
        status = statuses.find(matches);
      if (!captured || !status) throw new Error("Checkpoint evidence is incomplete.");
      if (status.archived)
        issue(
          "Archived",
          "This evidence is archived and retains its original provenance.",
          reference,
        );
      if (status.currentRevisionId !== reference.revisionId)
        issue("Stale", `A newer Evidence Revision exists: ${status.currentRevisionId}`, reference);
      for (const context of status.contexts)
        if (context.currentRevisionId !== context.revisionId)
          issue(
            "Stale",
            `The pinned context ${context.revisionId} differs from ${context.currentRevisionId}.`,
            reference,
            context.id,
          );
    }
  }
  return issues.sort((a, b) => a.id.localeCompare(b.id));
}
