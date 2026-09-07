import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { CompiledResult, ExtractionResult } from "@river/contracts";
import { createRepository } from "@river/db";
import { fingerprint } from "@river/domain";
import { CUSTOM_RENDERER_VERSION, RENDERER_VERSION } from "@river/templates";
import { Effect, Schema } from "effect";
import { storeCompiledArtifacts } from "./compiled-artifacts";
import type { Env } from "./env";

export class DocumentWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    const id = event.payload.operationId;
    const repository = createRepository(this.env.DB);
    try {
      const input = await step.do("load-input", async () => {
        const operation = await repository.getOperation(id);
        if (!operation || !["Pending", "Running"].includes(operation.state)) return null;
        await repository.updateOperation(id, {
          state: "Running",
          stage: "sourceId" in operation.input ? "Extracting source text" : "Compiling PDF",
        });
        return operation.input;
      });
      if (!input) return;
      if ("type" in input) throw new Error("This Operation requires its matching workflow.");
      if ("sourceId" in input) {
        await step.do(
          "extract-and-store",
          {
            retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
            timeout: "2 minutes",
          },
          async () => {
            const operation = await repository.getOperation(id);
            if (!operation || !["Pending", "Running"].includes(operation.state)) return;
            const source = await repository.getSource(operation.ownerId, input.sourceId);
            if (!source) throw new Error("Source unavailable");
            const original = await this.env.ARTIFACTS.get(source.objectKey);
            if (!original) throw new Error("Original unavailable");
            const bytes = new Uint8Array(await original.arrayBuffer());
            if ((await fingerprint(bytes)) !== source.digest)
              throw new Error("Source integrity check failed");
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 8192)
              binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
            const output = await Effect.runPromise(
              Effect.tryPromise(() =>
                this.env.DOCUMENTS.run({
                  type: "extract-source",
                  jobId: id,
                  mime: source.mime,
                  contentBase64: btoa(binary),
                }),
              ).pipe(Effect.withSpan("river.extract", { attributes: { operationId: id } })),
            );
            const extraction = Schema.decodeUnknownSync(ExtractionResult)(output);
            const serialized = JSON.stringify(extraction);
            const digest = await fingerprint(serialized);
            const objectKey = `retained/sources/${source.ownerId}/${source.id}/processing/${input.processingId}/${digest}.json`;
            await this.env.ARTIFACTS.put(objectKey, serialized, {
              onlyIf: { etagDoesNotMatch: "*" },
              httpMetadata: { contentType: "application/json" },
            });
            await repository.publishExtraction({
              id: input.processingId,
              sourceId: source.id,
              operationId: id,
              objectKey,
              digest,
              extraction,
            });
          },
        );
        return;
      }

      // One step owns compilation and immutable artifact writes; metadata is published only after all writes finish.
      const artifacts = await step.do(
        "compile-and-store",
        { retries: { limit: 2, delay: "5 seconds", backoff: "exponential" }, timeout: "2 minutes" },
        async () => {
          const output = await Effect.runPromise(
            Effect.tryPromise(() =>
              this.env.DOCUMENTS.run({ type: "compile-resume", jobId: id, ...input }),
            ).pipe(Effect.withSpan("river.compile", { attributes: { operationId: id } })),
          );
          const result = Schema.decodeUnknownSync(CompiledResult)(output);
          if (input.templateIdentity && result.templateIdentity !== input.templateIdentity)
            throw new Error("The document runtime did not honor the pinned templates.");
          if (
            result.rendererVersion !==
            (input.templateGraph ? CUSTOM_RENDERER_VERSION : RENDERER_VERSION)
          )
            throw new Error("The document runtime did not honor the pinned renderer.");
          const prefix = `${input.preview ? "transient/previews" : input.checkpointId ? "retained/checkpoints" : "retained/operations"}/${id}/${result.fingerprint}`;
          return storeCompiledArtifacts(
            this.env.ARTIFACTS,
            prefix,
            result,
            input.preview ? Date.now() + 7 * 24 * 60 * 60 * 1000 : undefined,
          );
        },
      );
      await step.do("publish-result", () =>
        repository.updateOperation(id, {
          state: artifacts.validationPassed ? "Succeeded" : "Failed",
          stage: artifacts.validationPassed ? "PDF ready" : "Text integrity failed",
          artifacts,
          failure: artifacts.validationPassed
            ? null
            : "The PDF could not preserve all your wording. Check recent text changes or try another template before exporting.",
        }),
      );
      await step.do("publish-draft-preview", () => repository.publishResumePreview(id));
    } catch {
      await step.do("record-failure", () =>
        repository.updateOperation(id, {
          state: "Failed",
          stage: "Document processing failed",
          failure:
            "The PDF could not be prepared. Your saved wording is preserved. Try the preview again.",
        }),
      );
      await step.do("record-source-failure", () =>
        repository.failSource(
          id,
          "Text extraction failed. The original is preserved. Retry extraction or add a text version.",
        ),
      );
      throw new Error(`Document operation ${id} failed`);
    }
  }
}
