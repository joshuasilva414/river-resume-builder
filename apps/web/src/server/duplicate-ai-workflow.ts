import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createRepository } from "@river/db";
import { canonicalJson } from "@river/domain";
import { Effect } from "effect";
import { duplicateAiProfile, generateDuplicateComparison } from "./duplicate-ai-provider";
import type { Env } from "./env";

export class DuplicateAiWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    const repository = createRepository(this.env.DB);
    const id = event.payload.operationId;
    try {
      // Generated output is never a Workflow step result. Rejection can remove its sole durable payload from D1.
      await step.do(
        "generate-validate-persist",
        { retries: { limit: 0, delay: "1 second", backoff: "constant" }, timeout: "90 seconds" },
        async () => {
          const operation = await repository.getOperation(id);
          if (
            !operation ||
            !("type" in operation.input) ||
            operation.input.type !== "duplicate-ai" ||
            !["Pending", "Running"].includes(operation.state)
          )
            return;
          const detail = await repository.inspectDuplicateAi(
            operation.ownerId,
            operation.input.taskId,
          );
          if (detail.task.latestOperationId !== id || detail.proposal) return;
          const profile = duplicateAiProfile(this.env);
          if (
            !profile ||
            !this.env.OPENAI_API_KEY ||
            canonicalJson(profile) !== canonicalJson(detail.task.profile)
          )
            throw new Error("Profile unavailable");
          await repository.updateOperation(id, {
            state: "Running",
            stage: "Comparing exact evidence revisions",
          });
          const result = await Effect.runPromise(
            Effect.tryPromise({
              try: () =>
                generateDuplicateComparison(
                  this.env.OPENAI_API_KEY ?? "",
                  detail.task.input,
                  profile,
                ),
              catch: () => new Error("AI provider unavailable"),
            }).pipe(
              Effect.withSpan("river.duplicate-comparison", {
                attributes: { operationId: id, pairId: detail.task.pairId },
              }),
            ),
          );
          await repository.updateOperation(id, {
            state: "Running",
            stage: "Validating and saving proposal",
          });
          await repository.publishDuplicateAi(operation.ownerId, detail.task.id, id, result);
        },
      );
    } catch {
      await step.do("record-safe-failure", () =>
        repository.updateOperation(id, {
          state: "Failed",
          stage: "Duplicate comparison failed",
          failure:
            "The configured provider, output validation, or proposal save failed. No proposal was applied. Continue manually or retry within this task's three-attempt limit.",
        }),
      );
      throw new Error(`AI operation ${id} failed`);
    }
  }
}
