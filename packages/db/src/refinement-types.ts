import type { ArtifactManifest } from "@river/contracts";
import type { CapturedEvidence, EvidenceStatus, SourceFields } from "@river/domain";

/** Exact bytes are loaded through the private artifact adapter before task capture. */
export interface RefinementBaseArtifacts {
  readonly operationId: string;
  readonly artifacts: ArtifactManifest;
  readonly source: string;
  readonly extractedText: string;
  readonly digests: {
    readonly pdf: string;
    readonly tex: string;
    readonly text: string;
    readonly report: string;
  };
}
export interface RefinementDependencies {
  readonly claims: readonly { id: string; revision: number }[];
  readonly contexts: readonly { id: string; revision: number }[];
}
export interface SourceRefinementInput {
  readonly type: "source-refinement";
  readonly goal: string;
  readonly checkpoint: {
    readonly id: string;
    readonly structuredBaseId: string;
    readonly snapshotId: string;
    readonly operationId: string;
    readonly source: string;
    readonly fields: SourceFields;
    readonly extractedText: string;
    readonly baseTemplateIdentity: string;
    readonly artifacts: ArtifactManifest;
    readonly digests: RefinementBaseArtifacts["digests"];
  };
  readonly evidence: readonly CapturedEvidence[];
  readonly statuses: readonly EvidenceStatus[];
}
