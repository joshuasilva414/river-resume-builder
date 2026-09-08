import { type Composition, contentValue, type LibraryGraphNode } from "./composition";
import { contentRecordText } from "./content-schema";
import type { ContextData, EvidenceMaterial, ReviewState } from "./evidence";

export interface CapturedEvidence {
  readonly claimId: string;
  readonly revisionId: string;
  readonly material: EvidenceMaterial;
  readonly contexts: readonly { id: string; revisionId: string; data: ContextData }[];
}
export interface EvidenceStatus {
  readonly claimId: string;
  readonly revisionId: string;
  readonly currentRevisionId: string;
  readonly archived: boolean;
  readonly state: ReviewState;
  readonly rationale: string;
  readonly decisionId: string | null;
  readonly contexts: readonly { id: string; revisionId: string; currentRevisionId: string }[];
}
export interface ExportIssue {
  readonly id: string;
  readonly kind: "Draft" | "Needs clarification" | "Stale" | "Archived" | "Unsupported";
  readonly locator: string;
  readonly wording: string;
  readonly claimId: string | null;
  readonly revisionId: string | null;
  readonly contextId: string | null;
  readonly rationale: string;
}
export const EXPORT_POLICY_VERSION = "river-evidence-export-v2";
/** New exports report changed references as information. Saved reports retain their original policy. */
export function exportIssues(
  data: Composition,
  graph: readonly LibraryGraphNode[],
  evidence: readonly CapturedEvidence[],
  statuses: readonly EvidenceStatus[],
): readonly ExportIssue[] {
  const issues: ExportIssue[] = [];
  const values = data.sections.flatMap((section) => [
    ...(section.structured
      ? [
          {
            locator: section.id,
            wording: contentRecordText(section.structured, section.structured.record).join("\n"),
            evidence: section.structured.evidence,
          },
        ]
      : []),
    ...section.blocks.flatMap((block) => [
      ...(block.structured
        ? [
            {
              locator: `${section.id}/${block.id}`,
              wording: contentRecordText(block.structured, block.structured.record).join("\n"),
              evidence: block.structured.evidence,
            },
          ]
        : []),
      ...block.fields.flatMap((field) =>
        field.contents.map((content) => ({
          ...contentValue(content, graph),
          locator: `${section.id}/${block.id}/${field.key}/${content.id}`,
        })),
      ),
    ]),
  ]);
  for (const value of values) {
    const locator = value.locator;
    const issue = (
      kind: ExportIssue["kind"],
      claimId: string | null,
      revisionId: string | null,
      rationale: string,
      contextId: string | null = null,
    ) =>
      issues.push({
        id: `${locator}/${claimId ?? "wording"}/${revisionId ?? "local"}/${kind}/${contextId ?? "claim"}`,
        kind,
        locator,
        wording: value.wording,
        claimId,
        revisionId,
        contextId,
        rationale,
      });
    for (const reference of value.evidence) {
      const snapshot = evidence.find(
        (row) => row.claimId === reference.claimId && row.revisionId === reference.revisionId,
      );
      const status = statuses.find(
        (row) => row.claimId === reference.claimId && row.revisionId === reference.revisionId,
      );
      if (!snapshot || !status) throw new Error("Checkpoint evidence is incomplete.");
      if (status.archived)
        issue(
          "Archived",
          reference.claimId,
          reference.revisionId,
          "This evidence is in Trash. The saved résumé retains its content.",
        );
      if (status.currentRevisionId !== reference.revisionId)
        issue(
          "Stale",
          reference.claimId,
          reference.revisionId,
          "This evidence has changed since it was added to the résumé.",
        );
      for (const context of status.contexts)
        if (context.currentRevisionId !== context.revisionId)
          issue(
            "Stale",
            reference.claimId,
            reference.revisionId,
            `The pinned context ${context.revisionId} differs from ${context.currentRevisionId}.`,
            context.id,
          );
    }
  }
  return issues.sort((a, b) => a.id.localeCompare(b.id));
}
