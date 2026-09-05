import { env } from "cloudflare:workers";
import type { CompiledResult } from "@river/contracts";
import { canonicalJson, fingerprint, newId, type SourceFields } from "@river/domain";
import {
  compose,
  refinedSourceIdentity,
  SOURCE_RENDERER_VERSION,
  syntheticResume,
  validateTextManifest,
} from "@river/templates";
import {
  captureSourceCandidate,
  compareSourceCandidate,
  sourceCandidateDigest,
} from "@river/templates/source-refinement";
import { expect, it, vi } from "vitest";
import { storeCompiledArtifacts } from "../src/server/compiled-artifacts";
import { readRefinementBase, retainRefinementArtifacts } from "../src/server/refinement-artifacts";

async function fixture() {
  const source = compose(syntheticResume, "classic").tex;
  const fields: SourceFields = [
    {
      locator: "name",
      text: "Synthetic Person",
      required: true,
      origin: "structured",
      role: "content",
      reviewRequired: false,
      evidence: [],
    },
  ];
  const candidate = captureSourceCandidate(fields, [], newId(), {
    source,
    fields: fields.map((field) => ({
      baseLocator: field.locator,
      text: field.text,
      evidence: [],
      meaning: { assessment: "Preserved", explanation: "Synthetic fixture." },
    })),
    explanation: "Synthetic artifact storage fixture.",
  });
  const extractedText = "Synthetic Person",
    validation = validateTextManifest(fields, extractedText);
  const result: CompiledResult = {
    type: "compiled",
    tex: source,
    pdfBase64: btoa("%PDF-1.7\nSynthetic artifact transport fixture\n%%EOF"),
    extractedText,
    validation,
    fingerprint: await fingerprint(newId()),
    durationMs: 1,
    rendererVersion: SOURCE_RENDERER_VERSION,
    templateIdentity: await refinedSourceIdentity(source, fields, "synthetic-base"),
    resources: { compiler: "fixture", cacheDigest: "fixture", fonts: "fixture", bundle: "fixture" },
  };
  const preview = await storeCompiledArtifacts(
    env.ARTIFACTS,
    `transient/source-proposals/${newId()}`,
    result,
    Date.now() + 86400000,
  );
  const comparison = compareSourceCandidate(
      { source, fields, extractedText },
      candidate,
      extractedText,
    ),
    digest = await sourceCandidateDigest(candidate),
    reportDigest = await fingerprint(JSON.stringify(validation));
  const input = {
    checkpointId: newId(),
    source,
    fields,
    candidateDigest: digest,
    comparison,
    preview,
    reviewDigest: await fingerprint(
      canonicalJson({ candidateDigest: digest, comparison, artifacts: preview, reportDigest }),
    ),
  };
  return { result, input, reportDigest };
}

it("pins every file digest and recovers partial immutable checkpoint publication without replacing already written bytes", async () => {
  const f = await fixture();
  const base = await readRefinementBase(env.ARTIFACTS, newId(), f.input.preview);
  expect(base.digests).toEqual(f.input.preview.objectDigests);
  const prefix = `retained/checkpoints/${f.input.checkpointId}/${f.input.preview.fingerprint}`;
  const put = env.ARTIFACTS.put.bind(env.ARTIFACTS);
  const failure = vi.spyOn(env.ARTIFACTS, "put").mockImplementation((key, value, options) => {
    if (key === `${prefix}/resume.tex`) throw new Error("Synthetic interrupted transfer");
    return put(key, value, options);
  });
  await expect(retainRefinementArtifacts(env.ARTIFACTS, f.input)).rejects.toThrow("interrupted");
  failure.mockRestore();
  const before = await env.ARTIFACTS.head(`${prefix}/resume.pdf`);
  expect(before).not.toBeNull();
  const retained = await retainRefinementArtifacts(env.ARTIFACTS, f.input);
  expect(await retainRefinementArtifacts(env.ARTIFACTS, f.input)).toEqual(retained);
  expect(retained.expiresAt).toBeUndefined();
  expect(retained.objectDigests).toEqual(f.input.preview.objectDigests);
  expect((await env.ARTIFACTS.head(retained.pdf))?.uploaded).toEqual(before?.uploaded);
  for (const kind of ["pdf", "tex", "text", "report"] as const)
    expect((await env.ARTIFACTS.get(retained[kind]))?.customMetadata?.sha256).toBe(
      retained.objectDigests?.[kind],
    );
});

it("blocks tampered source, report, intended fields, review identity and conflicting retained bytes", async () => {
  const f = await fixture();
  for (const input of [
    { ...f.input, source: `${f.input.source}\n% unreviewed` },
    { ...f.input, reviewDigest: "unreviewed" },
    { ...f.input, fields: f.input.fields.map((field) => ({ ...field, text: "Different Person" })) },
  ])
    await expect(retainRefinementArtifacts(env.ARTIFACTS, input)).rejects.toThrow();
  const prefix = `retained/checkpoints/${f.input.checkpointId}/${f.input.preview.fingerprint}`;
  await env.ARTIFACTS.put(`${prefix}/resume.pdf`, "Conflicting bytes");
  await expect(retainRefinementArtifacts(env.ARTIFACTS, f.input)).rejects.toThrow("integrity");
  expect(await (await env.ARTIFACTS.get(`${prefix}/resume.pdf`))?.text()).toBe("Conflicting bytes");
  await env.ARTIFACTS.put(
    f.input.preview.report,
    JSON.stringify({ ...f.result.validation, expectedText: "Tampered" }),
  );
  await expect(readRefinementBase(env.ARTIFACTS, newId(), f.input.preview)).rejects.toThrow(
    "integrity",
  );
});

it("requires a complete artifact set even if a retained manifest exists", async () => {
  const f = await fixture();
  await env.ARTIFACTS.delete(f.input.preview.text);
  await expect(readRefinementBase(env.ARTIFACTS, newId(), f.input.preview)).rejects.toThrow(
    "unavailable",
  );
  await expect(retainRefinementArtifacts(env.ARTIFACTS, f.input)).rejects.toThrow("unavailable");
});
