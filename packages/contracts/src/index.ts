import { AgentScope, IntendedTextManifest, ResumeDocument, Revision, Theme } from "@river/domain";
import { TemplateGraph, ValidationReport } from "@river/templates";
import { Schema } from "effect";
import { AiSelectionFields } from "./ai";

export * from "./feedback";

export const CompileRequest = Schema.Struct({
  type: Schema.Literal("compile-resume"),
  templateGraph: Schema.optional(TemplateGraph),
  templateIdentity: Schema.optional(Schema.String.check(Schema.isMaxLength(128000))),
  jobId: Schema.NonEmptyString,
  document: ResumeDocument,
  theme: Theme,
});
export type CompileRequest = typeof CompileRequest.Type;

export const ExtractRequest = Schema.Struct({
  type: Schema.Literal("extract-source"),
  jobId: Schema.NonEmptyString,
  mime: Schema.Literals([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
  ]),
  contentBase64: Schema.NonEmptyString,
});

export const ValidationRequest = Schema.Struct({
  ...CompileRequest.fields,
  type: Schema.Literal("validate-template"),
});
export const SourceCompileRequest = Schema.Struct({
  type: Schema.Literal("compile-source"),
  jobId: Schema.NonEmptyString,
  source: Schema.NonEmptyString.check(Schema.isMaxLength(250_000)),
  intendedText: IntendedTextManifest,
  baseTemplateIdentity: Schema.NonEmptyString.check(Schema.isMaxLength(128000)),
});
export type SourceCompileRequest = typeof SourceCompileRequest.Type;
export const DocumentJob = Schema.Union([
  CompileRequest,
  ExtractRequest,
  ValidationRequest,
  SourceCompileRequest,
]);
export type DocumentJob = typeof DocumentJob.Type;

export const TextSegment = Schema.Struct({
  text: Schema.String,
  start: Schema.Int,
  end: Schema.Int,
  page: Schema.optional(Schema.Int),
  line: Schema.optional(Schema.Int),
});
export const ExtractionResult = Schema.Struct({
  type: Schema.Literal("extracted"),
  text: Schema.String,
  segments: Schema.Array(TextSegment),
  parser: Schema.String,
  parserVersion: Schema.String,
});
export type ExtractionResult = typeof ExtractionResult.Type;

export const SourceMime = ExtractRequest.fields.mime;
export const CreateSourceRequest = Schema.Struct({
  ...AiSelectionFields,
  idempotencyKey: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
  title: Schema.NonEmptyString.check(Schema.isMaxLength(200)),
  filename: Schema.NonEmptyString.check(Schema.isMaxLength(200)),
  mime: SourceMime,
  kind: Schema.Literals(["document", "pasted", "structured", "attestation"]),
  provenanceUrl: Schema.NullOr(Schema.String.check(Schema.isMaxLength(2048))),
  note: Schema.String.check(Schema.isMaxLength(4000)),
  contentBase64: Schema.NonEmptyString.check(Schema.isMaxLength(13_981_016)),
});
export type CreateSourceRequest = typeof CreateSourceRequest.Type;
export const SourceIdentity = Schema.Struct({ id: Schema.String.check(Schema.isUUID(7)) });
export const InspectSourceRequest = Schema.Struct({
  ...SourceIdentity.fields,
  processingId: Schema.optional(Schema.String.check(Schema.isUUID(7))),
});
export const RetrySourceRequest = Schema.Struct({
  ...SourceIdentity.fields,
  revision: Revision,
  idempotencyKey: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
});
export type RetrySourceRequest = typeof RetrySourceRequest.Type;
export const ResumeSourceRequest = Schema.Struct({
  ...RetrySourceRequest.fields,
  contentBase64: CreateSourceRequest.fields.contentBase64,
});
export type ResumeSourceRequest = typeof ResumeSourceRequest.Type;

export { ValidationReport } from "@river/templates";
export const DocumentResources = Schema.Struct({
  compiler: Schema.NonEmptyString,
  bundle: Schema.NonEmptyString,
  fonts: Schema.NonEmptyString,
  cacheDigest: Schema.NonEmptyString,
});
export const CompiledResult = Schema.Struct({
  type: Schema.Literal("compiled"),
  templateIdentity: Schema.optional(Schema.String),
  pdfBase64: Schema.NonEmptyString,
  tex: Schema.NonEmptyString,
  extractedText: Schema.String,
  validation: ValidationReport,
  fingerprint: Schema.String,
  durationMs: Schema.Number,
  rendererVersion: Schema.String,
  resources: DocumentResources,
});
export type CompiledResult = typeof CompiledResult.Type;
export const DocumentResult = Schema.Union([CompiledResult, ExtractionResult]);
export type DocumentResult = typeof DocumentResult.Type;

export const StartProofRequest = Schema.Struct({
  idempotencyKey: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
  theme: Theme,
});
export type StartProofRequest = typeof StartProofRequest.Type;

export const CancelOperationRequest = Schema.Struct({
  operationId: Schema.NonEmptyString,
  idempotencyKey: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
});

export const CreateCredentialRequest = Schema.Struct({
  id: Schema.String.check(Schema.isUUID(7)),
  idempotencyKey: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
  name: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
  secretHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  scopes: Schema.Array(AgentScope).check(Schema.isMinLength(1), Schema.isMaxLength(9)),
  expiresInDays: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 365 }))),
});
export type CreateCredentialRequest = typeof CreateCredentialRequest.Type;
export const RevokeCredentialRequest = Schema.Struct({
  id: Schema.String.check(Schema.isUUID(7)),
  revision: Revision,
  idempotencyKey: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
});
export type RevokeCredentialRequest = typeof RevokeCredentialRequest.Type;

export interface ArtifactManifest {
  readonly pdf: string;
  readonly tex: string;
  readonly text: string;
  readonly report: string;
  readonly fingerprint: string;
  readonly durationMs: number;
  readonly resources?: typeof DocumentResources.Type;
  readonly rendererVersion?: string;
  readonly validationPassed?: boolean;
  readonly expiresAt?: number;
  readonly templateIdentity?: string;
  readonly objectDigests?: {
    readonly pdf: string;
    readonly tex: string;
    readonly text: string;
    readonly report: string;
  };
}

export interface OperationView {
  readonly id: string;
  readonly state: "Pending" | "Running" | "Succeeded" | "Failed" | "Cancelled";
  readonly stage: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly failure: string | null;
  readonly artifacts: ArtifactManifest | null;
}

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly traceId: string;
  readonly expectedRevision?: number;
  readonly observedRevision?: number;
}

export * from "./admin";
export * from "./ai";
export * from "./backups";
export * from "./checkpoints";
export * from "./composition";
export * from "./duplicate-ai";
export * from "./evidence";
export * from "./job-ai";
export * from "./jobs";
export * from "./library";
export * from "./refinement";
export * from "./scoring";
export * from "./source-ai";
export * from "./template-scoring";
export * from "./template-studio";
export * from "./trash";
export * from "./wording";
