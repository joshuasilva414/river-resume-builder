import type { ArtifactManifest } from "@river/contracts";
import { fingerprint } from "@river/domain";
import { NORMALIZATION_VERSION, ValidationReport } from "@river/templates";
import { Schema } from "effect";

/** Legacy manifests have no per-file hashes. Verify their retained report, then pin actual digests. */
export async function readScoringText(bucket: R2Bucket, artifact: ArtifactManifest) {
  const read = async (kind: "text" | "report", limit: number) => {
    const object = await bucket.get(artifact[kind]);
    if (!object || object.size > limit) {
      await object?.body.cancel();
      throw new Error("Scoring artifact is missing or exceeds its limit.");
    }
    const bytes = new Uint8Array(await object.arrayBuffer()),
      digest = await fingerprint(bytes);
    if (
      bytes.byteLength !== object.size ||
      (object.customMetadata?.sha256 && object.customMetadata.sha256 !== digest) ||
      (artifact.objectDigests && artifact.objectDigests[kind] !== digest)
    )
      throw new Error("Scoring artifact integrity failed.");
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), digest };
  };
  const [text, report] = await Promise.all([read("text", 1000000), read("report", 2000000)]);
  const validation = Schema.decodeUnknownSync(ValidationReport)(JSON.parse(report.text));
  if (
    !artifact.validationPassed ||
    !validation.passed ||
    validation.normalization !== NORMALIZATION_VERSION ||
    validation.extractedText !== text.text
  )
    throw new Error("Scoring requires the exact text of a passing retained validation report.");
  return { resumeText: text.text, textDigest: text.digest, reportDigest: report.digest };
}
