import {
  ATS_ADAPTER_VERSION,
  type AtsScoringResponse,
  canonicalJson,
  contentTypes,
  fingerprint,
  type ScoringIdentity,
  scoringPlatforms,
  scoringPreflight,
} from "@river/domain";
import { describe, expect, it } from "vitest";
import { atsFixtures, captureAtsFixtureSet } from "./ats-fixtures";
import { type AtsFixtureScoringEvidence, qualifyAtsTemplate } from "./ats-qualification";
import { CUSTOM_RENDERER_VERSION, graphInventory, validateGraph } from "./graph";
import { composeGraph, expectedText, validateText } from "./index";
import { fixedPack } from "./manifests";

const graph = validateGraph(fixedPack("classic"));
const identity: ScoringIdentity = {
  schemaVersion: "ats-scoring-identity-v1",
  mode: "full-score",
  rubric: { version: "synthetic-rubric", digest: "a".repeat(64) },
  deployment: { buildId: "synthetic-build", version: "1", commit: null, environment: "test" },
  capabilityVersion: "ats-analyze-text-v1",
  provider: "synthetic-provider",
  vendor: "google",
  model: { requested: "synthetic-model", reported: "synthetic-model-version", fingerprint: null },
  requestConfigurationDigest: "b".repeat(64),
};
function response(resumeText: string, jobDescription: string): AtsScoringResponse {
  return {
    results: scoringPlatforms.map((system) => ({
      system,
      vendor: "Synthetic vendor",
      overallScore: 90,
      passesFilter: true,
      breakdown: {
        formatting: { score: 90, issues: [], details: [] },
        keywordMatch: { score: 90, matched: [], missing: [], synonymMatched: [] },
        sections: { score: 90, present: [], missing: [] },
        experience: {
          score: 90,
          quantifiedBullets: 1,
          totalBullets: 2,
          actionVerbCount: 2,
          highlights: [],
        },
        education: { score: 90, notes: [] },
      },
      suggestions: ["Inspect this complete synthetic finding."],
    })),
    _provider: identity.provider,
    _fallback: false,
    _cached: false,
    _scoringIdentity: identity,
    _inputCoverage: {
      units: "utf16-code-units",
      resumeText: { submitted: resumeText.length, analyzed: resumeText.length },
      jobDescription: { submitted: jobDescription.length, analyzed: jobDescription.length },
      complete: true,
    },
  };
}
async function completeEvidence() {
  const set = await captureAtsFixtureSet();
  const evidence: AtsFixtureScoringEvidence[] = await Promise.all(
    set.fixtures.map(async (fixture) => {
      const resumeText = `${expectedText(fixture.document)}\n`;
      const validationJson = JSON.stringify({
        ...validateText(fixture.document, resumeText),
        pageCount: 1,
      });
      return {
        fixtureId: fixture.id,
        runId: `run-${fixture.id}`,
        documentDigest: fixture.documentDigest,
        artifactFingerprint: await fingerprint(fixture.id),
        reportDigest: await fingerprint(validationJson),
        resourcesDigest: "c".repeat(64),
        templateIdentity: canonicalJson(graphInventory(graph)),
        rendererVersion: CUSTOM_RENDERER_VERSION,
        providerUrl: "https://example.test",
        adapterVersion: ATS_ADAPTER_VERSION,
        resumeText,
        jobDescription: fixture.jobDescription,
        validationJson,
        rawResponseJson: JSON.stringify(response(resumeText, fixture.jobDescription)),
      };
    }),
  );
  return { set, evidence };
}

