import type { ArtifactManifest, ValidationReport } from "@river/contracts";
export interface TemplateDependency {
  readonly revisionId: string;
  readonly reviewRevision: number;
  readonly designId: string;
  readonly designRevision: number;
}
export interface TemplateFixtureResult {
  readonly id: string;
  readonly name: string;
  readonly passed: boolean;
  readonly firstFingerprint: string | null;
  readonly secondFingerprint: string | null;
  readonly artifacts: ArtifactManifest | null;
  readonly validation: ValidationReport | null;
  readonly diagnostic: string | null;
}
export interface TemplateValidationReport {
  readonly passed: boolean;
  readonly graphDigest: string;
  readonly fixtureSetDigest: string;
  readonly renderer: string;
  readonly validator: string;
  readonly fixtures: readonly TemplateFixtureResult[];
}
