import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { schema } from "@river/db";
import { type Composition, canonicalJson, type EvidenceMaterial, newId } from "@river/domain";
import { RENDERER_VERSION, templateInventory } from "@river/templates";
import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const templates = canonicalJson(templateInventory("classic"));
it("blocks export when successful artifacts identify a different template or renderer", async () => {
  const { repository, actor, draft } = await compositionFixture();
  const captured = await repository.captureCheckpoint(actor, {
    id: draft.id,
    revision: 0,
    idempotencyKey: "capture-identity",
  });
  const detail = await repository.inspectCheckpoint(actor.id, captured.id);
  if (!detail.operation) throw Error("Missing checkpoint operation");
  const request = {
    id: captured.id,
    revision: detail.state.revision,
    reportId: detail.report.id,
    digest: detail.report.digest,
  };
  const acknowledged = await repository.acknowledgeCheckpoint(actor, {
    ...request,
    issueIds: detail.report.issues.map((issue) => issue.id),
    idempotencyKey: "ack-identity",
  });
  const artifacts = {
    pdf: "retained/pdf",
    tex: "retained/tex",
    text: "retained/text",
    report: "retained/report",
    fingerprint: "fixture",
    durationMs: 1,
    validationPassed: true,
    rendererVersion: RENDERER_VERSION,
    templateIdentity: templates,
  };
  for (const mismatch of [
    { rendererVersion: "unknown-runtime" },
    { templateIdentity: "other-graph" },
  ]) {
    await repository.db
      .update(schema.operations)
      .set({ state: "Succeeded", artifacts: { ...artifacts, ...mismatch } })
      .where(eq(schema.operations.id, detail.operation.id));
    await expect(
      repository.exportCheckpoint(actor, {
        ...request,
        revision: acknowledged.revision,
        idempotencyKey: `export-${JSON.stringify(mismatch)}`,
      }),
    ).rejects.toMatchObject({ code: "InvalidInput" });
  }
  await repository.db
    .update(schema.operations)
    .set({ artifacts })
    .where(eq(schema.operations.id, detail.operation.id));
  await repository.exportCheckpoint(actor, {
    ...request,
    revision: acknowledged.revision,
    idempotencyKey: "export-exact",
  });
  expect((await repository.inspectCheckpoint(actor.id, captured.id)).exported).not.toBeNull();
});
it("captures the exact saved revision once and preserves it after newer draft and library edits", async () => {
  const { repository, actor, draft, data, content } = await compositionFixture();
  const input = { id: draft.id, revision: 0, idempotencyKey: "capture" };
  const captured = await repository.captureCheckpoint(actor, input, templates);
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: { ...data, name: "Newer draft" },
    idempotencyKey: "edit",
  });
  await repository.saveLibrary(actor, {
    id: content.itemId,
    revision: 0,
    label: "Changed library",
    rationale: "Separate revision",
    data: { kind: "content", type: "summary", wording: "Changed library wording", evidence: [] },
    idempotencyKey: "library-edit",
  });
  expect(await repository.captureCheckpoint(actor, input, templates)).toEqual(captured);
  const checkpoint = await repository.inspectCheckpoint(actor.id, captured.id);
  expect(checkpoint.checkpoint.data.name).toBe("Fixture draft");
  expect(checkpoint.checkpoint.document.sections[0]?.blocks[0]?.paragraphs).toEqual([
    "Original synthetic wording.",
  ]);
  expect(checkpoint.checkpoint.templateIdentity).toBe(templates);
  await expect(
    repository.captureCheckpoint(actor, { ...input, idempotencyKey: "stale" }, templates),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(
    (await repository.listCheckpoints(actor.id, { draftId: draft.id, offset: 0 })).items,
  ).toHaveLength(1);
  expect(
    await repository.db
      .select()
      .from(schema.audit)
      .where(
        and(eq(schema.audit.command, "capture-checkpoint"), eq(schema.audit.entityId, captured.id)),
      ),
  ).toHaveLength(1);
});
it("keeps each issue separate, rejects unseen review changes, and freezes the original export", async () => {
  const { repository, actor, draft, data } = await compositionFixture();
  const material: EvidenceMaterial = {
    assertion: "Synthetic unsupported evidence",
    citations: [],
    contexts: [],
  };
  const claim = await repository.createEvidence(
    actor,
    {
      material,
      metadata: { label: "Fixture", tags: [], notes: "Synthetic" },
      idempotencyKey: "claim",
    },
    material,
  );
  if (!claim.revisionId) throw Error("Missing evidence");
  const evidence = [{ claimId: claim.id, revisionId: claim.revisionId }];
  const revised: Composition = {
    ...data,
    sections: data.sections.map((section) =>
      section.type !== "summary"
        ? section
        : {
            ...section,
            blocks: section.blocks.map((block) => ({
              ...block,
              fields: block.fields.map((field) => ({
                ...field,
                contents: field.contents.map((content) => ({
                  ...content,
                  override: { wording: "Synthetic evidence wording", evidence, reason: "Fixture" },
                })),
              })),
            })),
          },
    ),
  };
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: revised,
    idempotencyKey: "link",
  });
  const captured = await repository.captureCheckpoint(
    actor,
    { id: draft.id, revision: 1, idempotencyKey: "capture" },
    templates,
  );
  let detail = await repository.inspectCheckpoint(actor.id, captured.id);
  expect(detail.report.issues.map((issue) => issue.kind).sort()).toEqual([
    "Draft",
    "Unsupported",
    "Unsupported",
  ]);
  const oldInput = {
    id: captured.id,
    revision: detail.state.revision,
    reportId: detail.report.id,
    digest: detail.report.digest,
  };
  await repository.acknowledgeCheckpoint(actor, {
    ...oldInput,
    idempotencyKey: "ack-first",
    issueIds: detail.report.issues.map((issue) => issue.id),
  });
  await repository.archiveEvidence(actor, {
    id: claim.id,
    revision: 0,
    archived: true,
    rationale: "Synthetic archive",
    idempotencyKey: "archive",
  });
  if (!detail.operation) throw Error("No operation");
  await repository.updateOperation(detail.operation.id, {
    state: "Succeeded",
    stage: "PDF ready",
    artifacts: {
      pdf: "retained/pdf",
      tex: "retained/tex",
      text: "retained/text",
      report: "retained/report",
      fingerprint: "fixture",
      durationMs: 1,
      validationPassed: true,
      rendererVersion: RENDERER_VERSION,
      templateIdentity: templates,
    },
  });
  const refreshed = await repository.exportCheckpoint(actor, {
    ...oldInput,
    revision: 1,
    idempotencyKey: "export-changed",
  });
  expect(refreshed.revisionId).not.toBe(oldInput.reportId);
  detail = await repository.inspectCheckpoint(actor.id, captured.id);
  expect(detail.exported).toBeNull();
  expect(detail.acknowledgments).toHaveLength(0);
  expect(detail.report.issues.map((issue) => issue.kind).sort()).toEqual([
    "Archived",
    "Draft",
    "Unsupported",
    "Unsupported",
  ]);
  await expect(
    repository.acknowledgeCheckpoint(actor, {
      ...oldInput,
      revision: detail.state.revision,
      issueIds: [],
      idempotencyKey: "stale-ack",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  const current = {
    id: captured.id,
    revision: detail.state.revision,
    reportId: detail.report.id,
    digest: detail.report.digest,
  };
  await expect(
    repository.exportCheckpoint(actor, { ...current, idempotencyKey: "missing-acks" }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await repository.acknowledgeCheckpoint(actor, {
    ...current,
    issueIds: detail.report.issues.map((issue) => issue.id),
    idempotencyKey: "ack-current",
  });
  await repository.exportCheckpoint(actor, {
    ...current,
    revision: current.revision + 1,
    idempotencyKey: "export",
  });
  const original = await repository.inspectCheckpoint(actor.id, captured.id);
  await repository.archiveEvidence(actor, {
    id: claim.id,
    revision: 1,
    archived: false,
    rationale: "Restore fixture",
    idempotencyKey: "restore",
  });
  await repository.reviewCheckpoint(actor, {
    id: captured.id,
    revision: original.state.revision,
    idempotencyKey: "review-exported",
  });
  expect((await repository.inspectCheckpoint(actor.id, captured.id)).report).toEqual(
    original.report,
  );
  expect((await repository.inspectCheckpoint(actor.id, captured.id)).exported).toEqual(
    original.exported,
  );
});
it("blocks artifacts without valid document checks and denies other owners or agents", async () => {
  const { repository, actor, draft } = await compositionFixture();
  const captured = await repository.captureCheckpoint(
    actor,
    { id: draft.id, revision: 0, idempotencyKey: "capture" },
    templates,
  );
  const detail = await repository.inspectCheckpoint(actor.id, captured.id);
  const input = {
    id: captured.id,
    revision: 0,
    reportId: detail.report.id,
    digest: detail.report.digest,
  };
  await expect(
    repository.exportCheckpoint(actor, { ...input, idempotencyKey: "unfinished" }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(repository.inspectCheckpoint(newId(), captured.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  await expect(
    repository.acknowledgeCheckpoint(
      { kind: "agent", id: newId(), ownerId: actor.id, scopes: [] },
      { ...input, idempotencyKey: "agent", issueIds: [] },
    ),
  ).rejects.toMatchObject({ code: "Forbidden" });
  if (!detail.operation) throw Error("Missing operation");
  await repository.updateOperation(detail.operation.id, {
    state: "Failed",
    stage: "Text integrity failed",
    artifacts: {
      pdf: "fixture",
      tex: "fixture",
      text: "fixture",
      report: "fixture",
      fingerprint: "fixture",
      durationMs: 1,
      validationPassed: false,
    },
  });
  await expect(
    repository.retryCheckpoint(actor, {
      id: captured.id,
      revision: 0,
      idempotencyKey: "retry-invalid",
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
});

it("pins historical context values and requires a new report when that context changes", async () => {
  const { repository, actor, draft, data } = await compositionFixture();
  const contextData = {
    kind: "Employment" as const,
    label: "Synthetic employer",
    organization: "Before",
    role: "Engineer",
    startDate: "",
    endDate: "",
    details: "Original context",
    contact: null,
  };
  const context = await repository.saveContext(actor, {
    id: null,
    revision: null,
    idempotencyKey: "context",
    data: contextData,
  });
  if (!context.revisionId) throw Error("Missing context");
  const material: EvidenceMaterial = {
    assertion: "Synthetic evidence",
    citations: [],
    contexts: [{ id: context.id, revisionId: context.revisionId }],
  };
  const claim = await repository.createEvidence(
    actor,
    { idempotencyKey: "claim", material, metadata: { label: "", tags: [], notes: "" } },
    material,
  );
  if (!claim.revisionId) throw Error("Missing claim");
  await repository.reviewEvidence(actor, {
    id: claim.id,
    revision: 0,
    revisionId: claim.revisionId,
    state: "Needs clarification",
    rationale: "Confirm the scope",
    idempotencyKey: "review",
  });
  const evidence = [{ claimId: claim.id, revisionId: claim.revisionId }];
  const linked = {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        fields: block.fields.map((field) => ({
          ...field,
          contents: field.contents.map((content) => ({
            ...content,
            override: { wording: "Synthetic pinned wording", evidence, reason: "Fixture" },
          })),
        })),
      })),
    })),
  };
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    idempotencyKey: "link",
    data: linked,
  });
  const captured = await repository.captureCheckpoint(
    actor,
    { id: draft.id, revision: 1, idempotencyKey: "capture" },
    templates,
  );
  const before = await repository.inspectCheckpoint(actor.id, captured.id);
  expect(before.report.issues.some((issue) => issue.kind === "Needs clarification")).toBe(true);
  await repository.saveContext(actor, {
    id: context.id,
    revision: 0,
    idempotencyKey: "change-context",
    data: { ...contextData, organization: "After" },
  });
  const result = await repository.reviewCheckpoint(actor, {
    id: captured.id,
    revision: 0,
    idempotencyKey: "refresh",
  });
  expect(result.revisionId).not.toBe(before.report.id);
  const after = await repository.inspectCheckpoint(actor.id, captured.id);
  expect(after.checkpoint.evidence[0]?.contexts[0]?.data.organization).toBe("Before");
  expect(after.report.issues.filter((issue) => issue.kind === "Stale")).toHaveLength(2);
});
