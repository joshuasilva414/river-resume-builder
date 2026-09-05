import {
  ATS_ADAPTER_VERSION,
  type AtsScoringResponse,
  canonicalJson,
  fingerprint,
  scoringPreflight,
  scoringProfile,
  validateScoringResponse,
} from "@river/domain";
import { Schema } from "effect";
import { captureAtsFixtureSet } from "./ats-fixtures";
import {
  CUSTOM_RENDERER_VERSION,
  GRAPH_VALIDATOR_VERSION,
  graphInventory,
  type TemplateGraph,
} from "./graph";
import { validateText } from "./index";
import { ValidationReport } from "./validation-report";

export const ATS_QUALIFICATION_POLICY = "river-template-ats-qualification-v1";
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const Label = Schema.NonEmptyString.check(Schema.isMaxLength(300));

/** Completed fixture evidence only. Failed attempts remain in run history and cannot qualify. */
export const AtsFixtureScoringEvidence = Schema.Struct({
  fixtureId: Label,
  runId: Label,
  documentDigest: Digest,
  artifactFingerprint: Digest,
  reportDigest: Digest,
  resourcesDigest: Digest,
  templateIdentity: Schema.NonEmptyString.check(Schema.isMaxLength(128000)),
  rendererVersion: Label,
  providerUrl: Label,
  adapterVersion: Label,
  resumeText: Schema.String.check(Schema.isMaxLength(100000)),
  jobDescription: Schema.String.check(Schema.isMaxLength(100000)),
  validationJson: Schema.String.check(Schema.isMaxLength(1048576)),
  rawResponseJson: Schema.String.check(Schema.isMaxLength(262144)),
});
export type AtsFixtureScoringEvidence = typeof AtsFixtureScoringEvidence.Type;

type FixtureDecision = {
  fixtureId: string;
  name: string;
  runId: string | null;
  passed: boolean;
  issues: string[];
  response: AtsScoringResponse | null;
  resultDigest: string | null;
};

/** Evaluate retained evidence for one exact graph. This never submits scores or averages platforms. */
export async function qualifyAtsTemplate(
  graph: TemplateGraph,
  fixtureSetDigest: string,
  evidence: readonly AtsFixtureScoringEvidence[],
) {
  const set = await captureAtsFixtureSet(),
    templateIdentity = canonicalJson(graphInventory(graph)),
    graphDigest = await fingerprint(canonicalJson(graph));
  const issues: string[] = [];
  if (fixtureSetDigest !== set.digest)
    issues.push("The captured canonical fixture set differs from this qualification version.");
  const required = new Set<string>(set.fixtures.map((fixture) => fixture.id));
  if (!required.size || evidence.some((item) => !required.has(item.fixtureId)))
    issues.push("The qualification contains an unknown fixture or no required fixtures.");
  if (new Set(evidence.map((item) => item.runId)).size !== evidence.length)
    issues.push("A scoring run was reused for more than one fixture.");
  const fixtures: FixtureDecision[] = [];
  let commonIdentity: string | null = null,
    commonEndpoint: string | null = null,
    commonResources: string | null = null;
  for (const fixture of set.fixtures) {
    const matches = evidence.filter((item) => item.fixtureId === fixture.id);
    const decision: FixtureDecision = {
      fixtureId: fixture.id,
      name: fixture.name,
      runId: null,
      passed: false,
      issues: [],
      response: null,
      resultDigest: null,
    };
    fixtures.push(decision);
    if (matches.length !== 1) {
      decision.issues.push(
        matches.length
          ? "Multiple completed runs were selected for this fixture."
          : "A completed scoring run is missing.",
      );
      continue;
    }
    let item: AtsFixtureScoringEvidence;
    try {
      item = Schema.decodeUnknownSync(AtsFixtureScoringEvidence)(matches[0]);
      scoringProfile(item.providerUrl);
    } catch {
      decision.issues.push("The retained fixture evidence is malformed.");
      continue;
    }
    decision.runId = item.runId;
    if (
      item.documentDigest !== fixture.documentDigest ||
      item.jobDescription !== fixture.jobDescription
    )
      decision.issues.push("The submitted fixture or job differs from the exact canonical input.");
    if (
      item.templateIdentity !== templateIdentity ||
      item.rendererVersion !== CUSTOM_RENDERER_VERSION
    )
      decision.issues.push("The document belongs to a different graph or renderer.");
    if (item.adapterVersion !== ATS_ADAPTER_VERSION)
      decision.issues.push("The scoring adapter is incompatible with this qualification version.");
    const checked = validateText(fixture.document, item.resumeText);
    let report: ValidationReport;
    try {
      report = Schema.decodeUnknownSync(ValidationReport)(JSON.parse(item.validationJson));
    } catch {
      decision.issues.push("The retained document validation report is malformed.");
      continue;
    }
    if (
      !checked.passed ||
      !report.passed ||
      report.expectedText !== checked.expectedText ||
      report.extractedText !== item.resumeText ||
      report.normalization !== checked.normalization ||
      !report.locations ||
      canonicalJson(report.locations) !== canonicalJson(checked.locations) ||
      !report.checks?.completeness ||
      !report.checks.multiplicity ||
      !report.checks.readingOrder ||
      !report.pageCount ||
      report.pageCount < 1 ||
      report.pageCount > 100 ||
      report.errors.length ||
      item.reportDigest !== (await fingerprint(item.validationJson))
    )
      decision.issues.push(
        "The complete local document validation does not match this fixture and text.",
      );
    if (!scoringPreflight(item.resumeText, item.jobDescription).allowed) {
      decision.issues.push(
        "The complete input exceeds scoring limits or is empty; excerpts cannot qualify.",
      );
      continue;
    }
    try {
      decision.response = validateScoringResponse(
        JSON.parse(item.rawResponseJson),
        item.resumeText,
        item.jobDescription,
      );
      decision.resultDigest = await fingerprint(item.rawResponseJson);
    } catch {
      decision.issues.push(
        "The provider response is malformed or does not confirm the submitted input.",
      );
      continue;
    }
    const response = decision.response;
    if (!response._inputCoverage?.complete)
      decision.issues.push("The result has no complete-input confirmation.");
    if (!response._scoringIdentity?.model.reported)
      decision.issues.push("The result has no complete reported scoring identity.");
    else {
      const identity = canonicalJson(response._scoringIdentity);
      if (commonIdentity !== null && commonIdentity !== identity)
        issues.push(
          "Required fixtures have incompatible rubric, model, deployment or request identities.",
        );
      commonIdentity ??= identity;
    }
    const endpoint = canonicalJson({ origin: item.providerUrl, adapter: item.adapterVersion });
    if (commonEndpoint !== null && commonEndpoint !== endpoint)
      issues.push("Required fixtures use different provider endpoints or adapters.");
    commonEndpoint ??= endpoint;
    if (commonResources !== null && commonResources !== item.resourcesDigest)
      issues.push("Document resources differ across required fixtures.");
    commonResources ??= item.resourcesDigest;
    if (response.results.some((result) => !result.passesFilter))
      decision.issues.push("At least one of the six provider simulations did not pass.");
    decision.passed = decision.issues.length === 0;
  }
  return {
    policy: ATS_QUALIFICATION_POLICY,
    fixtureSetVersion: set.version,
    fixtureSetDigest: set.digest,
    graphDigest,
    templateIdentity,
    renderer: CUSTOM_RENDERER_VERSION,
    validator: GRAPH_VALIDATOR_VERSION,
    qualified: issues.length === 0 && fixtures.length > 0 && fixtures.every((item) => item.passed),
    issues: [...new Set(issues)],
    fixtures,
  };
}
