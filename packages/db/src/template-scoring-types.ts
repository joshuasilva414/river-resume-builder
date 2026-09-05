import type { ArtifactManifest } from "@river/contracts";
import type { AtsFixtureScoringEvidence, qualifyAtsTemplate } from "@river/templates";

export interface TemplateScoringDocument {
  readonly artifacts: ArtifactManifest;
  readonly input: Omit<AtsFixtureScoringEvidence, "runId" | "rawResponseJson">;
}
export type TemplateScoringReport = Awaited<ReturnType<typeof qualifyAtsTemplate>>;
