import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createRepository } from "@river/db";
import type { Env } from "./env";
import { scoringFailure } from "./scoring-runtime";
import {
  completeTemplateScoring,
  prepareTemplateScoring,
  submitTemplateScoring,
} from "./template-scoring-runtime";

const persist = {
  retries: { limit: 2, delay: "5 seconds", backoff: "constant" },
  timeout: "30 seconds",
} as const;
export class TemplateScoringWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    const id = event.payload.operationId,
      store = createRepository(this.env.DB);
    try {
      const fixtures = await step.do("load-fixture-identities", persist, async () => {
        const row = await store.getTemplateScoringRuntime(id);
        if (
          !row ||
          row.run.operationId !== id ||
          !["Pending", "Running"].includes(row.operation.state)
        )
          return [];
        return row.run.fixtureSet.fixtures.map((f) => f.id);
      });
      for (const fixtureId of fixtures) {
        try {
          await step.do(
            `render-${fixtureId}`,
            { retries: { limit: 0, delay: "1 second" }, timeout: "2 minutes" },
            () => prepareTemplateScoring(this.env, id, fixtureId),
          );
          await step.do(
            `score-${fixtureId}`,
            { retries: { limit: 0, delay: "1 second" }, timeout: "90 seconds" },
            () => submitTemplateScoring(this.env, id, fixtureId),
          );
        } catch (error) {
          const failure = scoringFailure(error);
          await step.do(`retain-failure-${fixtureId}`, persist, () =>
            store.failTemplateScoringFixture(id, fixtureId, failure),
          );
        }
      }
      await step.do("verify-and-publish-qualification", { ...persist, timeout: "60 seconds" }, () =>
        completeTemplateScoring(this.env, id),
      );
    } catch (error) {
      const failure = scoringFailure(error);
      await step.do("record-qualification-interruption", persist, () =>
        store.failTemplateScoring(id, failure),
      );
      throw new Error(`Template scoring operation ${id} failed`);
    }
  }
}
