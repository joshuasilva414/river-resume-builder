import { Schema } from "effect";
import { ApplicationError, canonicalJson, fingerprint } from "./core";

export const scoringPlatforms = [
  "Workday",
  "Taleo",
  "iCIMS",
  "Greenhouse",
  "Lever",
  "SuccessFactors",
] as const;
export const ScoringPlatform = Schema.Literals(scoringPlatforms);
export type ScoringPlatform = typeof ScoringPlatform.Type;
export const ATS_ADAPTER_VERSION = "river-ats-screener-v1";
export const SCORING_COMPARISON_POLICY = "river-reported-scoring-identity-v1";
export const scoringLimits = { resumeText: 6000, jobDescription: 4000 } as const;
const Label = Schema.NonEmptyString.check(Schema.isMaxLength(300));
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const Score = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 }));
const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100000 }));
const Passage = Schema.NonEmptyString.check(Schema.isMaxLength(10000));
const Passages = Schema.Array(Passage).check(Schema.isMaxLength(100));

export const ScoringIdentity = Schema.Struct({
  schemaVersion: Schema.Literal("ats-scoring-identity-v1"),
  mode: Schema.Literal("full-score"),
  rubric: Schema.Struct({ version: Label, digest: Digest }),
  deployment: Schema.Struct({
    buildId: Label,
    version: Label,
    commit: Schema.NullOr(Label),
    environment: Label,
  }),
  capabilityVersion: Schema.Literal("ats-analyze-text-v1"),
  provider: Label,
  vendor: Schema.Literals(["google", "groq", "cerebras", "ollama"]),
  model: Schema.Struct({
    requested: Label,
    reported: Schema.NullOr(Label),
    fingerprint: Schema.NullOr(Label),
  }),
  requestConfigurationDigest: Digest,
});
export type ScoringIdentity = typeof ScoringIdentity.Type;
export const ScoringCoverage = Schema.Struct({
  units: Schema.Literal("utf16-code-units"),
  resumeText: Schema.Struct({ submitted: Count, analyzed: Count }),
  jobDescription: Schema.Struct({ submitted: Count, analyzed: Count }),
  complete: Schema.Boolean,
});
export type ScoringCoverage = typeof ScoringCoverage.Type;
export const ScoringSuggestion = Schema.Union([
  Passage,
  Schema.Struct({
    summary: Passage,
    details: Passages,
    impact: Schema.Literals(["critical", "high", "medium", "low"]),
    platforms: Schema.Array(ScoringPlatform).check(Schema.isMinLength(1), Schema.isMaxLength(6)),
  }),
]);
export const PlatformScore = Schema.Struct({
  system: ScoringPlatform,
  vendor: Label,
  overallScore: Score,
  passesFilter: Schema.Boolean,
  breakdown: Schema.Struct({
    formatting: Schema.Struct({ score: Score, issues: Passages, details: Passages }),
    keywordMatch: Schema.Struct({
      score: Score,
      matched: Passages,
      missing: Passages,
      synonymMatched: Passages,
    }),
    sections: Schema.Struct({ score: Score, present: Passages, missing: Passages }),
    experience: Schema.Struct({
      score: Score,
      quantifiedBullets: Count,
      totalBullets: Count,
      actionVerbCount: Count,
      highlights: Passages,
    }),
    education: Schema.Struct({ score: Score, notes: Passages }),
  }),
  suggestions: Schema.Array(ScoringSuggestion).check(Schema.isMaxLength(50)),
});
export type PlatformScore = typeof PlatformScore.Type;
export const AtsScoringResponse = Schema.Struct({
  results: Schema.Array(PlatformScore).check(Schema.isMinLength(6), Schema.isMaxLength(6)),
  _provider: Label,
  _fallback: Schema.Literal(false),
  _cached: Schema.Boolean,
  _scoringIdentity: Schema.optional(Schema.NullOr(ScoringIdentity)),
  _inputCoverage: Schema.optional(Schema.NullOr(ScoringCoverage)),
});
export type AtsScoringResponse = typeof AtsScoringResponse.Type;

// The provider also uses SAP's full product name. Canonicalize only that known alias;
// the domain validator still enforces bounds and unique simulations after decoding.
const ProviderPlatform = Schema.Union([
  ScoringPlatform,
  Schema.Literal("SAP SuccessFactors").transform("SuccessFactors"),
]);
const ProviderResponse = Schema.Struct({
  ...AtsScoringResponse.fields,
  results: Schema.Array(
    Schema.Struct({
      ...PlatformScore.fields,
      system: ProviderPlatform,
      suggestions: Schema.Array(
        Schema.Union([
          ScoringSuggestion.members[0],
          Schema.Struct({
            ...ScoringSuggestion.members[1].fields,
            platforms: Schema.Array(ProviderPlatform),
          }),
        ]),
      ),
    }),
  ),
});

export const ScoringFindingOutcome = Schema.Literals(["Addressed", "Accepted", "Not applicable"]);
export type ScoringFindingOutcome = typeof ScoringFindingOutcome.Type;

/** Decisions address exact provider suggestions; dimensional facts remain unchanged report data. */
export async function scoringFindings(
  response: AtsScoringResponse,
  resultDigest: string,
  runId: string,
) {
  return Promise.all(
    response.results.flatMap((result) =>
      result.suggestions.map(async (suggestion, index) => ({
        platform: result.system,
        index,
        suggestion,
        digest: await fingerprint(
          canonicalJson({ runId, resultDigest, platform: result.system, index, suggestion }),
        ),
      })),
    ),
  );
}

