import { expect, it, vi } from "vitest";
import {
  inspectScoringProvider,
  ScoringProviderError,
  scoreCheckpointText,
  scoringProfile,
} from "../src/server/scoring-provider";
import { captureScoringFailure } from "../src/server/scoring-runtime";
import liveFixture from "./fixtures/ats-live-response.json";
import { syntheticScoringResponse, syntheticScoringVersion } from "./fixtures/scoring";

const profile = scoringProfile("https://score.example.test");
const input = { resumeText: "  Synthetic résumé 😀\n", jobDescription: "Exact synthetic job\n" };
it("preserves safe provider failure identity and retry timing across a serialized Workflow step", async () => {
  const retryAt = Date.now() + 60000;
  const failure = await captureScoringFailure(async () => {
    throw new ScoringProviderError("RateLimited", retryAt);
  });
  expect(JSON.parse(JSON.stringify(failure))).toEqual({
    code: "RateLimited",
    message: "The score provider is rate limited. Retry after the recorded time.",
    retryAt,
  });
  expect(await captureScoringFailure(async () => "done")).toBeNull();
  const unknown = await captureScoringFailure(async () => {
    throw new Error("Private provider body must not cross a Workflow boundary");
  });
  expect(unknown?.code).toBe("Interrupted");
  expect(JSON.stringify(unknown)).not.toContain("Private provider body");
});
it("accepts the deployed provider's full product name while preserving its original JSON and identity", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(liveFixture.version))
    .mockResolvedValueOnce(Response.json(liveFixture.response));
  const version = await inspectScoringProvider(profile, transport);
  const result = await scoreCheckpointText(profile, liveFixture.input, version, transport);
  expect(result.response.results.map((item) => item.system)).toEqual(
    syntheticScoringVersion.scoring?.simulations,
  );
  expect(result.raw).toEqual(liveFixture.response);
  expect(result.response._scoringIdentity).toEqual(liveFixture.response._scoringIdentity);
});
it("normalizes known suggestion aliases and rejects unknown or duplicate simulation identities", async () => {
  const canonical = syntheticScoringResponse(input);
  const raw = {
    ...canonical,
    results: canonical.results.map((result) => ({
      ...result,
      system:
        result.system === "SuccessFactors"
          ? "SAP SuccessFactors"
          : result.system === "Taleo"
            ? "Oracle Taleo"
            : result.system,
      suggestions: [
        {
          summary: "Synthetic alias finding",
          details: [],
          impact: "low",
          platforms: ["SAP SuccessFactors", "Oracle Taleo"],
        },
      ],
    })),
  };
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(raw));
  const result = await scoreCheckpointText(profile, input, syntheticScoringVersion, transport);
  expect(result.raw).toEqual(raw);
  expect(result.response.results[5]?.suggestions[0]).toMatchObject({
    platforms: ["SuccessFactors", "Taleo"],
  });
  expect(result.response.results[1]?.system).toBe("Taleo");
  for (const invalid of [
    {
      ...raw,
      results: raw.results.map((item, index) =>
        index === 0 ? { ...item, system: "Unknown ATS" } : item,
      ),
    },
    {
      ...raw,
      results: raw.results.map((item, index) =>
        index === 0 ? { ...item, system: "SuccessFactors" } : item,
      ),
    },
    {
      ...raw,
      results: raw.results.map((item) => ({
        ...item,
        suggestions: item.suggestions.map((suggestion) => ({
          ...suggestion,
          platforms: ["SuccessFactors", "SAP SuccessFactors"],
        })),
      })),
    },
    {
      ...raw,
      results: raw.results.map((item, index) =>
        index === 0 ? { ...item, system: "Taleo" } : item,
      ),
    },
    {
      ...raw,
      results: raw.results.map((item) => ({
        ...item,
        suggestions: item.suggestions.map((suggestion) => ({
          ...suggestion,
          platforms: ["Taleo", "Oracle Taleo"],
        })),
      })),
    },
  ]) {
    transport.mockResolvedValueOnce(Response.json(invalid));
    await expect(
      scoreCheckpointText(profile, input, syntheticScoringVersion, transport),
    ).rejects.toMatchObject({ code: "InvalidResponse" });
  }
});
it("captures provider capabilities and submits exact strings once without attaching browser credentials", async () => {
  const raw = { ...syntheticScoringResponse(input), extraDiagnostic: "Preserved raw metadata" };
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(syntheticScoringVersion))
    .mockResolvedValueOnce(Response.json(raw));
  const version = await inspectScoringProvider(profile, transport);
  const retainedInput = {
    ...input,
    textKey: "private/artifact-key",
    templateIdentity: "Internal template source",
    validationJson: "Internal validation report",
  };
  const result = await scoreCheckpointText(profile, retainedInput, version, transport);
  expect(transport).toHaveBeenCalledTimes(2);
  const [url, init] = transport.mock.calls[1] ?? [];
  expect(url).toBe("https://score.example.test/api/analyze");
  expect(init?.redirect).toBe("manual");
  expect(init?.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
  expect(JSON.parse(String(init?.body))).toEqual({ mode: "full-score", ...input });
  expect(result.raw).toEqual(raw);
  expect(result.response._scoringIdentity?.deployment.buildId).toBe("actual-result-build");
  expect(result.response._scoringIdentity?.deployment.buildId).not.toBe(
    version.deployment?.buildId,
  );
});
it("blocks oversized, missing and incompatible inputs before sending private text", async () => {
  const transport = vi.fn<typeof fetch>();
  await expect(
    scoreCheckpointText(
      profile,
      { ...input, resumeText: "x".repeat(6001) },
      syntheticScoringVersion,
      transport,
    ),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(
    scoreCheckpointText(
      profile,
      { ...input, jobDescription: "" },
      syntheticScoringVersion,
      transport,
    ),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  const { scoring: _scoring, ...legacy } = syntheticScoringVersion;
  await expect(scoreCheckpointText(profile, input, legacy, transport)).rejects.toMatchObject({
    code: "Incompatible",
  });
  expect(transport).not.toHaveBeenCalled();
  for (const origin of [
    "http://example.test",
    "https://user:password@example.test",
    "https://example.test/path",
    "https://example.test?token=secret",
  ])
    expect(() => scoringProfile(origin)).toThrow();
});
it("sanitizes malformed output and bounds the actual body stream", async () => {
  const raw = syntheticScoringResponse(input);
  for (const body of [
    { ...raw, results: raw.results.slice(1) },
    { privateText: input.resumeText },
    { ...raw, _inputCoverage: { ...raw._inputCoverage, complete: false } },
  ]) {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(
      scoreCheckpointText(profile, input, syntheticScoringVersion, transport),
    ).rejects.toMatchObject({
      code: "InvalidResponse",
    });
  }
  const cancelled = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(profile.maxResponseBytes + 1));
    },
    cancel: cancelled,
  });
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(body, {
      headers: { "content-type": "application/json", "content-length": "1" },
    }),
  );
  await expect(
    scoreCheckpointText(profile, input, syntheticScoringVersion, transport),
  ).rejects.toMatchObject({ code: "InvalidResponse" });
  expect(cancelled).toHaveBeenCalledTimes(1);
});
it("retains only safe field paths and fixed consistency failures across Workflow serialization", async () => {
  const raw = syntheticScoringResponse(input);
  const invalid = {
    ...raw,
    results: raw.results.map((result) => ({ ...result, overallScore: "PRIVATE RESUME VALUE" })),
  };
  const failure = await captureScoringFailure(() =>
    scoreCheckpointText(
      profile,
      input,
      syntheticScoringVersion,
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(invalid)),
    ),
  );
  expect(JSON.parse(JSON.stringify(failure))).toMatchObject({
    code: "InvalidResponse",
    message: "The score provider returned invalid scoring fields. Field: results.0.overallScore.",
  });
  expect(JSON.stringify(failure)).not.toContain("PRIVATE");
  const coverage = { ...raw, _inputCoverage: { ...raw._inputCoverage, complete: false } };
  await expect(
    scoreCheckpointText(
      profile,
      input,
      syntheticScoringVersion,
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(coverage)),
    ),
  ).rejects.toMatchObject({
    code: "InvalidResponse",
    message: "The score provider did not confirm complete submitted input.",
  });
});
it("distinguishes transport format failures without exposing provider text", async () => {
  const cases = [
    [new Response("PRIVATE BODY"), "without a JSON content type"],
    [
      new Response("PRIVATE BODY", { headers: { "content-type": "application/json" } }),
      "not valid JSON",
    ],
    [
      new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
      "not valid UTF-8",
    ],
    [new Response(null, { headers: { "content-type": "application/json" } }), "no response body"],
    [
      new Response("PRIVATE BODY", {
        headers: {
          "content-type": "application/json",
          "content-length": String(profile.maxResponseBytes + 1),
        },
      }),
      "byte limit",
    ],
    [
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("PRIVATE STREAM ERROR"));
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
      "could not be read completely",
    ],
  ] as const;
  for (const [response, message] of cases) {
    const failure = await captureScoringFailure(() =>
      scoreCheckpointText(
        profile,
        input,
        syntheticScoringVersion,
        vi.fn<typeof fetch>().mockResolvedValue(response),
      ),
    );
    expect(failure?.code).toBe("InvalidResponse");
    expect(failure?.message).toContain(message);
    expect(JSON.stringify(failure)).not.toContain("PRIVATE");
  }
});
it("does not follow redirects or retry a rate-limited request before its recorded deadline", async () => {
  const redirect = vi.fn<typeof fetch>().mockResolvedValue(
    new Response("private provider detail", {
      status: 302,
      headers: { Location: "https://unrelated.example.test" },
    }),
  );
  await expect(
    scoreCheckpointText(profile, input, syntheticScoringVersion, redirect),
  ).rejects.toMatchObject({
    code: "Unavailable",
    message:
      "The score provider is unavailable. The checkpoint remains available for review and export. HTTP 302.",
  });
  expect(redirect).toHaveBeenCalledTimes(1);
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response("private error", { status: 429, headers: { "Retry-After": "3600" } }),
    );
  const now = Date.now();
  try {
    await scoreCheckpointText(profile, input, syntheticScoringVersion, transport);
    throw new Error("Expected rate limit");
  } catch (error) {
    expect(error).toBeInstanceOf(ScoringProviderError);
    if (!(error instanceof ScoringProviderError)) throw error;
    expect(error.code).toBe("RateLimited");
    expect(error.retryAt).toBeGreaterThanOrEqual(now + 3600000);
    expect(error.message).not.toContain("private error");
  }
  expect(transport).toHaveBeenCalledTimes(1);
});
it("honors cancellation before dispatch and while awaiting the provider", async () => {
  const transport = vi.fn<typeof fetch>();
  await expect(
    scoreCheckpointText(profile, input, syntheticScoringVersion, transport, AbortSignal.abort()),
  ).rejects.toMatchObject({ code: "Cancelled" });
  expect(transport).not.toHaveBeenCalled();
  const controller = new AbortController();
  transport.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  const pending = scoreCheckpointText(
    profile,
    input,
    syntheticScoringVersion,
    transport,
    controller.signal,
  );
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "Cancelled" });
});
