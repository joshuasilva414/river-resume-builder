import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { CompiledResult } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import {
  builtInSchemaBundle,
  canonicalJson,
  fingerprint,
  newId,
  type Principal,
} from "@river/domain";
import {
  CUSTOM_RENDERER_VERSION,
  fixedPack,
  graphInventory,
  templateFixtures,
} from "@river/templates";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { storeCompiledArtifacts } from "../src/server/compiled-artifacts";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const scope = { level: "document", type: null } as const;
const resources = {
  compiler: "synthetic-compiler",
  bundle: "synthetic-bundle",
  fonts: "synthetic-fonts",
  cacheDigest: "synthetic-digest",
};
async function fixture(
  existing?: Awaited<ReturnType<typeof compositionFixture>>,
  composable = false,
) {
  const repository = existing?.repository ?? createRepository(env.DB),
    id = existing?.actor.ownerId ?? newId();
  const actor: Principal = existing?.actor ?? { kind: "owner", id, ownerId: id };
  if (!existing)
    await repository.db.insert(schema.user).values({
      id,
      email: `${id}@example.test`,
      name: "Synthetic template fixture",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  const input = {
    id: null,
    revision: null,
    name: "Fixture graph",
    scope,
    base: { kind: "fixed", theme: "classic" } as const,
    source: fixedPack("classic").document.source,
    overrides: { font: "Latin Modern Sans" as const },
    idempotencyKey: "save",
    ...(composable
      ? { workingGraph: { ...fixedPack("classic"), composition: builtInSchemaBundle } }
      : {}),
  };
  const draft = await repository.saveTemplate(actor, input);
  if (!draft.revisionId) throw Error("Missing revision");
  const revisionId = draft.revisionId;
  async function validate(mismatch = false, approveOnSuccess = false) {
    const current = await repository.inspectTemplate(id, revisionId);
    const validation = await repository.startTemplateValidation(actor, {
      revisionId,
      revision: current.revision.reviewRevision,
      idempotencyKey: "validation",
      approveOnSuccess,
    });
    for (const item of templateFixtures) {
      const digest = await fingerprint(item.id);
      await repository.publishTemplateFixture(id, validation.id, {
        id: item.id,
        name: item.name,
        passed: true,
        firstFingerprint: digest,
        secondFingerprint: mismatch && item.id === templateFixtures[0].id ? "changed" : digest,
        validation: {
          passed: true,
          expectedText: "Synthetic",
          extractedText: "Synthetic",
          errors: [],
          warnings: [],
        },
        artifacts: {
          pdf: `fixture/${item.id}/pdf`,
          tex: `fixture/${item.id}/tex`,
          text: `fixture/${item.id}/text`,
          report: `fixture/${item.id}/report`,
          fingerprint: digest,
          durationMs: 1,
          resources,
          rendererVersion: CUSTOM_RENDERER_VERSION,
          validationPassed: true,
          templateIdentity: canonicalJson(graphInventory(current.revision.graph)),
        },
        diagnostic: null,
      });
    }
    await repository.completeTemplateValidation(id, validation.id);
    const detail = await repository.inspectTemplateValidation(id, validation.id);
    if (!detail.validation.reportDigest) throw Error("Missing report digest");
    return {
      revisionId,
      revision: detail.template.revision.reviewRevision,
      validationId: validation.id,
      reportDigest: detail.validation.reportDigest,
      visualReview: true as const,
      idempotencyKey: "approve",
    };
  }
  return { repository, actor, input, draft, revisionId, validate };
}
it("creates immutable complete graphs with permanent idempotency and one concurrent head update", async () => {
  const { repository, actor, input, draft, revisionId } = await fixture();
  expect(await repository.saveTemplate(actor, input)).toEqual(draft);
  const before = await repository.inspectTemplate(actor.id, revisionId);
  const edit = {
    ...input,
    id: draft.id,
    revision: 0,
    base: { kind: "saved" as const, revisionId },
    overrides: { bodySize: 11 },
    idempotencyKey: "edit",
  };
  const results = await Promise.allSettled([
    repository.saveTemplate(actor, edit),
    repository.saveTemplate(actor, {
      ...edit,
      name: "Competing edit",
      idempotencyKey: "competing",
    }),
  ]);
  expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((item) => item.status === "rejected")).toEqual([
    expect.objectContaining({ reason: expect.objectContaining({ code: "Conflict" }) }),
  ]);
  const after = await repository.inspectTemplate(actor.id, revisionId);
  expect(after.revision.graph).toEqual(before.revision.graph);
  expect(after.design.revision).toBe(1);
  expect(after.revisions).toHaveLength(2);
  const receipts = await repository.db
    .select()
    .from(schema.receipts)
    .where(eq(schema.receipts.actorId, actor.id));
  expect(receipts).toHaveLength(2);
  const saved = results.find((item) => item.status === "fulfilled");
  if (saved?.status !== "fulfilled" || !saved.value.revisionId)
    throw Error("Missing saved revision");
  const next = await repository.inspectTemplate(actor.id, saved.value.revisionId);
  expect(next.revision.graph.blocks).toEqual(before.revision.graph.blocks);
  expect(next.revision.graph.sections).toEqual(before.revision.graph.sections);
  expect(next.revision.graph.document.manifest.revision).toBe(2);
});
it("rejects prohibited fragments and external principals without writing a graph", async () => {
  const { repository, actor, input } = await fixture();
  await expect(
    repository.saveTemplate(actor, {
      ...input,
      source: `${input.source}\\input{private}`,
      idempotencyKey: "prohibited",
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(
    repository.saveTemplate(
      { kind: "agent", id: newId(), ownerId: actor.id, scopes: [] },
      { ...input, idempotencyKey: "agent" },
    ),
  ).rejects.toMatchObject({ code: "Forbidden" });
  await expect(
    repository.saveTemplate(actor, {
      ...input,
      scope: { level: "block", type: "summary" },
      source:
        fixedPack("classic").blocks.find((item) => item.manifest.contentTypes.includes("summary"))
          ?.source ?? "",
      overrides: { margin: 0.75 },
      idempotencyKey: "scope",
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect((await repository.listTemplates(actor.id, { state: null, offset: 0 })).items).toHaveLength(
    1,
  );
});
it("requires every exact fixture before approval and preserves a captured mixed graph after donor retirement", async () => {
  const { repository, actor, revisionId, validate } = await fixture();
  await expect(
    repository.approveTemplate(actor, {
      revisionId,
      revision: 0,
      validationId: newId(),
      reportDigest: "a".repeat(64),
      visualReview: true,
      idempotencyKey: "unvalidated",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const review = await validate();
  await expect(
    repository.approveTemplate(actor, {
      ...review,
      reportDigest: "b".repeat(64),
      idempotencyKey: "wrong-report",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await repository.approveTemplate(actor, review);
  const approved = await repository.inspectTemplate(actor.id, revisionId);
  const mix = await repository.mixTemplate(actor, {
    name: "Independent combination",
    base: { kind: "fixed", theme: "minimal" },
    picks: [{ scope, donor: { kind: "saved", revisionId } }],
    idempotencyKey: "mix",
  });
  if (!mix.revisionId) throw Error("Missing mixed graph");
  const mixedBefore = await repository.inspectTemplate(actor.id, mix.revisionId);
  expect(mixedBefore.revision.state).toBe("Draft");
  await repository.retireTemplate(actor, {
    revisionId,
    revision: approved.revision.reviewRevision,
    rationale: "Synthetic retirement",
    idempotencyKey: "retire",
  });
  expect(await repository.approveTemplate(actor, review)).toEqual({
    id: revisionId,
    revision: approved.revision.reviewRevision,
    revisionId,
  });
  const mixedAfter = await repository.inspectTemplate(actor.id, mix.revisionId);
  expect(mixedAfter.revision).toEqual(mixedBefore.revision);
  expect(
    mixedAfter.revision.origins.some(
      (origin) => origin.base.kind === "saved" && origin.base.revisionId === revisionId,
    ),
  ).toBe(true);
  await expect(
    repository.mixTemplate(actor, {
      name: "Retired donor",
      base: { kind: "saved", revisionId },
      picks: [{ scope, donor: { kind: "fixed", theme: "classic" } }],
      idempotencyKey: "retired",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("blocks nondeterministic fixtures, excludes cancelled late output, and bounds validation attempts", async () => {
  const { repository, actor, revisionId, validate } = await fixture();
  const review = await validate(true);
  await expect(repository.approveTemplate(actor, review)).rejects.toMatchObject({
    code: "Conflict",
  });
  let detail = await repository.inspectTemplate(actor.id, revisionId);
  expect(detail.revision.state).toBe("Draft");
  for (let i = 0; i < 2; i++) {
    const attempt = await repository.startTemplateValidation(actor, {
      revisionId,
      revision: detail.revision.reviewRevision,
      idempotencyKey: `retry-${i}`,
    });
    if (!attempt.revisionId) throw Error("Missing operation");
    await expect(repository.completeTemplateValidation(actor.id, attempt.id)).rejects.toThrow(
      "complete fixture set",
    );
    await repository.cancelOperation(actor.id, attempt.revisionId, `cancel-${i}`);
    expect(
      await repository.publishTemplateFixture(actor.id, attempt.id, {
        id: templateFixtures[0].id,
        name: "Fixture",
        passed: false,
        firstFingerprint: null,
        secondFingerprint: null,
        artifacts: null,
        validation: null,
        diagnostic: "Cancelled",
      }),
    ).toBeNull();
    detail = await repository.inspectTemplate(actor.id, revisionId);
  }
  await expect(
    repository.startTemplateValidation(actor, {
      revisionId,
      revision: detail.revision.reviewRevision,
      idempotencyKey: "exhausted",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(detail.revision.validationAttempts).toBe(3);
});
it("recovers a partially stored immutable document and rejects changed bytes at an existing key", async () => {
  const prefix = `fixture/${newId()}`;
  const result: CompiledResult = {
    type: "compiled",
    pdfBase64: btoa("Synthetic PDF bytes"),
    tex: "Synthetic tex",
    extractedText: "Synthetic text",
    validation: {
      passed: true,
      expectedText: "Synthetic text",
      extractedText: "Synthetic text",
      errors: [],
      warnings: [],
    },
    fingerprint: "synthetic-fingerprint",
    durationMs: 1,
    rendererVersion: CUSTOM_RENDERER_VERSION,
    resources,
  };
  await env.ARTIFACTS.put(`${prefix}/resume.pdf`, "Synthetic PDF bytes");
  const manifest = await storeCompiledArtifacts(env.ARTIFACTS, prefix, result);
  expect(await storeCompiledArtifacts(env.ARTIFACTS, prefix, result)).toEqual(manifest);
  expect(await (await env.ARTIFACTS.get(manifest.tex))?.text()).toBe(result.tex);
  await expect(
    storeCompiledArtifacts(env.ARTIFACTS, prefix, { ...result, tex: "Changed bytes" }),
  ).rejects.toThrow("integrity");
});

it("pins an exact approved graph into previews and checkpoints while retirement blocks only new bindings", async () => {
  const composition = await compositionFixture();
  const { repository, actor, revisionId, draft: design, validate } = await fixture(composition);
  const binding = { designId: design.id, revisionId };
  const data = { ...composition.data, template: binding };
  await expect(
    repository.saveResume(actor, {
      id: composition.draft.id,
      revision: 0,
      data,
      idempotencyKey: "unapproved-binding",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await repository.getResume(actor.id, composition.draft.id))?.revision).toBe(0);
  await repository.approveTemplate(actor, await validate());
  await repository.saveResume(actor, {
    id: composition.draft.id,
    revision: 0,
    data,
    idempotencyKey: "bind",
  });
  const preview = await repository.previewResume(actor, {
    id: composition.draft.id,
    revision: 1,
    idempotencyKey: "preview",
  });
  const operation = await repository.getOperation(preview.id);
  if (!operation || !("document" in operation.input)) throw Error("Missing document input");
  const exact = await repository.getTemplateRevision(actor.id, revisionId);
  expect(operation.input.templateGraph).toEqual(exact.revision.graph);
  expect(operation.input.templateIdentity).toBe(
    canonicalJson(graphInventory(exact.revision.graph)),
  );
  await repository.updateOperation(preview.id, {
    state: "Failed",
    stage: "Synthetic test completion",
  });
  const captured = await repository.captureCheckpoint(actor, {
    id: composition.draft.id,
    revision: 1,
    idempotencyKey: "capture",
  });
  await repository.retireTemplate(actor, {
    revisionId,
    revision: exact.revision.reviewRevision,
    rationale: "Synthetic binding test",
    idempotencyKey: "retire",
  });
  await repository.saveResume(actor, {
    id: composition.draft.id,
    revision: 1,
    data: { ...data, name: "Newer work" },
    idempotencyKey: "rename",
  });
  await expect(
    repository.branchResume(actor, {
      id: composition.draft.id,
      revision: 1,
      data,
      idempotencyKey: "retired-branch",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const after = await repository.inspectCheckpoint(actor.id, captured.id);
  expect(after.checkpoint.templateGraph).toEqual(exact.revision.graph);
  expect(after.checkpoint.data.name).toBe(composition.data.name);
  expect(after.checkpoint.data.template).toEqual(binding);
  const retainedPreview = await repository.previewResume(actor, {
    id: composition.draft.id,
    revision: 2,
    idempotencyKey: "retired-preview",
  });
  const retainedOperation = await repository.getOperation(retainedPreview.id);
  expect(retainedOperation?.input).toMatchObject({ templateGraph: exact.revision.graph });
  const refs = await repository.db
    .select()
    .from(schema.resumeTemplateReferences)
    .where(eq(schema.resumeTemplateReferences.draftId, composition.draft.id));
  expect(refs).toEqual([{ draftId: composition.draft.id, revisionId }]);
  await repository.saveResume(actor, {
    id: composition.draft.id,
    revision: 2,
    data: { ...composition.data, name: "Fixed pack branch" },
    idempotencyKey: "fixed",
  });
  expect(
    await repository.db
      .select()
      .from(schema.resumeTemplateReferences)
      .where(eq(schema.resumeTemplateReferences.draftId, composition.draft.id)),
  ).toHaveLength(0);
  expect(
    (await repository.inspectCheckpoint(actor.id, captured.id)).checkpoint.templateGraph,
  ).toEqual(exact.revision.graph);
});

it("saves a complete working schema graph once and makes it usable after successful sample checks", async () => {
  const { repository, actor, input, draft, revisionId, validate } = await fixture(undefined, true);
  expect(await repository.saveTemplate(actor, input)).toEqual(draft);
  const before = await repository.inspectTemplate(actor.ownerId, revisionId);
  expect(before.revision.graph.composition).toEqual(builtInSchemaBundle);
  await validate(false, true);
  const saved = await repository.inspectTemplate(actor.ownerId, revisionId);
  expect(saved.revision.state).toBe("Approved");
  expect(saved.revisions).toHaveLength(1);
  expect(saved.revision.graph).toEqual(before.revision.graph);
});
it("retains the working schema graph as a draft when a sample check fails", async () => {
  const { repository, actor, revisionId, validate } = await fixture(undefined, true);
  await validate(true, true);
  const saved = await repository.inspectTemplate(actor.ownerId, revisionId);
  expect(saved.revision.state).toBe("Draft");
  expect(saved.revision.graph.composition).toEqual(builtInSchemaBundle);
});
