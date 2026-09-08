import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { CompiledResult } from "@river/contracts";
import { createRepository } from "@river/db";
import { canonicalJson } from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  graphInventory,
  schemaValidationDocument,
  templateFixtures,
} from "@river/templates";
import { Schema } from "effect";
import { storeCompiledArtifacts } from "./compiled-artifacts";
import type { Env } from "./env";

export class TemplateValidationWorkflow extends WorkflowEntrypoint<Env, { operationId: string }> {
  async run(event: WorkflowEvent<{ operationId: string }>, step: WorkflowStep) {
    return runTemplateValidation(this.env, event, step);
  }
}

/** Keep validation decisions testable independently of the Workflow runtime constructor. */
export async function runTemplateValidation(
  env: Pick<Env, "DB" | "ARTIFACTS" | "DOCUMENTS">,
  event: WorkflowEvent<{ operationId: string }>,
  step: WorkflowStep,
) {
  const operationId = event.payload.operationId,
    repository = createRepository(env.DB);
  try {
    const input = await step.do("load-validation", async () => {
      const operation = await repository.getOperation(operationId);
      if (!operation || !["Pending", "Running"].includes(operation.state)) return null;
      if (!("type" in operation.input) || operation.input.type !== "template-validation")
        throw new Error("This Operation requires its matching workflow.");
      return { ownerId: operation.ownerId, validationId: operation.input.validationId };
    });
    if (!input) return;
    for (const [index, fixture] of templateFixtures.entries()) {
      try {
        await step.do(
          `fixture-${fixture.id}`,
          {
            retries: { limit: 1, delay: "5 seconds", backoff: "exponential" },
            timeout: "4 minutes",
          },
          async () => {
            const detail = await repository.inspectTemplateValidation(
              input.ownerId,
              input.validationId,
            );
            if (
              !detail.operation ||
              !["Pending", "Running"].includes(detail.operation.state) ||
              detail.fixtures.some((item) => item.fixtureId === fixture.id)
            )
              return;
            await repository.updateOperation(operationId, {
              state: "Running",
              stage: `Validating ${index + 1} of ${templateFixtures.length}: ${
                detail.template.revision.graph.composition && index === 0
                  ? "All schema layouts"
                  : fixture.name
              }`,
            });
            const graph = detail.template.revision.graph,
              identity = canonicalJson(graphInventory(graph));
            const job = {
              type: "validate-template" as const,
              jobId: `${operationId}-${fixture.id}`,
              document:
                graph.composition && index === 0
                  ? schemaValidationDocument(graph)
                  : fixture.document,
              theme: graph.theme,
              templateGraph: graph,
              templateIdentity: identity,
            };
            const first = Schema.decodeUnknownSync(CompiledResult)(await env.DOCUMENTS.run(job));
            // Cancellation is durable and stops dispatch of the second bounded render.
            const active = await repository.getOperation(operationId);
            if (!active || !["Pending", "Running"].includes(active.state)) return;
            const second = Schema.decodeUnknownSync(CompiledResult)(await env.DOCUMENTS.run(job));
            const issues = [
              ...(!first.validation.passed || !second.validation.passed
                ? ["Required text integrity checks failed."]
                : []),
              ...(first.fingerprint !== second.fingerprint
                ? ["Repeated renders produced different output."]
                : []),
              ...(first.templateIdentity !== identity || second.templateIdentity !== identity
                ? ["The runtime did not honor the exact graph."]
                : []),
              ...(first.rendererVersion !== CUSTOM_RENDERER_VERSION ||
              second.rendererVersion !== CUSTOM_RENDERER_VERSION
                ? ["The template renderer version is incompatible."]
                : []),
              ...(canonicalJson(first.resources) !== canonicalJson(second.resources)
                ? ["Document resources changed between renders."]
                : []),
            ];
            const artifacts = await storeCompiledArtifacts(
              env.ARTIFACTS,
              `retained/template-validations/${input.validationId}/${fixture.id}/${first.fingerprint}`,
              first,
            );
            await repository.publishTemplateFixture(input.ownerId, input.validationId, {
              id: fixture.id,
              name: fixture.name,
              passed: issues.length === 0,
              firstFingerprint: first.fingerprint,
              secondFingerprint: second.fingerprint,
              artifacts,
              validation: first.validation,
              diagnostic: issues.length ? issues.join(" ") : null,
            });
          },
        );
      } catch {
        await step.do(`failed-fixture-${fixture.id}`, () =>
          repository.publishTemplateFixture(input.ownerId, input.validationId, {
            id: fixture.id,
            name: fixture.name,
            passed: false,
            firstFingerprint: null,
            secondFingerprint: null,
            artifacts: null,
            validation: null,
            diagnostic:
              "The document runtime or artifact storage could not finish this fixture within its retry limit.",
          }),
        );
      }
    }
    await step.do("publish-validation", async () => {
      const operation = await repository.getOperation(operationId);
      if (operation && ["Pending", "Running"].includes(operation.state))
        await repository.completeTemplateValidation(input.ownerId, input.validationId);
    });
  } catch {
    await step.do("record-validation-failure", () =>
      repository.updateOperation(operationId, {
        state: "Failed",
        stage: "Synthetic fixture validation interrupted",
        failure:
          "The runtime could not finish every required fixture. Published fixture results and the Draft are preserved. Retry validation if attempts remain.",
      }),
    );
    throw new Error(`Template validation ${operationId} failed`);
  }
}
