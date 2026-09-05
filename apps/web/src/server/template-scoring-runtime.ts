import { type ArtifactManifest, CompiledResult } from "@river/contracts";
import { createRepository, type TemplateScoringDocument } from "@river/db";
import { ApplicationError, canonicalJson, fingerprint, type ResumeDocument } from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  graphInventory,
  ValidationReport,
  validateText,
} from "@river/templates";
import { Schema } from "effect";
import { storeCompiledArtifacts } from "./compiled-artifacts";
import type { Env } from "./env";
import { inspectScoringProvider, scoreCheckpointText } from "./scoring-provider";

type RuntimeEnv = Pick<Env, "DB" | "ARTIFACTS" | "DOCUMENTS">;
const unavailable = () =>
  new ApplicationError({
    code: "InvalidInput",
    message:
      "The canonical fixture's retained document, text, or validation report failed verification. The designation is withheld.",
  });
const limits = { pdf: 20 * 1024 * 1024, tex: 1000000, text: 1000000, report: 1048576 };

/** Verify all four retained files, including their hashes, before submitting or qualifying. */
async function readFixtureArtifacts(
  bucket: R2Bucket,
  artifacts: ArtifactManifest,
  document: ResumeDocument,
) {
  if (!artifacts.objectDigests || artifacts.expiresAt || !artifacts.resources) throw unavailable();
  const read = async (kind: keyof typeof limits) => {
    const object = await bucket.get(artifacts[kind]);
    if (!object || object.size > limits[kind]) {
      await object?.body.cancel();
      throw unavailable();
    }
    const bytes = new Uint8Array(await object.arrayBuffer()),
      digest = await fingerprint(bytes);
    if (
      bytes.length !== object.size ||
      digest !== artifacts.objectDigests?.[kind] ||
      (object.customMetadata?.sha256 && object.customMetadata.sha256 !== digest)
    )
      throw unavailable();
    return kind === "pdf" ? "" : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  };
  // Keep the large PDF allocation separate from the three small text files.
  await read("pdf");
  await read("tex");
  const resumeText = await read("text"),
    validationJson = await read("report"),
    report = Schema.decodeUnknownSync(ValidationReport)(JSON.parse(validationJson)),
    checked = validateText(document, resumeText);
  if (
    !artifacts.validationPassed ||
    !checked.passed ||
    !report.passed ||
    report.expectedText !== checked.expectedText ||
    report.extractedText !== resumeText ||
    report.normalization !== checked.normalization ||
    !report.locations ||
    canonicalJson(report.locations) !== canonicalJson(checked.locations) ||
    !report.checks?.completeness ||
    !report.checks.multiplicity ||
    !report.checks.readingOrder ||
    !report.pageCount ||
    report.pageCount > 100 ||
    report.pageCount < 1 ||
    report.errors.length
  )
    throw unavailable();
  return {
    resumeText,
    validationJson,
    reportDigest: await fingerprint(validationJson),
    resourcesDigest: await fingerprint(canonicalJson(artifacts.resources)),
  };
}
async function verifyDocument(
  bucket: R2Bucket,
  document: TemplateScoringDocument,
  fixture: ResumeDocument,
) {
  const actual = await readFixtureArtifacts(bucket, document.artifacts, fixture);
  if (
    actual.resumeText !== document.input.resumeText ||
    actual.validationJson !== document.input.validationJson ||
    actual.reportDigest !== document.input.reportDigest ||
    actual.resourcesDigest !== document.input.resourcesDigest ||
    document.artifacts.templateIdentity !== document.input.templateIdentity ||
    document.artifacts.rendererVersion !== document.input.rendererVersion ||
    document.artifacts.fingerprint !== document.input.artifactFingerprint
  )
    throw unavailable();
  return fingerprint(canonicalJson(document));
}
export async function prepareTemplateScoring(
  env: RuntimeEnv,
  operationId: string,
  fixtureId: string,
) {
  const store = createRepository(env.DB),
    row = await store.getTemplateScoringRuntime(operationId);
  if (
    !row ||
    row.run.operationId !== operationId ||
    row.run.completedAt ||
    !["Pending", "Running"].includes(row.operation.state)
  )
    return;
  const fixture = row.run.fixtureSet.fixtures.find((f) => f.id === fixtureId),
    saved = row.fixtures.find((f) => f.fixtureId === fixtureId);
  if (!fixture || !saved) throw new Error("Missing canonical fixture");
  if (saved.document) {
    await verifyDocument(env.ARTIFACTS, saved.document, fixture.document);
    return;
  }
  await store.updateOperation(operationId, {
    state: "Running",
    stage: `Rendering synthetic fixture: ${fixture.name}`,
  });
  const identity = canonicalJson(graphInventory(row.run.graph));
  const compiled = Schema.decodeUnknownSync(CompiledResult)(
    await env.DOCUMENTS.run({
      type: "validate-template",
      jobId: `${operationId}-${fixtureId}`,
      document: fixture.document,
      theme: row.run.graph.theme,
      templateIdentity: identity,
      templateGraph: row.run.graph,
    }),
  );
  if (
    compiled.templateIdentity !== identity ||
    compiled.rendererVersion !== CUSTOM_RENDERER_VERSION
  )
    throw unavailable();
  const operation = await store.getOperation(operationId);
  if (!operation || !["Pending", "Running"].includes(operation.state)) return;
  const artifacts = await storeCompiledArtifacts(
    env.ARTIFACTS,
    `retained/template-scoring/${row.run.id}/${fixtureId}/${compiled.fingerprint}`,
    compiled,
  );
  const verified = await readFixtureArtifacts(env.ARTIFACTS, artifacts, fixture.document);
  await store.retainTemplateScoringDocument(operationId, fixtureId, {
    artifacts,
    input: {
      ...verified,
      fixtureId,
      documentDigest: fixture.documentDigest,
      artifactFingerprint: artifacts.fingerprint,
      templateIdentity: identity,
      rendererVersion: compiled.rendererVersion,
      providerUrl: row.run.profile.origin,
      adapterVersion: row.run.profile.adapterVersion,
      jobDescription: fixture.jobDescription,
    },
  });
}
/** Submission is reserved once per fixture attempt; recovery reuses every retained response. */
export async function submitTemplateScoring(
  env: RuntimeEnv,
  operationId: string,
  fixtureId: string,
  transport: typeof fetch = fetch,
) {
  const store = createRepository(env.DB),
    row = await store.getTemplateScoringRuntime(operationId);
  if (
    !row ||
    row.run.operationId !== operationId ||
    row.run.completedAt ||
    !["Pending", "Running"].includes(row.operation.state)
  )
    return;
  const fixture = row.fixtures.find((f) => f.fixtureId === fixtureId),
    canonical = row.run.fixtureSet.fixtures.find((f) => f.id === fixtureId);
  if (fixture?.rawResponseJson) return;
  if (!fixture?.document || !canonical) throw unavailable();
  await verifyDocument(env.ARTIFACTS, fixture.document, canonical.document);
  const version = await inspectScoringProvider(row.run.profile, transport);
  if (!(await store.claimTemplateScoringSubmission(operationId, fixtureId, version)))
    throw new Error("This fixture attempt already reserved its submission or stopped.");
  await store.updateOperation(operationId, {
    state: "Running",
    stage: `Scoring six simulations: ${canonical.name}`,
  });
  const result = await scoreCheckpointText(
    row.run.profile,
    fixture.document.input,
    version,
    transport,
  );
  await store.retainTemplateScoringResponse(operationId, fixtureId, result.raw);
}
export async function completeTemplateScoring(env: RuntimeEnv, operationId: string) {
  const store = createRepository(env.DB),
    row = await store.getTemplateScoringRuntime(operationId);
  if (!row) return;
  const verifiedDocuments: { fixtureId: string; digest: string }[] = [];
  for (const fixture of row.fixtures) {
    const canonical = row.run.fixtureSet.fixtures.find((f) => f.id === fixture.fixtureId);
    if (!fixture.document || !canonical) continue;
    const digest = await verifyDocument(env.ARTIFACTS, fixture.document, canonical.document).catch(
      () => null,
    );
    if (digest) verifiedDocuments.push({ fixtureId: fixture.fixtureId, digest });
  }
  await store.completeTemplateScoring(operationId, verifiedDocuments);
}
