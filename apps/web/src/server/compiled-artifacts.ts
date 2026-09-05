import type { ArtifactManifest, CompiledResult } from "@river/contracts";
import { fingerprint } from "@river/domain";

/** Publish immutable files before their D1 manifest. Retries verify any already-written bytes. */
export async function storeCompiledArtifacts(
  bucket: R2Bucket,
  prefix: string,
  result: CompiledResult,
  expiresAt?: number,
): Promise<ArtifactManifest> {
  const artifacts = {
    pdf: `${prefix}/resume.pdf`,
    tex: `${prefix}/resume.tex`,
    text: `${prefix}/resume.txt`,
    report: `${prefix}/validation.json`,
    fingerprint: result.fingerprint,
    durationMs: result.durationMs,
    resources: result.resources,
    rendererVersion: result.rendererVersion,
    validationPassed: result.validation.passed,
    templateIdentity: result.templateIdentity,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
  const entries = [
    {
      kind: "pdf",
      key: artifacts.pdf,
      body: Uint8Array.from(atob(result.pdfBase64), (char) => char.charCodeAt(0)),
      type: "application/pdf",
    },
    { kind: "tex", key: artifacts.tex, body: result.tex, type: "application/x-tex" },
    {
      kind: "text",
      key: artifacts.text,
      body: result.extractedText,
      type: "text/plain; charset=utf-8",
    },
    {
      kind: "report",
      key: artifacts.report,
      body: JSON.stringify(result.validation),
      type: "application/json",
    },
  ] as const;
  const objectDigests = { pdf: "", tex: "", text: "", report: "" };
  for (const entry of entries) {
    const digest = await fingerprint(entry.body);
    objectDigests[entry.kind] = digest;
    const stored = await bucket.put(entry.key, entry.body, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: entry.type },
      customMetadata: { sha256: digest },
    });
    if (!stored) {
      const existing = await bucket.get(entry.key);
      if (!existing || (await fingerprint(new Uint8Array(await existing.arrayBuffer()))) !== digest)
        throw new Error("An immutable document artifact failed its integrity check.");
    }
  }
  return { ...artifacts, objectDigests };
}