describe("canonical synthetic ATS qualification", () => {
  it("captures deterministic complete inputs covering all types without using candidate data", async () => {
    const first = await captureAtsFixtureSet();
    expect(await captureAtsFixtureSet()).toEqual(first);
    // This pins the complete fixture contract; changing inputs requires a reviewed set version.
    expect([first.version, first.digest]).toEqual([
      "river-ats-fixtures-v1",
      "40f60e80ba854e4686ec6a4b307cdc8984df2731976d203d3c0551d4f2e1f9ba",
    ]);
    expect(first.fixtures.map((fixture) => fixture.id)).toEqual([
      "graduate-web",
      "experienced-platform",
      "unicode-application",
    ]);
    const covered = new Set([
      "contact",
      ...atsFixtures.flatMap((fixture) => fixture.document.sections.map((section) => section.type)),
    ]);
    expect([...covered].sort()).toEqual([...contentTypes].sort());
    for (const fixture of first.fixtures) {
      expect(fixture.jobDescription).toMatch(/^Synthetic vacancy:/);
      expect(scoringPreflight(expectedText(fixture.document), fixture.jobDescription).allowed).toBe(
        true,
      );
      expect(fixture.documentDigest).toBe(await fingerprint(canonicalJson(fixture.document)));
      expect(fixture.jobDescriptionDigest).toBe(await fingerprint(fixture.jobDescription));
      for (const theme of ["classic", "minimal", "technical"] as const)
        expect(composeGraph(fixture.document, validateGraph(fixedPack(theme))).tex).toContain(
          "\\begin{document}",
        );
    }
  });

  it("qualifies every exact fixture with six passes, preserving each different canonical job", async () => {
    const { set, evidence } = await completeEvidence();
    const result = await qualifyAtsTemplate(graph, set.digest, evidence);
    expect(result.qualified).toBe(true);
    expect(result.issues).toEqual([]);
    expect(
      result.fixtures.every((fixture) => fixture.passed && fixture.response?.results.length === 6),
    ).toBe(true);
    expect(new Set(evidence.map((fixture) => fixture.jobDescription)).size).toBe(3);
    expect(result.fixtures[0]?.response?.results[0]?.suggestions).toEqual([
      "Inspect this complete synthetic finding.",
    ]);
  });

  it("withholds qualification for absent, duplicate, substituted and differently bound evidence", async () => {
    const { set, evidence } = await completeEvidence();
    const first = evidence[0];
    if (!first) throw new Error("Fixture setup is empty");
    const changes: Partial<AtsFixtureScoringEvidence>[] = [
      { fixtureId: "not-canonical" },
      { runId: evidence[1]?.runId ?? "" },
      { documentDigest: "d".repeat(64) },
      { templateIdentity: "different-template" },
      { rendererVersion: "different-renderer" },
      { providerUrl: "https://another.example.test" },
      { adapterVersion: "different-adapter" },
      { resourcesDigest: "e".repeat(64) },
      { reportDigest: "f".repeat(64) },
      { resumeText: first.resumeText.replace("Alex Morgan", "Different Person") },
      { jobDescription: `${first.jobDescription} ` },
      { validationJson: "{}" },
    ];
    for (const change of changes)
      expect(
        (
          await qualifyAtsTemplate(graph, set.digest, [
            { ...first, ...change },
            ...evidence.slice(1),
          ])
        ).qualified,
        JSON.stringify(change),
      ).toBe(false);
    const incompleteReport = JSON.stringify({
      ...validateText(atsFixtures[0].document, first.resumeText),
      locations: undefined,
      pageCount: 1,
    });
    expect(
      (
        await qualifyAtsTemplate(graph, set.digest, [
          {
            ...first,
            validationJson: incompleteReport,
            reportDigest: await fingerprint(incompleteReport),
          },
          ...evidence.slice(1),
        ])
      ).qualified,
    ).toBe(false);
    for (const selection of [[], evidence.slice(1), [...evidence, first]])
      expect((await qualifyAtsTemplate(graph, set.digest, selection)).qualified).toBe(false);
    expect((await qualifyAtsTemplate(graph, "different-set", evidence)).qualified).toBe(false);
    const changed = { ...graph, tokens: { ...graph.tokens, bodySize: 11 } };
    expect((await qualifyAtsTemplate(changed, set.digest, evidence)).qualified).toBe(false);
  });

  it("rejects partial, failing and incompatible scores while retaining independently readable results", async () => {
    const { set, evidence } = await completeEvidence();
    const first = evidence[0];
    if (!first) throw new Error("Fixture setup is empty");
    const raw = response(first.resumeText, first.jobDescription);
    const invalid = [
      { ...raw, results: raw.results.slice(1) },
      { ...raw, results: raw.results.map((result) => ({ ...result, system: "Workday" })) },
      {
        ...raw,
        results: raw.results.map((result, index) => ({ ...result, passesFilter: index !== 2 })),
      },
      { ...raw, _scoringIdentity: null },
      { ...raw, _inputCoverage: null },
      { ...raw, _scoringIdentity: { ...identity, model: { ...identity.model, reported: null } } },
      {
        ...raw,
        _scoringIdentity: {
          ...identity,
          deployment: { ...identity.deployment, buildId: "new-build" },
        },
      },
    ];
    for (const value of invalid) {
      const result = await qualifyAtsTemplate(graph, set.digest, [
        { ...first, rawResponseJson: JSON.stringify(value) },
        ...evidence.slice(1),
      ]);
      expect(result.qualified).toBe(false);
      expect(result.fixtures[1]?.response?.results).toHaveLength(6);
    }
    const oversized = `${first.resumeText}${" ".repeat(6001)}`;
    const validationJson = JSON.stringify({
      ...validateText(atsFixtures[0].document, oversized),
      pageCount: 1,
    });
    const result = await qualifyAtsTemplate(graph, set.digest, [
      {
        ...first,
        resumeText: oversized,
        validationJson,
        reportDigest: await fingerprint(validationJson),
        rawResponseJson: JSON.stringify(response(oversized, first.jobDescription)),
      },
      ...evidence.slice(1),
    ]);
    expect(result.qualified).toBe(false);
    expect(result.fixtures[0]?.issues.join(" ")).toContain("excerpts cannot qualify");
  });
});
