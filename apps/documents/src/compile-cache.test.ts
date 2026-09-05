import type { CompiledResult, CompileRequest } from "@river/contracts";
import { fixedPack, syntheticResume } from "@river/templates";
import { describe, expect, it } from "vitest";
import { CompileCache } from "./compile-cache";

const job = {
  type: "compile-resume",
  jobId: "first-operation",
  theme: "classic",
  document: syntheticResume,
} satisfies CompileRequest;
const output = {
  type: "compiled",
  templateIdentity: "fixture-template",
  pdfBase64: "JVBERi0=",
  tex: "synthetic source",
  extractedText: "Synthetic",
  validation: {
    passed: true,
    expectedText: "Synthetic",
    extractedText: "Synthetic",
    errors: [],
    warnings: [],
  },
  fingerprint: "fixture-fingerprint",
  durationMs: 1234,
  rendererVersion: "fixture-renderer",
  resources: { compiler: "fixture", fonts: "fixture", bundle: "fixture", cacheDigest: "fixture" },
} satisfies CompiledResult;
const body = JSON.stringify(output);

describe("bounded warm document reuse", () => {
  it("reuses complete rendering inputs across operation IDs while separating changed inputs", () => {
    const cache = new CompileCache("runtime-one");
    const key = cache.key(job);
    expect(key).not.toBeNull();
    expect(
      cache.key({ document: job.document, theme: job.theme, type: job.type, jobId: "next" }),
    ).toBe(key);
    expect(cache.key({ ...job, document: { ...job.document, name: "Different Person" } })).not.toBe(
      key,
    );
    expect(cache.key({ ...job, theme: "minimal" })).not.toBe(key);
    expect(cache.key({ ...job, templateIdentity: "new revision" })).not.toBe(key);
    const graph = fixedPack("classic");
    const graphJob = { ...job, templateGraph: graph };
    expect(
      cache.key({
        ...graphJob,
        templateGraph: {
          ...graph,
          document: { ...graph.document, source: `${graph.document.source}\n% changed fragment` },
        },
      }),
    ).not.toBe(cache.key(graphJob));
    expect(new CompileCache("runtime-two").key(job)).not.toBe(key);
    expect(cache.key({ ...job, type: "validate-template" })).toBeNull();
    expect(
      cache.key({
        type: "extract-source",
        jobId: "extract",
        mime: "text/plain",
        contentBase64: "dGV4dA==",
      }),
    ).toBeNull();
    expect(
      cache.key({
        type: "compile-source",
        jobId: "source",
        source: "synthetic",
        baseTemplateIdentity: "fixture",
        intendedText: [{ locator: "name", text: "Synthetic" }],
      }),
    ).toBeNull();
    expect(cache.key({ ...job, document: null })).toBeNull();
    if (key === null) throw new Error("The fixture must be cacheable");
    cache.put(key, body);
    expect(cache.get(key)).toBe(body);
  });

  it("expires from compilation time and evicts least recently used entries within its byte budget", () => {
    let now = 0;
    const cache = new CompileCache("runtime", Buffer.byteLength(body) * 2, 100, () => now);
    cache.put("a", body);
    cache.put("b", body);
    now = 50;
    expect(cache.get("a")).toBe(body);
    cache.put("c", body);
    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")).toBe(body);
    now = 100;
    expect(cache.get("a")).toBeNull();
    expect(cache.get("c")).toBe(body);
    now = 150;
    expect(cache.get("c")).toBeNull();
  });

  it("never retains malformed, failed-integrity or oversized output", () => {
    const cache = new CompileCache("runtime", Buffer.byteLength(body));
    for (const rejected of [
      "invalid json",
      JSON.stringify({ type: "compiled" }),
      JSON.stringify({ ...output, validation: { ...output.validation, passed: false } }),
      JSON.stringify({ ...output, tex: "X".repeat(Buffer.byteLength(body)) }),
    ]) {
      cache.put("rejected", rejected);
      expect(cache.get("rejected")).toBeNull();
    }
    cache.put("valid", body);
    expect(cache.get("valid")).toBe(body);
  });
});
