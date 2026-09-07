import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { CompiledResult } from "@river/contracts";
import { createRepository } from "@river/db";
import { canonicalJson, fingerprint } from "@river/domain";
import { CUSTOM_RENDERER_VERSION, fixtureSetPayload, graphInventory } from "@river/templates";
import { Schema } from "effect";
import { loadAiCredential } from "./ai-settings";
import { storeCompiledArtifacts } from "./compiled-artifacts";
import type { Env } from "./env";
import { cleanRejectedTemplatePreviews } from "./template-ai-cleanup";
import { generateTemplateCandidate } from "./template-ai-provider";

export class TemplateAiWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    const repository = createRepository(this.env.DB),
      id = event.payload.operationId;
    try {
      // Only IDs/void enter Workflow history. The generated payload has one removable D1 owner.
      await step.do(
        "generate-validate-persist",
        { retries: { limit: 0, delay: "1 second" }, timeout: "90 seconds" },
        async () => {
          const operation = await repository.getOperation(id);
          if (
            !operation ||
            !("type" in operation.input) ||
            operation.input.type !== "template-ai" ||
            !["Pending", "Running"].includes(operation.state)
          )
            return;
          const detail = await repository.inspectTemplateAi(
            operation.ownerId,
            operation.input.taskId,
          );
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
            stage: "Generating scoped template proposal",
          });
          const output = await generateTemplateCandidate(
            apiKey,
            detail.task.input,
            detail.task.profile,
            fetch,
            (metadata) => repository.recordAiExecution(operation.ownerId, id, metadata),
          );
          await repository.publishTemplateCandidate(operation.ownerId, detail.task.id, id, output);
        },
      );
      await step.do(
        "render-synthetic-preview",
        { retries: { limit: 0, delay: "1 second" }, timeout: "3 minutes" },
        async () => {
          const operation = await repository.getOperation(id);
          if (
            !operation ||
            !("type" in operation.input) ||
            operation.input.type !== "template-ai" ||
            !["Pending", "Running"].includes(operation.state)
          )
            return;
          const detail = await repository.inspectTemplateAi(
            operation.ownerId,
            operation.input.taskId,
          );
          if (
            detail.task.latestOperationId !== id ||
            detail.proposal?.state !== "Pending" ||
            !detail.proposal.payload
          )
            return;
          if (detail.task.input.fixtureSet.digest !== (await fingerprint(fixtureSetPayload())))
            throw new Error("Fixture set changed");
          await repository.updateOperation(id, {
            state: "Running",
            stage: "Rendering the all-types synthetic preview",
          });
          const graph = detail.proposal.payload.graph,
            identity = canonicalJson(graphInventory(graph));
          const result = Schema.decodeUnknownSync(CompiledResult)(
            await this.env.DOCUMENTS.run({
              type: "validate-template",
              jobId: id,
              document: detail.task.input.fixtureSet.fixtures[0].document,
              theme: graph.theme,
              templateGraph: graph,
              templateIdentity: identity,
            }),
          );
          if (
            result.templateIdentity !== identity ||
            result.rendererVersion !== CUSTOM_RENDERER_VERSION
          )
            throw new Error("Candidate runtime identity changed");
          const prefix = `transient/template-proposals/${detail.task.id}/${id}/${result.fingerprint}`;
          const artifacts = await storeCompiledArtifacts(
            this.env.ARTIFACTS,
            prefix,
            result,
            Date.now() + 7 * 24 * 60 * 60_000,
          );
          const published = await repository.publishTemplateCandidatePreview(
            operation.ownerId,
            detail.task.id,
            id,
            artifacts,
            await fingerprint(canonicalJson(result.validation)),
          );
          if (!published)
            await this.env.ARTIFACTS.delete([
              artifacts.pdf,
              artifacts.tex,
              artifacts.text,
              artifacts.report,
            ]);
        },
      );
    } catch {
      await step.do("record-safe-failure", () =>
        repository.updateOperation(id, {
          state: "Failed",
          stage: "Template proposal or preview interrupted",
          failure:
            "Generation, validation, or preview storage did not finish. A saved candidate is preserved and preview retries do not regenerate it. Inspect this task's remaining attempts.",
        }),
      );
      throw new Error(`Template AI operation ${id} failed`);
    } finally {
      // Cleanup is retried by the scheduler; it cannot change an already committed outcome.
      await cleanRejectedTemplatePreviews(this.env).catch(() => {});
    }
  }
}
