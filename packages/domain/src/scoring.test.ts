import { describe, expect, it } from "vitest";
import {
  type ComparableScores,
  compareScoringResults,
  type ScoringIdentity,
  scoringPlatforms,
  scoringPreflight,
  validateScoringResponse,
} from "./scoring";

const identity: ScoringIdentity = {
  schemaVersion: "ats-scoring-identity-v1",
  mode: "full-score",
  rubric: { version: "ats-full-score-v1", digest: "a".repeat(64) },
  deployment: { buildId: "synthetic-build", version: "0.5.1", commit: null, environment: "test" },
  capabilityVersion: "ats-analyze-text-v1",
  provider: "synthetic-provider",
  vendor: "google",
  model: { requested: "model-alias", reported: "model-revision", fingerprint: null },
  requestConfigurationDigest: "b".repeat(64),
};
function response(score = 75) {
  return {
    results: scoringPlatforms.map((system) => ({
      system,
      vendor: "Synthetic vendor",
      overallScore: score,
      passesFilter: true,
      breakdown: {
        formatting: { score, issues: [], details: [] },
        keywordMatch: { score, matched: [], missing: [], synonymMatched: [] },
        sections: { score, present: [], missing: [] },
        experience: {
          score,
          quantifiedBullets: 1,
          totalBullets: 2,
          actionVerbCount: 2,
          highlights: [],
        },
        education: { score, notes: [] },
      },
      suggestions: [
        {
          summary: "Review this synthetic finding",
          details: ["Full synthetic detail"],
          impact: "low",
          platforms: [system],
        },
      ],
    })),
    _provider: identity.provider,
    _fallback: false,
    _cached: false,
    _scoringIdentity: identity,
    _inputCoverage: {
      units: "utf16-code-units",
      resumeText: { submitted: 6, analyzed: 6 },
      jobDescription: { submitted: 3, analyzed: 3 },
      complete: true,
    },
  };
}
const validate = (raw: unknown) => validateScoringResponse(raw, "Résumé", "Job");

describe("exact-input scoring", () => {
  it("counts UTF-16 units and blocks oversized or empty text without rewriting it", () => {
    expect(scoringPreflight("a".repeat(6000), "j".repeat(4000)).allowed).toBe(true);
    const oversized = scoringPreflight(`${"a".repeat(5999)}😀`, "j".repeat(4001));
    expect(oversized.allowed).toBe(false);
    expect(oversized.inputs.map((input) => input.characters)).toEqual([6001, 4001]);
    expect(scoringPreflight(" \n", "Job").allowed).toBe(false);
    expect(scoringPreflight("Résumé", "").allowed).toBe(false);
    expect(() => validateScoringResponse(response(), "x".repeat(6001), "Job")).toThrow("complete");
  });
  it("requires all six unique complete simulations and rejects fabricated numeric defaults", () => {
    expect(validate(response()).results).toHaveLength(6);
    const raw = response();
    for (const results of [
      raw.results.slice(1),
      [...raw.results, raw.results[0]],
      raw.results.map((result) => ({ ...result, system: "Workday" })),
      raw.results.map((result) => ({ ...result, overallScore: 101 })),
      raw.results.map((result) => ({ ...result, passesFilter: "true" })),
      raw.results.map((result) => ({ ...result, breakdown: {} })),
      raw.results.map((result) => ({
        ...result,
        breakdown: {
          ...result.breakdown,
          experience: { ...result.breakdown.experience, quantifiedBullets: 3 },
        },
      })),
    ])
      expect(() => validate({ ...raw, results })).toThrow();
  });
  it("checks response coverage and provider attribution while retaining missing legacy metadata", () => {
    const raw = response();
    expect(() => validate({ ...raw, _provider: "different" })).toThrow("disagree");
    expect(() =>
      validate({ ...raw, _inputCoverage: { ...raw._inputCoverage, complete: false } }),
    ).toThrow("complete");
    expect(() =>
      validate({
        ...raw,
        _inputCoverage: { ...raw._inputCoverage, resumeText: { submitted: 6, analyzed: 5 } },
      }),
    ).toThrow("complete");
    const { _scoringIdentity: _identity, _inputCoverage: _coverage, ...legacy } = raw;
    expect(validate(legacy).results).toHaveLength(6);
    expect(validate(legacy)._scoringIdentity).toBeUndefined();
  });
});

it("compares reported identities only for the same provider, adapter and job snapshot", () => {
  const before: ComparableScores = {
    providerUrl: "https://example.test",
    adapterVersion: "adapter-v1",
    snapshotId: "snapshot-a",
    response: validate(response()),
  };
  const after: ComparableScores = {
    ...before,
    response: validate({ ...response(80), _cached: true }),
  };
  expect(compareScoringResults(before, after)).toMatchObject({
    compatible: true,
    reasons: [],
    deltas: scoringPlatforms.map((system) => ({
      system,
      before: 75,
      after: 80,
      change: 5,
      passedBefore: true,
      passedAfter: true,
    })),
  });
  for (const incompatible of [
    { ...after, snapshotId: "snapshot-b" },
    { ...after, providerUrl: "https://another.example.test" },
    { ...after, adapterVersion: "adapter-v2" },
    { ...after, response: { ...after.response, _scoringIdentity: null } },
    { ...after, response: { ...after.response, _inputCoverage: null } },
    ...[
      { ...identity, model: { ...identity.model, reported: null } },
      { ...identity, model: { ...identity.model, fingerprint: "different-backend" } },
      { ...identity, rubric: { ...identity.rubric, digest: "c".repeat(64) } },
      { ...identity, deployment: { ...identity.deployment, buildId: "different-build" } },
      { ...identity, requestConfigurationDigest: "d".repeat(64) },
    ].map((changed) => ({ ...after, response: { ...after.response, _scoringIdentity: changed } })),
  ]) {
    const compared = compareScoringResults(before, incompatible);
    expect(compared.compatible).toBe(false);
    expect(compared.deltas).toBeNull();
    expect(compared.reasons.length).toBeGreaterThan(0);
  }
});
