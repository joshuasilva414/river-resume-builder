import { type AtsScoringResponse, scoringPlatforms } from "@river/domain";
import type { ScoringProviderVersion } from "../../src/server/scoring-provider";

export const syntheticScoringVersion: ScoringProviderVersion = {
  version: "0.5.1",
  commit: "dev",
  branch: null,
  env: "test",
  deployment: { buildId: "observed-build", version: "0.5.1", commit: null, environment: "test" },
  scoring: {
    version: "ats-analyze-text-v1",
    units: "utf16-code-units",
    identitySchema: "ats-scoring-identity-v1",
    accepted: { resumeText: 50000, jobDescription: 20000 },
    effective: { resumeText: 6000, jobDescription: 4000 },
    truncatesOversizedInput: true,
    simulations: scoringPlatforms,
    rubric: { version: "ats-full-score-v1", digest: "a".repeat(64) },
  },
};
export function syntheticScoringResponse(input: {
  resumeText: string;
  jobDescription: string;
}): AtsScoringResponse {
  return {
    _provider: "synthetic-provider",
    _fallback: false,
    _cached: false,
    _scoringIdentity: {
      schemaVersion: "ats-scoring-identity-v1",
      mode: "full-score",
      rubric: { version: "ats-full-score-v1", digest: "a".repeat(64) },
      deployment: {
        buildId: "actual-result-build",
        version: "0.5.1",
        commit: null,
        environment: "test",
      },
      capabilityVersion: "ats-analyze-text-v1",
      provider: "synthetic-provider",
      vendor: "google",
      model: {
        requested: "synthetic-alias",
        reported: "synthetic-model-revision",
        fingerprint: null,
      },
      requestConfigurationDigest: "b".repeat(64),
    },
    _inputCoverage: {
      units: "utf16-code-units",
      complete: true,
      resumeText: { submitted: input.resumeText.length, analyzed: input.resumeText.length },
      jobDescription: {
        submitted: input.jobDescription.length,
        analyzed: input.jobDescription.length,
      },
    },
    results: scoringPlatforms.map((system) => ({
      system,
      vendor: "Synthetic vendor",
      overallScore: 75,
      passesFilter: true,
      breakdown: {
        formatting: { score: 75, issues: [], details: [] },
        keywordMatch: { score: 75, matched: [], missing: [], synonymMatched: [] },
        sections: { score: 75, present: [], missing: [] },
        experience: {
          score: 75,
          quantifiedBullets: 1,
          totalBullets: 1,
          actionVerbCount: 1,
          highlights: [],
        },
        education: { score: 75, notes: [] },
      },
      suggestions: [
        {
          summary: "Review a synthetic finding",
          details: ["Complete synthetic explanation."],
          impact: "low",
          platforms: [system],
        },
      ],
    })),
  };
}
