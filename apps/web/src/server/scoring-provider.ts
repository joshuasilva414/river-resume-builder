import {
  AtsScoringResponse,
  PlatformScore,
  ScoringPlatform,
  type ScoringProfile,
  ScoringProviderVersion,
  ScoringSuggestion,
  scoringLimits,
  scoringPlatforms,
  scoringPreflight,
  validateScoringResponse,
} from "@river/domain";
import { Schema } from "effect";

export { type ScoringProfile, ScoringProviderVersion, scoringProfile } from "@river/domain";

// The provider also uses SAP's full product name. Canonicalize only that known alias;
// the domain validator still enforces bounds and unique simulations after decoding.
const ProviderPlatform = Schema.Union([
  ScoringPlatform,
  Schema.Literal("SAP SuccessFactors").transform("SuccessFactors"),
]);
const ProviderResponse = Schema.Struct({
  ...AtsScoringResponse.fields,
  results: Schema.Array(
    Schema.Struct({
      ...PlatformScore.fields,
      system: ProviderPlatform,
      suggestions: Schema.Array(
        Schema.Union([
          ScoringSuggestion.members[0],
          Schema.Struct({
            ...ScoringSuggestion.members[1].fields,
            platforms: Schema.Array(ProviderPlatform),
          }),
        ]),
      ),
    }),
  ),
});

const messages = {
  RateLimited: "The score provider is rate limited. Retry after the recorded time.",
  Unavailable:
    "The score provider is unavailable. The checkpoint remains available for review and export.",
  Timeout: "The score provider exceeded the request deadline.",
  Cancelled: "The scoring request was cancelled.",
  InvalidResponse:
    "The score provider did not return a complete valid result within its response limit.",
  Incompatible:
    "The provider's effective input capabilities are missing or incompatible with this adapter.",
  InvalidInput:
    "Scoring requires complete résumé and job text within the provider's effective limits.",
} as const;
export class ScoringProviderError extends Error {
  constructor(
    readonly code: keyof typeof messages,
    readonly retryAt: number | null = null,
  ) {
    super(messages[code]);
    this.name = "ScoringProviderError";
  }
}

function retryTime(header: string | null, now: number) {
  if (!header) return now + 60000;
  const milliseconds = /^\d+$/.test(header) ? now + Number(header) * 1000 : Date.parse(header);
  return Number.isSafeInteger(milliseconds) ? Math.max(now, milliseconds) : now + 60000;
}

/** Read the actual stream limit; never trust Content-Length or retain a provider error body. */
async function readProviderJson(response: Response, limit: number): Promise<unknown> {
  if (
    !response.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
    Number(response.headers.get("content-length")) > limit
  ) {
    await response.body?.cancel();
    throw new ScoringProviderError("InvalidResponse");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ScoringProviderError("InvalidResponse");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new ScoringProviderError("InvalidResponse");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function requestProvider(
  profile: ScoringProfile,
  path: "/api/version" | "/api/analyze",
  body: object | null,
  transport: typeof fetch,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new ScoringProviderError("Cancelled");
  const deadline = AbortSignal.timeout(path === "/api/version" ? 10000 : profile.timeoutMs);
  const combined = signal ? AbortSignal.any([deadline, signal]) : deadline;
  let response: Response;
  try {
    response = await transport(`${profile.origin}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      signal: combined,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ScoringProviderError(
      signal?.aborted ? "Cancelled" : deadline.aborted ? "Timeout" : "Unavailable",
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ScoringProviderError(
      response.status === 429 ? "RateLimited" : "Unavailable",
      response.status === 429 ? retryTime(response.headers.get("retry-after"), Date.now()) : null,
    );
  }
  try {
    const value = await readProviderJson(
      response,
      path === "/api/version" ? 16384 : profile.maxResponseBytes,
    );
    if (combined.aborted) throw new Error("Request cancelled");
    return value;
  } catch {
    throw new ScoringProviderError(
      signal?.aborted ? "Cancelled" : deadline.aborted ? "Timeout" : "InvalidResponse",
    );
  }
}

export async function inspectScoringProvider(
  profile: ScoringProfile,
  transport: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  const raw = await requestProvider(profile, "/api/version", null, transport, signal);
  try {
    return Schema.decodeUnknownSync(ScoringProviderVersion)(raw);
  } catch {
    throw new ScoringProviderError("Incompatible");
  }
}

/** Capture capabilities before submitting private text. A separate version observation never supplies result identity. */
export async function scoreCheckpointText(
  profile: ScoringProfile,
  input: { resumeText: string; jobDescription: string },
  version: ScoringProviderVersion,
  transport: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<{ raw: unknown; response: AtsScoringResponse }> {
  if (!scoringPreflight(input.resumeText, input.jobDescription).allowed)
    throw new ScoringProviderError("InvalidInput");
  const capabilities = version.scoring;
  if (
    !capabilities ||
    capabilities.effective.resumeText !== scoringLimits.resumeText ||
    capabilities.effective.jobDescription !== scoringLimits.jobDescription ||
    capabilities.accepted.resumeText < capabilities.effective.resumeText ||
    capabilities.accepted.jobDescription < capabilities.effective.jobDescription ||
    new Set(capabilities.simulations).size !== 6 ||
    scoringPlatforms.some((platform) => !capabilities.simulations.includes(platform))
  )
    throw new ScoringProviderError("Incompatible");
  const raw = await requestProvider(
    profile,
    "/api/analyze",
    { mode: "full-score", ...input },
    transport,
    signal,
  );
  try {
    const normalized = Schema.decodeUnknownSync(ProviderResponse)(raw);
    return {
      raw,
      response: validateScoringResponse(normalized, input.resumeText, input.jobDescription),
    };
  } catch {
    throw new ScoringProviderError("InvalidResponse");
  }
}
