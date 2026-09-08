import { env, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers";
import { createRepository, schema } from "@river/db";
import { builtInSchemaBundle, fingerprint, newId, type Principal, schemaKey } from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  composeGraph,
  expectedText,
  fixedPack,
  type TemplateGraph,
} from "@river/templates";
import { expect, it } from "vitest";
import { runTemplateValidation } from "../src/server/template-validation-workflow";

// Exercise workflow decisions against real D1/R2 with immediate steps and a synthetic compiler.
// This does not emulate the Workflow engine's scheduling or TeX compilation.
type StepContext = {
  step: { name: string; count: number };
  attempt: number;
  config: Record<string, never>;
};
const immediateStep: WorkflowStep = {
  async do<T>(
    name: string,
    configOrRun: WorkflowStepConfig | ((ctx: StepContext) => Promise<T>),
    run?: ((ctx: StepContext) => Promise<T>) | { rollback: unknown },
  ): Promise<T> {
    const callback =
      typeof configOrRun === "function" ? configOrRun : typeof run === "function" ? run : undefined;
    if (!callback) throw new Error("Missing workflow callback.");
    return callback({ step: { name, count: 1 }, attempt: 1, config: {} });
  },
  async sleep() {
    throw new Error("Unexpected sleep.");
  },
  async sleepUntil() {
    throw new Error("Unexpected sleep.");
  },
  async waitForEvent() {
    throw new Error("Unexpected event wait.");
  },
};

it.each([false, true])(
  "requires all layout renders before one-save approval (broken alternative: %s)",
  async (broken) => {
    const repository = createRepository(env.DB);
    const ownerId = newId();
    const actor: Principal = { kind: "owner", id: ownerId, ownerId };
    await repository.db.insert(schema.user).values({
      id: ownerId,
      email: `${ownerId}@example.test`,
      name: "Synthetic layout validation",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const graph: TemplateGraph = {
      ...fixedPack("classic"),
      composition: {
        ...builtInSchemaBundle,
        layouts: builtInSchemaBundle.layouts.map((layout) =>
          broken && layout.id === "experience-entry-compact"
            ? { ...layout, source: `\\begin{minipage}{invalid}${layout.source}\\end{minipage}` }
            : layout,
        ),
      },
    };
    const saved = await repository.saveTemplate(actor, {
      id: null,
      revision: null,
      name: "Every layout",
      scope: { level: "document", type: null },
      base: { kind: "fixed", theme: "classic" },
      source: graph.document.source,
      overrides: {},
      workingGraph: graph,
      idempotencyKey: "save",
    });
    if (!saved.revisionId) throw new Error("Missing template.");
    const detail = await repository.inspectTemplate(ownerId, saved.revisionId);
    const validation = await repository.startTemplateValidation(actor, {
      revisionId: saved.revisionId,
      revision: detail.revision.reviewRevision,
      approveOnSuccess: true,
      idempotencyKey: "validate",
    });
    if (!validation.revisionId) throw new Error("Missing operation.");
    const covered = new Set<string>();
    let renders = 0;
    const bindings = {
      ...env,
      DOCUMENTS: {
        async run(job: Parameters<typeof env.DOCUMENTS.run>[0]) {
          if (job.type !== "validate-template" || !job.templateGraph)
            throw new Error("Unexpected document job.");
          ++renders;
          for (const content of [
            job.document.structuredContact,
            ...job.document.sections.map((section) => section.structured),
          ])
            if (content) covered.add(schemaKey(content.record.layout));
          const tex = composeGraph(job.document, job.templateGraph).tex;
          if (tex.includes("\\begin{minipage}{invalid}"))
            throw new Error("Synthetic compiler rejected invalid length.");
          const text = expectedText(job.document);
          return {
            type: "compiled" as const,
            templateIdentity: job.templateIdentity,
            pdfBase64: btoa("synthetic pdf"),
            tex,
            extractedText: text,
            validation: {
              passed: true,
              expectedText: text,
              extractedText: text,
              errors: [],
              warnings: [],
            },
            fingerprint: await fingerprint(tex),
            durationMs: 1,
            rendererVersion: CUSTOM_RENDERER_VERSION,
            resources: {
              compiler: "synthetic",
              bundle: "synthetic",
              fonts: "synthetic",
              cacheDigest: "synthetic",
            },
          };
        },
      },
    };
    await runTemplateValidation(
      bindings,
      {
        payload: { operationId: validation.revisionId },
        timestamp: new Date(),
        instanceId: validation.revisionId,
        workflowName: "test-validation",
      },
      immediateStep,
    );
    expect(covered).toEqual(new Set(builtInSchemaBundle.layouts.map(schemaKey)));
    const result = await repository.inspectTemplateValidation(ownerId, validation.id);
    expect(result.template.revision.state).toBe(broken ? "Draft" : "Approved");
    expect(result.validation.report?.passed).toBe(!broken);
    expect(result.fixtures.find((item) => item.fixtureId === "all-types")?.result.passed).toBe(
      !broken,
    );
    expect(renders).toBe(broken ? 7 : 8);
  },
);
