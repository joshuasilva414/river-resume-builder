import { AgentScope, Revision } from "@river/domain";
import { Schema } from "effect";
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

export const SourceIdentity = Schema.Struct({ id: Schema.String.check(Schema.isUUID()) });
export const InspectSourceRequest = Schema.Struct({
  ...SourceIdentity.fields,
  processingId: Schema.optional(Schema.String.check(Schema.isUUID(7))),
});
export const CreateCredentialRequest = Schema.Struct({
  id: Schema.String.check(Schema.isUUID(7)),
  idempotencyKey: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
  name: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
  secretHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  scopes: Schema.Array(AgentScope).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
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
  readonly resources?: {
    readonly compiler: string;
    readonly bundle: string;
    readonly fonts: string;
    readonly cacheDigest: string;
  };
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
export * from "./common";
export * from "./feedback";
