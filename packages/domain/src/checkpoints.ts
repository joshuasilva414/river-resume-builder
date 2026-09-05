import { type Composition, contentValue, type LibraryGraphNode } from "./composition";
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
export const EXPORT_POLICY_VERSION = "river-evidence-export-v1";
/** Every applicable issue occurrence survives, including simultaneous Draft and Archived warnings. */
export function exportIssues(
  data: Composition,
  graph: readonly LibraryGraphNode[],
  evidence: readonly CapturedEvidence[],
  statuses: readonly EvidenceStatus[],
): readonly ExportIssue[] {
  const issues: ExportIssue[] = [];
  for (const section of data.sections)
    for (const block of section.blocks)
      for (const field of block.fields)
        for (const content of field.contents) {
          const value = contentValue(content, graph),
            locator = `${section.id}/${block.id}/${field.key}/${content.id}`;
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
          if (!value.evidence.length)
            issue("Unsupported", null, null, "This wording has no supporting evidence.");
          for (const reference of value.evidence) {
            const snapshot = evidence.find(
              (row) => row.claimId === reference.claimId && row.revisionId === reference.revisionId,
            );
            const status = statuses.find(
              (row) => row.claimId === reference.claimId && row.revisionId === reference.revisionId,
            );
            if (!snapshot || !status) throw new Error("Checkpoint evidence is incomplete.");
            if (status.state === "Draft" || status.state === "Needs clarification")
              issue(
                status.state,
                reference.claimId,
                reference.revisionId,
                status.rationale || "This exact Evidence Revision has not been verified.",
              );
            if (status.archived)
              issue(
                "Archived",
                reference.claimId,
                reference.revisionId,
                "This evidence is archived and retains its original provenance.",
              );
            if (status.currentRevisionId !== reference.revisionId)
              issue(
                "Stale",
                reference.claimId,
                reference.revisionId,
                `A newer Evidence Revision exists: ${status.currentRevisionId}`,
              );
            if (!snapshot.material.citations.length)
              issue(
                "Unsupported",
                reference.claimId,
                reference.revisionId,
                "The linked Evidence Revision has no source citation.",
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
