import type { WorkflowStep } from "cloudflare:workers";
import { ApplicationError } from "@river/domain";
import { AiProviderFailure } from "./ai-failure";

/** Preserve expected failures across step serialization without retaining generated content. */
export async function runAiWorkflowStep(
  step: WorkflowStep,
  run: () => Promise<void>,
  timeout: "90 seconds" | "10 minutes" = "90 seconds",
) {
  const result = await step.do(
    "generate-validate-persist",
    { retries: { limit: 0, delay: "1 second", backoff: "constant" }, timeout },
    async () => {
      try {
        await run();
        return { failure: null };
      } catch (error) {
        if (!(error instanceof ApplicationError) || error.code !== "Unavailable") throw error;
        return {
          failure: {
            message: error.message,
            diagnostic: error instanceof AiProviderFailure ? error.diagnostic : null,
          },
        };
      }
    },
  );
  // Recreate the expected error outside Cloudflare's step boundary; instanceof is reliable here.
  if (result?.failure) {
    if (result.failure.diagnostic) throw new AiProviderFailure(result.failure.diagnostic);
    throw new ApplicationError({ code: "Unavailable", message: result.failure.message });
  }
}
