import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { ApplicationError } from "@river/domain";
import { generateAiProposal } from "../src/server/ai-provider";
import { runAiWorkflowStep } from "../src/server/ai-workflow-step";

declare global {
  namespace Cloudflare {
    interface Env {
      AI_FAILURE_WORKFLOW: Workflow<{ status: number }>;
    }
  }
}

/** Exercise the real provider adapter and step serialization with a private synthetic response. */
export class AiFailureWorkflow extends WorkflowEntrypoint<Cloudflare.Env, { status: number }> {
  async run(event: WorkflowEvent<{ status: number }>, step: WorkflowStep) {
    try {
      await runAiWorkflowStep(step, async () => {
        await generateAiProposal(
          "private-test-key",
          { text: "private-test-source" },
          {
            connection: {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              revision: 0,
              provider: "openai",
            },
            model: "gpt-5.6-luna",
            maxInputCharacters: 1000,
            maxOutputTokens: 100,
            timeoutMs: 1000,
          },
          "Return JSON",
          "test",
          { type: "object" },
          async () =>
            Response.json(
              {
                error: {
                  message: "private-test-key private-test-source",
                  type: "invalid_request_error",
                  code: "private-test-source",
                },
              },
              { status: event.payload.status },
            ),
        );
      });
      throw Error("Expected provider failure");
    } catch (error) {
      if (!(error instanceof ApplicationError)) throw error;
      return { code: error.code, message: error.message };
    }
  }
}
