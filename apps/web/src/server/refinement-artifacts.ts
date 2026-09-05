import type { ArtifactManifest } from "@river/contracts";
import type { RefinementBaseArtifacts } from "@river/db";
import { canonicalJson, fingerprint, type SourceFields, validateIntendedText } from "@river/domain";
import { NORMALIZATION_VERSION, ValidationReport, validateTextManifest } from "@river/templates";
import type { SourceComparison } from "@river/templates/source-refinement";
import { Schema } from "effect";

const files = {
  pdf: { type: "application/pdf", limit: 20 * 1024 * 1024 },
  tex: { type: "application/x-tex", limit: 1000000 },
  text: { type: "text/plain; charset=utf-8", limit: 1000000 },
  report: { type: "application/json", limit: 2000000 },
};
type Kind = keyof typeof files;
const kinds: readonly Kind[] = ["pdf", "tex", "text", "report"];

async function readArtifact(bucket: R2Bucket, artifacts: ArtifactManifest, kind: Kind) {
  const object = await bucket.get(artifacts[kind]);
  if (!object || object.size > files[kind].limit)
    throw new Error("Required document artifact is unavailable or exceeds its limit.");
  const bytes = new Uint8Array(await object.arrayBuffer()),
    digest = await fingerprint(bytes);
  if (
    bytes.byteLength !== object.size ||
    (object.customMetadata?.sha256 && object.customMetadata.sha256 !== digest) ||
    (artifacts.objectDigests && artifacts.objectDigests[kind] !== digest)
  )
    throw new Error("Document artifact integrity failed.");
  return { bytes, digest };
}

/** Inspect actual retained bytes before capturing a model input; no signed URLs or object keys come from the browser. */
export async function readRefinementBase(
  bucket: R2Bucket,
  operationId: string,
  artifacts: ArtifactManifest,
): Promise<RefinementBaseArtifacts> {
  const [pdf, tex, text, report] = await Promise.all(
    kinds.map((kind) => readArtifact(bucket, artifacts, kind)),
  );
  if (!pdf || !tex || !text || !report) throw new Error("Incomplete artifact set.");
  const decoder = new TextDecoder("utf-8", { fatal: true }),
    extractedText = decoder.decode(text.bytes),
    validation = Schema.decodeUnknownSync(ValidationReport)(
      JSON.parse(decoder.decode(report.bytes)),
    );
  if (
    !artifacts.validationPassed ||
    !validation.passed ||
    validation.normalization !== NORMALIZATION_VERSION ||
    validation.extractedText !== extractedText
  )
    throw new Error("The base artifact set has no passing matching text report.");
  return {
    operationId,
    artifacts,
    source: decoder.decode(tex.bytes),
    extractedText,
    digests: { pdf: pdf.digest, tex: tex.digest, text: text.digest, report: report.digest },
  };
}

/** Verify the exact reviewed files, then recoverably copy them to checkpoint-owned immutable keys. */
export async function retainRefinementArtifacts(
  bucket: R2Bucket,
  input: {
    checkpointId: string;
    source: string;
    fields: SourceFields;
    candidateDigest: string;
    comparison: SourceComparison;
    reviewDigest: string;
    preview: ArtifactManifest;
  },
): Promise<ArtifactManifest> {
  if (!input.preview.objectDigests)
    throw new Error("Source preview is missing its reviewed object digests.");
  const base = await readRefinementBase(bucket, "source-preview", input.preview);
  if (
    base.source !== input.source ||
    !validateTextManifest(input.fields, base.extractedText).passed ||
    input.comparison.extracted.segments
      .filter((part) => part.kind !== "Removed")
      .map((part) => part.text)
      .join("") !== base.extractedText
  )
    throw new Error("The retained candidate differs from its complete review.");
  const reportObject = await readArtifact(bucket, input.preview, "report"),
    validation = Schema.decodeUnknownSync(ValidationReport)(
      JSON.parse(new TextDecoder().decode(reportObject.bytes)),
    );
  if (
    validation.expectedText !== validateIntendedText(input.fields) ||
    canonicalJson(validation.locations) !==
      canonicalJson(input.fields.map(({ locator, text }) => ({ locator, text }))) ||
    (await fingerprint(
      canonicalJson({
        candidateDigest: input.candidateDigest,
        comparison: input.comparison,
        artifacts: input.preview,
        reportDigest: base.digests.report,
      }),
    )) !== input.reviewDigest
  )
    throw new Error("The complete source review identity does not match these artifacts.");
  const { expiresAt: _expiresAt, ...metadata } = input.preview;
  const prefix = `retained/checkpoints/${input.checkpointId}/${input.preview.fingerprint}`;
  const retained: ArtifactManifest = {
    ...metadata,
    pdf: `${prefix}/resume.pdf`,
    tex: `${prefix}/resume.tex`,
    text: `${prefix}/resume.txt`,
    report: `${prefix}/validation.json`,
  };
  for (const kind of kinds) {
    const source = await readArtifact(bucket, input.preview, kind);
    const stored = await bucket.put(retained[kind], source.bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: files[kind].type },
      customMetadata: { sha256: source.digest },
    });
    if (!stored) await readArtifact(bucket, retained, kind);
  }
  return retained;
}
