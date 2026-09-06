import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createRepository, type ScoringFailure } from "@river/db";
import type { Env } from "./env";
import {
  captureScoringFailure,
  prepareScoring,
  scoringFailure,
  submitScoring,
} from "./scoring-runtime";

const persistenceStep = {
  retries: { limit: 2, delay: "5 seconds", backoff: "constant" },
  timeout: "30 seconds",
} as const;
export class ScoringWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    const id = event.payload.operationId,
      store = createRepository(this.env.DB);
    let failure: ScoringFailure | null = null;
    try {
      // Compilation can finish after the browser closes. Waiting is bounded to two minutes.
      for (let attempt = 0; attempt <= 12; attempt++) {
        const state = await step.do(`prepare-exact-input-${attempt}`, persistenceStep, () =>
          prepareScoring(this.env, id),
        );
        if (state === "Stopped") return;
        if (state === "Prepared") break;
        if (attempt === 12)
          throw new Error("Checkpoint document did not become ready within two minutes.");
        await step.sleep(`wait-for-checkpoint-${attempt}`, "10 seconds");
      }
      failure = await step.do(
        "submit-and-retain-provider-result",
        {
          retries: { limit: 0, delay: "1 second" },
          timeout: "90 seconds",
        },
        () => captureScoringFailure(() => submitScoring(this.env, id)),
      );
      if (!failure)
        await step.do("publish-retained-result", persistenceStep, async () => {
          await store.completeScoring(id);
        });
    } catch (error) {
      failure = scoringFailure(error);
    }
    if (failure) {
      const recorded = failure;
      await step.do("record-scoring-failure", persistenceStep, async () => {
        await store.failScoring(id, recorded);
      });
      // Provider payloads and private text never become Workflow exception details.
      throw new Error(`Scoring operation ${id} failed`);
    }
  }
}