/** Measure exact saved strings. Trimming is used only to detect empty input, never to submit excerpts. */
export function scoringPreflight(resumeText: string, jobDescription: string) {
  const inputs = [
    { field: "resumeText" as const, label: "Résumé text", text: resumeText },
    { field: "jobDescription" as const, label: "Job description", text: jobDescription },
  ].map(({ field, label, text }) => ({
    field,
    label,
    characters: text.length,
    limit: scoringLimits[field],
    issue: !text.trim()
      ? "Required input is empty"
      : text.length > scoringLimits[field]
        ? "The provider would truncate this input"
        : null,
  }));
  return {
    allowed: inputs.every((input) => input.issue === null),
    units: "utf16-code-units" as const,
    inputs,
  };
}

/** A partial platform set or contradictory coverage is a failed run, never a collection of zero scores. */
export function validateScoringResponse(raw: unknown, resumeText: string, jobDescription: string) {
  if (!scoringPreflight(resumeText, jobDescription).allowed)
    throw new ApplicationError({
      code: "InvalidInput",
      message:
        "Scoring requires complete résumé and job text within the provider's effective limits.",
    });
  const normalized = Schema.decodeUnknownSync(ProviderResponse)(raw);
  const value = Schema.decodeUnknownSync(AtsScoringResponse)(normalized);
  if (new Set(value.results.map((result) => result.system)).size !== scoringPlatforms.length)
    throw new Error("The score provider did not return all six unique simulations.");
  for (const result of value.results) {
    if (result.breakdown.experience.quantifiedBullets > result.breakdown.experience.totalBullets)
      throw new Error("The score provider returned contradictory bullet counts.");
    for (const suggestion of result.suggestions)
      if (
        typeof suggestion !== "string" &&
        new Set(suggestion.platforms).size !== suggestion.platforms.length
      )
        throw new Error("A suggestion repeats a simulation identity.");
  }
  if (value._scoringIdentity && value._scoringIdentity.provider !== value._provider)
    throw new Error("The winning provider and scoring identity disagree.");
  const coverage = value._inputCoverage;
  if (
    coverage &&
    (!coverage.complete ||
      coverage.resumeText.submitted !== resumeText.length ||
      coverage.resumeText.analyzed !== resumeText.length ||
      coverage.jobDescription.submitted !== jobDescription.length ||
      coverage.jobDescription.analyzed !== jobDescription.length)
  )
    throw new Error("The score provider did not confirm complete submitted input.");
  return value;
}

export interface ComparableScores {
  readonly providerUrl: string;
  readonly adapterVersion: string;
  readonly snapshotId: string;
  readonly response: AtsScoringResponse;
}
/** Equality refers to reported scoring identities. It does not assert immutable provider model weights. */
export function compareScoringResults(before: ComparableScores, after: ComparableScores) {
  const reasons: string[] = [];
  if (before.providerUrl !== after.providerUrl || before.adapterVersion !== after.adapterVersion)
    reasons.push("The provider endpoint or adapter differs.");
  if (before.snapshotId !== after.snapshotId)
    reasons.push("The checkpoints use different job-posting snapshots.");
  const left = before.response._scoringIdentity,
    right = after.response._scoringIdentity;
  if (!left || !right) reasons.push("A result has no scoring identity.");
  else {
    if (!left.model.reported || !right.model.reported)
      reasons.push("A provider did not report its model identity.");
    if (canonicalJson(left) !== canonicalJson(right))
      reasons.push("The rubric, model, deployment or request configuration differs.");
  }
  if (!before.response._inputCoverage?.complete || !after.response._inputCoverage?.complete)
    reasons.push("A result has no complete-input confirmation.");
  const bySystem = new Map(before.response.results.map((result) => [result.system, result]));
  const deltas = reasons.length
    ? null
    : after.response.results.map((result) => {
        const prior = bySystem.get(result.system);
        if (!prior) throw new Error("A validated simulation is missing from the comparison.");
        return {
          system: result.system,
          before: prior.overallScore,
          after: result.overallScore,
          change: result.overallScore - prior.overallScore,
          passedBefore: prior.passesFilter,
          passedAfter: result.passesFilter,
        };
      });
  return { policy: SCORING_COMPARISON_POLICY, compatible: reasons.length === 0, reasons, deltas };
}

const CapabilityCount = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000000 }));
export const ScoringProviderVersion = Schema.Struct({
  version: Label,
  commit: Schema.String.check(Schema.isMaxLength(300)),
  branch: Schema.NullOr(Label),
  env: Label,
  deployment: Schema.optional(
    Schema.Struct({
      buildId: Label,
      version: Label,
      commit: Schema.NullOr(Label),
      environment: Label,
    }),
  ),
  scoring: Schema.optional(
    Schema.Struct({
      version: Schema.Literal("ats-analyze-text-v1"),
      units: Schema.Literal("utf16-code-units"),
      identitySchema: Schema.Literal("ats-scoring-identity-v1"),
      accepted: Schema.Struct({ resumeText: CapabilityCount, jobDescription: CapabilityCount }),
      effective: Schema.Struct({ resumeText: CapabilityCount, jobDescription: CapabilityCount }),
      truncatesOversizedInput: Schema.Boolean,
      simulations: Schema.Array(Label).check(Schema.isMinLength(6), Schema.isMaxLength(6)),
      rubric: Schema.Struct({
        version: Label,
        digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
      }),
    }),
  ),
});
export type ScoringProviderVersion = typeof ScoringProviderVersion.Type;

export function scoringProfile(origin: string) {
  const url = new URL(origin);
  if (url.origin !== origin || url.protocol !== "https:" || url.username || url.password)
    throw new Error("The scoring provider must be an HTTPS origin without credentials or a path.");
  return {
    origin,
    adapterVersion: ATS_ADAPTER_VERSION,
    timeoutMs: 65000,
    maxResponseBytes: 262144,
  } as const;
}
export type ScoringProfile = ReturnType<typeof scoringProfile>;
