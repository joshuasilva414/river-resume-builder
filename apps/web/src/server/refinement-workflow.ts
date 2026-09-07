import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { CompiledResult } from "@river/contracts";
import { createRepository } from "@river/db";
import { fingerprint } from "@river/domain";
import {
  refinedSourceIdentity,
  SOURCE_RENDERER_VERSION,
  validateRefinedSource,
} from "@river/templates";
import { Schema } from "effect";
import { loadAiCredential } from "./ai-settings";
import { storeCompiledArtifacts } from "./compiled-artifacts";
import type { Env } from "./env";
import { retainRefinementArtifacts } from "./refinement-artifacts";
import { cleanRejectedSourceRefinements } from "./refinement-cleanup";
import { generateSourceRefinement } from "./refinement-provider";

export class SourceRefinementWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    const id = event.payload.operationId,
      repository = createRepository(this.env.DB);
    try {
      // Workflow history contains identifiers and completion only. Removable candidate payloads stay in D1/R2.
      const accepting = await step.do("select-source-stage", async () => {
        const operation = await repository.getOperation(id);
        return (
          operation &&
          "type" in operation.input &&
          operation.input.type === "source-refinement-accept"
        );
      });
      if (accepting) {
        await step.do(
          "retain-and-finalize-source-checkpoint",
          { retries: { limit: 0, delay: "1 second" }, timeout: "3 minutes" },
          async () => {
            const operation = await repository.getOperation(id);
            if (
              !operation ||
              !("type" in operation.input) ||
              operation.input.type !== "source-refinement-accept" ||
              !["Pending", "Running"].includes(operation.state)
            )
              return;
            const detail = await repository.inspectSourceRefinement(
                operation.ownerId,
                operation.input.taskId,
              ),
              p = detail.proposal;
            if (
              p?.state !== "Pending" ||
              p.acceptanceOperationId !== id ||
              !p.payload ||
              !p.comparison ||
              !p.reviewDigest ||
              !p.previewArtifacts ||
              !p.resultCheckpointId ||
              detail.staleReasons.length
            )
              throw new Error("Source publication is no longer current");
            await repository.updateOperation(id, {
              state: "Running",
              stage: "Retaining the four reviewed checkpoint artifacts",
            });
            const retained = await retainRefinementArtifacts(this.env.ARTIFACTS, {
              checkpointId: p.resultCheckpointId,
              source: p.payload.source,
              fields: p.payload.fields,
              candidateDigest: p.candidateDigest,
              comparison: p.comparison,
              reviewDigest: p.reviewDigest,
              preview: p.previewArtifacts,
            });
            await repository.finalizeSourceRefinement(
              operation.ownerId,
              detail.task.id,
              id,
              retained,
            );
          },
        );
        return;
      }
      await step.do(
        "generate-and-persist-source-candidate",
        { retries: { limit: 0, delay: "1 second" }, timeout: "90 seconds" },
        async () => {
          const operation = await repository.getOperation(id);
          if (
            !operation ||
            !("type" in operation.input) ||
            operation.input.type !== "source-refinement" ||
            !["Pending", "Running"].includes(operation.state)
          )
            return;
          const detail = await repository.inspectSourceRefinement(
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
          if (detail.staleReasons.length) throw new Error("Input changed");
          await repository.updateOperation(id, {
            state: "Running",
            stage: "Generating complete source and intended-text proposal",
          });
          const output = await generateSourceRefinement(
            apiKey,
            detail.task.input,
            profile,
            fetch,
            (metadata) => repository.recordAiExecution(operation.ownerId, id, metadata),
          );
          if (
            !(await repository.publishSourceRefinementCandidate(
              operation.ownerId,
              detail.task.id,
              id,
              output,
            ))
          )
            throw new Error("Source proposal publication was cancelled or superseded");
        },
      );
      await step.do(
        "compile-and-compare-source-candidate",
        { retries: { limit: 0, delay: "1 second" }, timeout: "3 minutes" },
        async () => {
          const operation = await repository.getOperation(id);
          if (
            !operation ||
            !("type" in operation.input) ||
            operation.input.type !== "source-refinement" ||
            !["Pending", "Running"].includes(operation.state)
          )
            return;
          const detail = await repository.inspectSourceRefinement(
              operation.ownerId,
              operation.input.taskId,
            ),
            p = detail.proposal;
          if (
            detail.task.latestOperationId !== id ||
            p?.state !== "Pending" ||
            !p.payload ||
            detail.staleReasons.length
          )
            throw new Error("Source preview is no longer current");
          await repository.updateOperation(id, {
            state: "Running",
            stage: "Compiling and checking every intended text field",
          });
          try {
            validateRefinedSource(p.payload.source);
          } catch {
            await repository.updateOperation(id, {
              state: "Failed",
              stage: "Proposed source failed safety checks",
              failure:
                "The complete candidate is preserved for inspection. Its LaTeX failed the source grammar checks before compilation. Request a corrected proposal before acceptance.",
            });
            return;
          }
          const result = Schema.decodeUnknownSync(CompiledResult)(
            await this.env.DOCUMENTS.run({
              type: "compile-source",
              jobId: id,
              source: p.payload.source,
              intendedText: p.payload.fields.map(({ locator, text }) => ({ locator, text })),
              baseTemplateIdentity: detail.task.input.checkpoint.baseTemplateIdentity,
            }),
          );
          const identity = await refinedSourceIdentity(
            p.payload.source,
            p.payload.fields,
            detail.task.input.checkpoint.baseTemplateIdentity,
          );
          if (
            result.rendererVersion !== SOURCE_RENDERER_VERSION ||
            result.templateIdentity !== identity ||
            result.tex !== p.payload.source
          )
            throw new Error("Source renderer identity changed");
          const artifacts = await storeCompiledArtifacts(
            this.env.ARTIFACTS,
            `transient/source-proposals/${detail.task.id}/${id}/${result.fingerprint}`,
            result,
            Date.now() + 7 * 86400000,
          );
          const published = await repository.publishSourceRefinementPreview(
            operation.ownerId,
            detail.task.id,
            id,
            artifacts,
            result.extractedText,
            await fingerprint(JSON.stringify(result.validation)),
          );
          if (!published) {
            await this.env.ARTIFACTS.delete([
              artifacts.pdf,
              artifacts.tex,
              artifacts.text,
              artifacts.report,
            ]);
            throw new Error("Source preview publication was cancelled or superseded");
          }
        },
      );
    } catch {
      await step.do("record-safe-source-failure", () =>
        repository.updateOperation(id, {
          state: "Failed",
          stage: "Source refinement interrupted",
          failure:
            "Generation, comparison or artifact publication did not finish. Saved candidates and original checkpoints are preserved. Inspect dependencies and remaining attempts before retrying.",
        }),
      );
      throw new Error(`Source refinement operation ${id} failed`);
    } finally {
      await cleanRejectedSourceRefinements(this.env).catch(() => {});
    }
  }
}
