import { ApplicationError, canonicalJson } from "@river/domain";
import OpenAI from "openai";

/** One bounded provider request. No tools, implicit context, streaming, provider storage, or SDK retries. */
export async function generateAiProposal(
  apiKey: string,
  input: unknown,
  profile: {
    readonly model: string;
    readonly maxInputCharacters: number;
    readonly maxOutputTokens: number;
    readonly timeoutMs: number;
  },
  instructions: string,
  name: string,
  schema: Record<string, unknown>,
  transport: typeof fetch = fetch,
): Promise<unknown> {
  const serialized = canonicalJson(input);
  if (serialized.length > profile.maxInputCharacters)
    throw new ApplicationError({
      code: "InvalidInput",
      message: "The AI task input exceeds its configured limit.",
    });
  try {
    const client = new OpenAI({
      apiKey,
      timeout: profile.timeoutMs,
      maxRetries: 0,
      fetch: transport,
    });
    const response = await client.responses.create({
      model: profile.model,
      instructions,
      input: [{ role: "user", content: serialized }],
      store: false,
      stream: false,
      truncation: "disabled",
      max_output_tokens: profile.maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema,
        },
      },
    });
    if (
      response.model !== profile.model ||
      response.status !== "completed" ||
      !response.output_text ||
      response.output_text.length > 200000
    )
      throw new Error("No complete bounded output");
    return JSON.parse(response.output_text);
  } catch {
    // Provider and schema errors can contain private prompts or unvalidated output. Keep those out of logs and the review UI.
    throw new ApplicationError({
      code: "Unavailable",
      message:
        "The provider did not return a complete valid response. No proposal was saved. Continue manually or retry within this task's limit.",
    });
  }
}
