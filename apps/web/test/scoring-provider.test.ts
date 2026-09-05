import { expect, it, vi } from "vitest";
import {
  inspectScoringProvider,
  ScoringProviderError,
  scoreCheckpointText,
  scoringProfile,
} from "../src/server/scoring-provider";
import { syntheticScoringResponse, syntheticScoringVersion } from "./fixtures/scoring";

const profile = scoringProfile("https://score.example.test");
const input = { resumeText: "  Synthetic résumé 😀\n", jobDescription: "Exact synthetic job\n" };
it("captures provider capabilities and submits exact strings once without attaching browser credentials", async () => {
  const raw = { ...syntheticScoringResponse(input), extraDiagnostic: "Preserved raw metadata" };
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(syntheticScoringVersion))
    .mockResolvedValueOnce(Response.json(raw));
  const version = await inspectScoringProvider(profile, transport);
  const result = await scoreCheckpointText(profile, input, version, transport);
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
      message:
        "The score provider did not return a complete valid result within its response limit.",
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
it("does not follow redirects or retry a rate-limited request before its recorded deadline", async () => {
  const redirect = vi.fn<typeof fetch>().mockResolvedValue(
    new Response("private provider detail", {
      status: 302,
      headers: { Location: "https://unrelated.example.test" },
    }),
  );
  await expect(
    scoreCheckpointText(profile, input, syntheticScoringVersion, redirect),
  ).rejects.toMatchObject({ code: "Unavailable" });
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
