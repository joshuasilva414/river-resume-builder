import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createRepository } from "@river/db";
import { ApplicationError } from "@river/domain";
import { generateAiProposal } from "../src/server/ai-provider";
import { runAiWorkflowStep } from "../src/server/ai-workflow-step";
import { retrievePosting } from "../src/server/job-import-retrieval";
import { runJobImport } from "../src/server/job-import-workflow";

type FailureInput =
  | { status: number }
  | { mode: "blocked" | "incomplete"; importId: string; operationId: string; ownerId: string };

declare global {
  namespace Cloudflare {
    interface Env {
      AI_FAILURE_WORKFLOW: Workflow<FailureInput>;
    }
  }
}

/** Exercise the real provider adapter and step serialization with a private synthetic response. */
export class AiFailureWorkflow extends WorkflowEntrypoint<Cloudflare.Env, FailureInput> {
  async run(event: WorkflowEvent<FailureInput>, step: WorkflowStep) {
    try {
      await runAiWorkflowStep(step, async () => {
        const input = event.payload;
        if ("mode" in input) {
          await runJobImport(
            this.env,
            createRepository(this.env.DB),
            input.operationId,
            input.ownerId,
            input.importId,
            (url) =>
              retrievePosting(
                url,
                {
                  quickAction: async () =>
                    Response.json({
                      success: true,
                      result: "<main>Still loading</main>",
                      meta: { status: 200, finalUrl: url },
                    }),
                },
                async (request) => {
                  const address = new URL(request instanceof Request ? request.url : request);
                  if (address.hostname === "cloudflare-dns.com")
                    return Response.json({
                      Status: 0,
                      Answer: [{ type: 1, data: "1.1.1.1" }],
                    });
                  return input.mode === "blocked"
                    ? new Response(null, { status: 403 })
                    : new Response("<main>Loading</main>", {
                        headers: { "content-type": "text/html" },
                      });
                },
              ),
          );
          return;
        }
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
              { status: input.status },
            ),
        );
      });
      throw Error("Expected provider failure");
    } catch (error) {
      if (!(error instanceof ApplicationError))
        return { code: null, message: "Unexpected workflow failure" };
      return { code: error.code, message: error.message };
    }
  }
}
