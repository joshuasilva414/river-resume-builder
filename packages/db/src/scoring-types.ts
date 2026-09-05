import type { AtsScoringResponse, ScoringProviderVersion } from "@river/domain";

/** Exact retained input. Prepared once, before the first external submission. */
export interface ScoringInput {
  readonly resumeText: string;
  readonly jobDescription: string;
  readonly textKey: string;
  readonly textDigest: string;
  readonly snapshotDigest: string;
  readonly documentFingerprint: string;
  readonly rendererVersion: string;
  readonly submissionDigest: string;
}
export interface ScoringResult {
  readonly raw: unknown;
  readonly response: AtsScoringResponse;
  readonly digest: string;
  readonly operationId: string;
  readonly receivedAt: number;
}
export interface ScoringFailure {
  readonly code:
    | "RateLimited"
    | "Unavailable"
    | "Timeout"
    | "Cancelled"
    | "InvalidResponse"
    | "Incompatible"
    | "InvalidInput"
    | "DocumentUnavailable"
    | "Interrupted";
  readonly message: string;
  readonly retryAt: number | null;
}
export interface ScoringObservation {
  readonly version: ScoringProviderVersion;
  readonly observedAt: number;
}
