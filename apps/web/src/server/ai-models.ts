import { type AiProvider, ApplicationError } from "@river/domain";
import { Schema } from "effect";

const Model = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  display_name: Schema.optionalKey(Schema.String),
  displayName: Schema.optionalKey(Schema.String),
  supportedGenerationMethods: Schema.optionalKey(Schema.Array(Schema.String)),
  supported_parameters: Schema.optionalKey(Schema.Array(Schema.String)),
  architecture: Schema.optionalKey(
    Schema.Struct({ output_modalities: Schema.optionalKey(Schema.Array(Schema.String)) }),
  ),
});
const Catalog = Schema.Struct({
  data: Schema.optionalKey(Schema.Array(Model)),
  models: Schema.optionalKey(Schema.Array(Model)),
  has_more: Schema.optionalKey(Schema.Boolean),
  last_id: Schema.optionalKey(Schema.String),
  nextPageToken: Schema.optionalKey(Schema.String),
});
const endpoints = {
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/models?limit=1000",
  google: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
  openrouter: "https://openrouter.ai/api/v1/models/user",
} satisfies Record<AiProvider, string>;

/** Metadata filters known incompatibilities; catalog presence does not guarantee structured output support. */
export async function listProviderModels(
  provider: AiProvider,
  apiKey: string,
  transport: typeof fetch = fetch,
) {
  const headers: Record<string, string> =
    provider === "anthropic"
      ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
      : provider === "google"
        ? { "x-goog-api-key": apiKey }
        : { Authorization: `Bearer ${apiKey}` };
  const models: { id: string; label: string }[] = [];
  const url = new URL(endpoints[provider]);
  const signal = AbortSignal.timeout(15000);
  try {
    for (let page = 0; page < 10; page++) {
      // Workers supports manual redirects; reject 3xx below without forwarding the key.
      const response = await transport(url, { headers, signal, redirect: "manual" });
      if (!response.ok) throw new Error("Catalog unavailable");
      // Bound catalog memory independently of provider-declared content length.
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty catalog");
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 8000000) {
          await reader.cancel();
          throw new Error("Catalog too large");
        }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const catalog = Schema.decodeUnknownSync(Catalog)(
        JSON.parse(new TextDecoder().decode(bytes)),
      );
      for (const model of catalog.data ?? catalog.models ?? []) {
        const id = (model.id ?? model.name)?.replace(/^models\//, "");
        if (!id || id.length > 200) continue;
        if (
          model.supportedGenerationMethods &&
          !model.supportedGenerationMethods.includes("generateContent")
        )
          continue;
        if (
          model.architecture?.output_modalities &&
          !model.architecture.output_modalities.includes("text")
        )
          continue;
        if (
          model.supported_parameters &&
          !model.supported_parameters.some(
            (value) => value === "structured_outputs" || value === "response_format",
          )
        )
          continue;
        if (
          provider === "openai" &&
          /embedding|whisper|tts|dall-e|image|realtime|audio|transcribe|moderation/.test(id)
        )
          continue;
        if (provider === "openrouter" && ["openrouter/auto", "openrouter/free"].includes(id))
          continue;
        models.push({ id, label: model.display_name ?? model.displayName ?? model.name ?? id });
      }
      if (catalog.nextPageToken) url.searchParams.set("pageToken", catalog.nextPageToken);
      else if (catalog.has_more && catalog.last_id)
        url.searchParams.set("after_id", catalog.last_id);
      else
        return [...new Map(models.map((model) => [model.id, model])).values()].sort((a, b) =>
          a.label.localeCompare(b.label),
        );
    }
    throw new Error("Incomplete catalog");
  } catch {
    throw new ApplicationError({
      code: "Unavailable",
      message:
        "Could not load models. Check your API key, provider access, and connection, then try again.",
    });
  }
}
