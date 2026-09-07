import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createRepository } from "@river/db";
import { ApplicationError } from "@river/domain";
import { loadAiCredential } from "./ai-settings";
import { runAiWorkflowStep } from "./ai-workflow-step";
import type { Env } from "./env";
import { generateWording } from "./wording-provider";

export class WordingWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    const repository = createRepository(this.env.DB);
    const id = event.payload.operationId;
    try {
      // Generated output is never a Workflow step result. Rejection can remove its sole durable payload from D1.
      await runAiWorkflowStep(step, async () => {
        const operation = await repository.getOperation(id);
        if (
          !operation ||
          !("type" in operation.input) ||
          operation.input.type !== "wording-ai" ||
          !["Pending", "Running"].includes(operation.state)
        )
          return;
        const detail = await repository.inspectWording(operation.ownerId, operation.input.taskId);
        if (detail.task.latestOperationId !== id || detail.proposal) return;
        const profile = detail.task.profile;
        const apiKey = await loadAiCredential(
          this.env,
          repository,
          operation.ownerId,
          profile.connection,
        );
        await repository.updateOperation(id, {
          state: "Running",
          stage: "Generating reviewed proposal",
        });
        const result = await generateWording(
          apiKey,
          detail.task.input,
          profile,
          fetch,
          (metadata) => repository.recordAiExecution(operation.ownerId, id, metadata),
        );
        await repository.updateOperation(id, {
          state: "Running",
          stage: "Validating and saving proposal",
        });
        await repository.publishWording(operation.ownerId, detail.task.id, id, result);
      });
    } catch (error) {
      await step.do("record-safe-failure", () =>
        repository.updateOperation(id, {
          state: "Failed",
          stage: "Wording assistance failed",
          failure:
            error instanceof ApplicationError && error.code === "Unavailable"
              ? error.message
              : "The configured provider, output validation, or proposal save failed. No proposal was applied. Continue manually or retry within this task's three-attempt limit.",
        }),
      );
      throw new Error(`AI operation ${id} failed`);
    }
  }
}
