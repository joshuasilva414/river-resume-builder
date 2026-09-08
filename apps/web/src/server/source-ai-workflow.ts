import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createRepository } from "@river/db";
import { ApplicationError } from "@river/domain";
import { loadAiCredential } from "./ai-settings";
import { runAiWorkflowStep } from "./ai-workflow-step";
import type { Env } from "./env";
import { generateSourceCandidates } from "./source-ai-provider";

export class SourceAiWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    const repository = createRepository(this.env.DB);
    const id = event.payload.operationId;
    try {
      // Generated output is never a Workflow step result. Rejection can remove its sole durable payload from D1.
      await runAiWorkflowStep(
        step,
        async () => {
          const operation = await repository.getOperation(id);
          if (
            !operation ||
            !("type" in operation.input) ||
            operation.input.type !== "source-ai" ||
            !["Pending", "Running"].includes(operation.state)
          )
            return;
          const detail = await repository.inspectSourceAi(
            operation.ownerId,
            operation.input.taskId,
          );
          if (detail.task.latestOperationId !== id || detail.task.completedAt !== null) return;
          const profile = detail.task.profile;
          const apiKey = await loadAiCredential(
            this.env,
            repository,
            operation.ownerId,
            profile.connection,
          );
          await repository.updateOperation(id, {
            state: "Running",
            stage: "Extracting evidence",
          });
          const result = await generateSourceCandidates(
            apiKey,
            detail.task.input,
            profile,
            fetch,
            (metadata) => repository.recordAiExecution(operation.ownerId, id, metadata),
            async (index, total) => {
              const current = await repository.getOperation(id);
              if (!current || !["Pending", "Running"].includes(current.state)) return false;
              await repository.updateOperation(id, {
                state: "Running",
                stage: `Extracting evidence · part ${index + 1} of ${total}`,
              });
              return true;
            },
          );
          await repository.updateOperation(id, {
            state: "Running",
            stage: "Preparing evidence for review",
          });
          await repository.publishSourceAi(operation.ownerId, detail.task.id, id, result);
        },
        "10 minutes",
      );
    } catch (error) {
      await step.do("record-safe-failure", () =>
        repository.updateOperation(id, {
          state: "Failed",
          stage: "Evidence extraction failed",
          failure:
            error instanceof ApplicationError && error.code === "Unavailable"
              ? error.message
              : "River could not finish extracting supported evidence. Your original is preserved. Retry extraction or add evidence manually.",
        }),
      );
      throw new Error(`AI operation ${id} failed`);
    }
  }
}
