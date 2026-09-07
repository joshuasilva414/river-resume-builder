import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AiExecutionMetadata } from "@river/domain";
import { type AiConnectionBinding, ApplicationError, canonicalJson } from "@river/domain";
import { APICallError, generateText, jsonSchema, Output } from "ai";

export type AiExecutionObserver = (metadata: AiExecutionMetadata) => Promise<void>;

/** One bounded request using an explicitly selected provider. Domain validation runs before publication. */
export async function generateAiProposal(
  apiKey: string,
  input: unknown,
  profile: {
    readonly connection?: AiConnectionBinding;
    readonly model: string;
    readonly maxInputCharacters: number;
    readonly maxOutputTokens: number;
    readonly timeoutMs: number;
  },
  instructions: string,
  name: string,
  schema: Record<string, unknown>,
  transport: typeof fetch = fetch,
  onExecution?: AiExecutionObserver,
): Promise<unknown> {
  const serialized = canonicalJson(input);
  if (serialized.length > profile.maxInputCharacters)
    throw new ApplicationError({
      code: "InvalidInput",
      message: "The AI task input exceeds its configured limit.",
    });
  if (!profile.connection)
    throw new ApplicationError({
      code: "Unavailable",
      message: "Connect an AI provider in Settings and start a new task.",
    });
  try {
    const noRedirect: typeof fetch = (input, init) =>
      transport(input, { ...init, redirect: "error" });
    const options = { apiKey, fetch: noRedirect };
    const model = (() => {
      switch (profile.connection.provider) {
        case "openai":
          return createOpenAI(options).responses(profile.model);
        case "anthropic":
          return createAnthropic(options)(profile.model);
        case "google":
          return createGoogleGenerativeAI(options)(profile.model);
        case "openrouter":
          return createOpenRouter(options).chat(profile.model);
      }
    })();
    const result = await generateText({
      model,
      system: profile.connection.provider === "openai" ? undefined : instructions,
      prompt: serialized,
      output: Output.object({ name, schema: jsonSchema(schema) }),
      maxOutputTokens: profile.maxOutputTokens,
      abortSignal: AbortSignal.timeout(profile.timeoutMs),
      maxRetries: 0,
      providerOptions: {
        anthropic: { structuredOutputMode: "outputFormat" },
        openai: { store: false, strictJsonSchema: true, truncation: "disabled", instructions },
        openrouter: { provider: { require_parameters: true, allow_fallbacks: false } },
      },
    });
    if (result.finishReason !== "stop" || result.text.length > 200000)
      throw new Error("Incomplete output");
    await onExecution?.({
      connection: profile.connection,
      requestedModel: profile.model,
      returnedModel: result.response.modelId,
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
    });
    return result.output;
  } catch (error) {
    // Provider errors can contain prompts, key-bearing headers and raw output. Expose only fixed text.
    const message =
      APICallError.isInstance(error) && [401, 403].includes(error.statusCode ?? 0)
        ? "Your provider could not authorize this model. Check the connection in Settings or choose another model for a new task."
        : APICallError.isInstance(error) && error.statusCode === 429
          ? "Your AI provider reached its usage limit. Check your provider balance or wait before retrying."
          : "The selected model did not return a complete valid response. No changes were applied. Retry this task or choose another model for a new task.";
    throw new ApplicationError({ code: "Unavailable", message });
  }
}
