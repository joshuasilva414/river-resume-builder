import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ArtifactManifest, ReviewSourceRefinementRequest } from "@river/contracts";
import { type RefinementBaseArtifacts, schema } from "@river/db";
import { canonicalJson, newId, type Principal } from "@river/domain";
import {
  compose,
  expectedText,
  RENDERER_VERSION,
  refinedSourceIdentity,
  SOURCE_RENDERER_VERSION,
  type SourceRefinementOutput,
  type SourceRefinementProfile,
} from "@river/templates";
import { and, eq } from "drizzle-orm";
import { beforeAll, expect, it, vi } from "vitest";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const profile: SourceRefinementProfile = {
  model: "gpt-5.4-mini-2026-03-17",
  contract: "river-source-refinement-v1",
  maxInputCharacters: 160000,
  maxOutputTokens: 24000,
  timeoutMs: 60000,
};
async function fixture() {
  const f = await compositionFixture(),
    { repository: r, actor } = f;
  const claim = await r.createEvidence(
    actor,
    {
      idempotencyKey: "source-support",
      material: { assertion: "Original synthetic wording.", citations: [], contexts: [] },
      metadata: { label: "Synthetic", tags: [], notes: "" },
    },
    { assertion: "Original synthetic wording.", citations: [], contexts: [] },
  );
  if (!claim.revisionId) throw new Error("Missing fixture evidence");
  const reference = { claimId: claim.id, revisionId: claim.revisionId };
  const data = {
    ...f.data,
    sections: f.data.sections.map((section) =>
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
                  override: {
                    wording: "Original synthetic wording.",
                    evidence: [reference],
                    reason: "Pinned source support.",
                  },
                })),
              })),
            })),
          },
    ),
  };
  await r.saveResume(actor, {
    id: f.draft.id,
    revision: 0,
    idempotencyKey: "source-support-draft",
    data,
  });
  const captured = await r.captureCheckpoint(actor, {
    id: f.draft.id,
    revision: 1,
    idempotencyKey: "source-checkpoint",
  });
  const detail = await r.inspectCheckpoint(actor.ownerId, captured.id);
  if (!detail.operation) throw new Error("Missing operation");
  const artifacts: ArtifactManifest = {
    pdf: "retained/base/pdf",
    tex: "retained/base/tex",
    text: "retained/base/text",
    report: "retained/base/report",
    fingerprint: "b".repeat(64),
    rendererVersion: RENDERER_VERSION,
    validationPassed: true,
    templateIdentity: detail.checkpoint.templateIdentity,
    durationMs: 1,
  };
  await r.updateOperation(detail.operation.id, {
    state: "Succeeded",
    stage: "Fixture ready",
    artifacts,
  });
  const base: RefinementBaseArtifacts = {
    operationId: detail.operation.id,
    artifacts,
    source: compose(detail.checkpoint.document, "classic").tex,
    extractedText: expectedText(detail.checkpoint.document),
    digests: {
      pdf: "1".repeat(64),
      tex: "2".repeat(64),
      text: "3".repeat(64),
      report: "4".repeat(64),
    },
  };
  const request = {
    checkpointId: captured.id,
    operationId: detail.operation.id,
    goal: "Refine only spacing.",
    idempotencyKey: "source-start",
  };
  const started = await r.startSourceRefinement(actor, request, base, profile);
  const task = await r.inspectSourceRefinement(actor.ownerId, started.id);
  const output: SourceRefinementOutput = {
    source: `${base.source}\n% Complete source candidate`,
    fields: task.task.input.checkpoint.fields.map((field) => ({
      baseLocator: field.locator,
      text: field.text,
      evidence: field.evidence,
      meaning: { assessment: "Preserved", explanation: "Unchanged wording." },
    })),
    explanation: "Synthetic layout correction.",
  };
  const candidate = async (value: SourceRefinementOutput = output) => {
    await r.publishSourceRefinementCandidate(
      actor.ownerId,
      started.id,
      task.task.latestOperationId,
      value,
    );
    const ready = await r.inspectSourceRefinement(actor.ownerId, started.id);
    const p = ready.proposal;
    if (!p?.payload) throw new Error("Missing candidate");
    const identity = await refinedSourceIdentity(
      p.payload.source,
      p.payload.fields,
      task.task.input.checkpoint.baseTemplateIdentity,
    );
    const preview: ArtifactManifest = {
      ...artifacts,
      rendererVersion: SOURCE_RENDERER_VERSION,
      templateIdentity: identity,
      fingerprint: "c".repeat(64),
      expiresAt: Date.now() + 7 * 86400000,
      pdf: `transient/source-proposals/${started.id}/pdf`,
      tex: `transient/source-proposals/${started.id}/tex`,
      text: `transient/source-proposals/${started.id}/text`,
      report: `transient/source-proposals/${started.id}/report`,
    };
    await r.publishSourceRefinementPreview(
      actor.ownerId,
      started.id,
      task.task.latestOperationId,
      preview,
      p.payload.fields.map((field) => field.text).join("\n"),
      "d".repeat(64),
    );
  };
  const review = async (): Promise<ReviewSourceRefinementRequest> => {
    const row = await r.inspectSourceRefinement(actor.ownerId, started.id),
      p = row.proposal;
    if (!p) throw new Error("Missing proposal");
    return {
      id: started.id,
      revision: row.task.revision,
      proposalId: p.id,
      candidateDigest: p.candidateDigest,
      previewOperationId: p.previewOperationId,
      reviewDigest: p.reviewDigest,
      coverageConfirmed: true,
      decision: "Accepted",
      idempotencyKey: "source-accept",
    };
  };
  const acceptance = async () => {
    const request = await review(),
      result = await r.reviewSourceRefinement(actor, request);
    const row = await r.inspectSourceRefinement(actor.ownerId, started.id),
      p = row.proposal;
    if (!result.revisionId || !p?.resultCheckpointId || !p.previewArtifacts)
      throw new Error("Missing acceptance intent");
    const { expiresAt: _expiresAt, ...metadata } = p.previewArtifacts;
    const prefix = `retained/checkpoints/${p.resultCheckpointId}/${metadata.fingerprint}`;
    const retained: ArtifactManifest = {
      ...metadata,
      pdf: `${prefix}/resume.pdf`,
      tex: `${prefix}/resume.tex`,
      text: `${prefix}/resume.txt`,
      report: `${prefix}/validation.json`,
    };
    return {
      result,
      retained,
      checkpointId: p.resultCheckpointId,
      operationId: result.revisionId,
      request,
    };
  };
  return {
    ...f,
    data,
    claim,
    reference,
    base,
    captured,
    request,
    started,
    output,
    candidate,
    review,
    acceptance,
  };
}

it("captures complete immutable input and exact dependencies, keeps permanent replay, and denies Agent mutation", async () => {
  const f = await fixture(),
    r = f.repository;
  const task = await r.inspectSourceRefinement(f.actor.ownerId, f.started.id);
  expect(task.task.input.checkpoint.source).toBe(f.base.source);
  expect(task.task.input.checkpoint.digests).toEqual(f.base.digests);
  expect(task.task.dependencies.claims).toEqual([{ id: f.claim.id, revision: 0 }]);
  expect(task.task.input.checkpoint.fields.filter((field) => field.required)).toHaveLength(3);
  expect(
    await r.startSourceRefinement(
      f.actor,
      f.request,
      { ...f.base, source: "unavailable now" },
      null,
    ),
  ).toEqual(f.started);
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: f.actor.ownerId,
    scopes: ["evidence:write"],
  };
  await expect(
    r.startSourceRefinement(agent, { ...f.request, idempotencyKey: "agent" }, f.base, profile),
  ).rejects.toMatchObject({ code: "Forbidden" });
  await expect(r.inspectSourceRefinement(newId(), f.started.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  expect(
    (await r.listSourceRefinements(f.actor.ownerId, { checkpointId: f.captured.id, offset: 0 }))
      .items,
  ).toHaveLength(1);
});

it("requires complete current review and creates an immutable source checkpoint without replacing newer work or old acknowledgments", async () => {
  const f = await fixture(),
    r = f.repository;
  const changed = "Refined synthetic wording.";
  await f.candidate({
    ...f.output,
    source: f.output.source.replace("Original synthetic wording.", changed),
    fields: f.output.fields.map((field) =>
      field.text === "Original synthetic wording." ? { ...field, text: changed } : field,
    ),
  });
  const request = await f.review();
  for (const override of [{ coverageConfirmed: false }, { reviewDigest: "unseen" }])
    await expect(
      r.reviewSourceRefinement(f.actor, {
        ...request,
        ...override,
        idempotencyKey: canonicalJson(override),
      }),
    ).rejects.toMatchObject({ code: "InvalidInput" });
  const original = await r.inspectCheckpoint(f.actor.ownerId, f.captured.id);
  await r.acknowledgeCheckpoint(f.actor, {
    id: original.checkpoint.id,
    revision: original.state.revision,
    reportId: original.report.id,
    digest: original.report.digest,
    issueIds: original.report.issues.map((issue) => issue.id),
    idempotencyKey: "old-ack",
  });
  await r.saveResume(f.actor, {
    id: f.draft.id,
    revision: 1,
    data: { ...f.data, name: "Newer working draft" },
    idempotencyKey: "newer",
  });
  const publication = await f.acceptance();
  const saved = await r.finalizeSourceRefinement(
    f.actor.ownerId,
    f.started.id,
    publication.operationId,
    publication.retained,
  );
  expect(
    await r.finalizeSourceRefinement(
      f.actor.ownerId,
      f.started.id,
      publication.operationId,
      publication.retained,
    ),
  ).toEqual(saved);
  const cp = await r.inspectCheckpoint(f.actor.ownerId, saved.id);
  expect(cp.source).toMatchObject({
    baseCheckpointId: f.captured.id,
    structuredBaseId: f.captured.id,
  });
  expect(cp.source?.source).toContain(changed);
  expect(cp.checkpoint.document).toEqual(original.checkpoint.document);
  expect(cp.acknowledgments).toHaveLength(0);
  expect(
    cp.report.issues.some(
      (issue) => issue.kind === "Needs clarification" && issue.wording === changed,
    ),
  ).toBe(true);
  expect((await r.getResume(f.actor.ownerId, f.draft.id))?.data.name).toBe("Newer working draft");
  expect((await r.inspectCheckpoint(f.actor.ownerId, f.captured.id)).source).toBeNull();
  expect((await r.inspectSourceRefinement(f.actor.ownerId, f.started.id)).proposal?.state).toBe(
    "Accepted",
  );
  const exportInput = {
    id: saved.id,
    revision: cp.state.revision,
    reportId: cp.report.id,
    digest: cp.report.digest,
  };
  await expect(
    r.exportCheckpoint(f.actor, { ...exportInput, idempotencyKey: "source-unack-export" }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  const ack = await r.acknowledgeCheckpoint(f.actor, {
    ...exportInput,
    issueIds: cp.report.issues.map((issue) => issue.id),
    idempotencyKey: "source-ack",
  });
  await r.exportCheckpoint(f.actor, {
    ...exportInput,
    revision: ack.revision,
    idempotencyKey: "source-export",
  });
  expect((await r.inspectCheckpoint(f.actor.ownerId, saved.id)).exported).not.toBeNull();
  expect(
    (await r.listCheckpoints(f.actor.ownerId, { draftId: f.draft.id, offset: 0 })).items,
  ).toHaveLength(2);
});

it("rolls back checkpoint, review, acceptance, audit and receipt when evidence changes during final publication", async () => {
  const f = await fixture(),
    r = f.repository;
  await f.candidate();
  const publication = await f.acceptance();
  const originalBatch = r.db.batch.bind(r.db);
  const batch = vi.spyOn(r.db, "batch").mockImplementation(async (statements) => {
    batch.mockRestore();
    await r.db.update(schema.claims).set({ revision: 1 }).where(eq(schema.claims.id, f.claim.id));
    return originalBatch(statements);
  });
  await expect(
    r.finalizeSourceRefinement(
      f.actor.ownerId,
      f.started.id,
      publication.operationId,
      publication.retained,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  await expect(
    r.inspectCheckpoint(f.actor.ownerId, publication.checkpointId),
  ).rejects.toMatchObject({ code: "NotFound" });
  expect((await r.inspectSourceRefinement(f.actor.ownerId, f.started.id)).proposal?.state).toBe(
    "Pending",
  );
  expect(
    await r.db
      .select()
      .from(schema.checkpointReviews)
      .where(eq(schema.checkpointReviews.checkpointId, publication.checkpointId)),
  ).toHaveLength(0);
  expect(
    await r.db
      .select()
      .from(schema.audit)
      .where(eq(schema.audit.entityId, publication.checkpointId)),
  ).toHaveLength(0);
  expect(
    await r.db
      .select()
      .from(schema.receipts)
      .where(
        and(
          eq(schema.receipts.command, "finalize-source-refinement"),
          eq(schema.receipts.key, publication.operationId),
        ),
      ),
  ).toHaveLength(0);
});

it("rejects a preview that expires during atomic acceptance and does not enqueue publication", async () => {
  const f = await fixture(),
    r = f.repository;
  await f.candidate();
  const request = await f.review(),
    detail = await r.inspectSourceRefinement(f.actor.ownerId, f.started.id);
  const originalBatch = r.db.batch.bind(r.db);
  const batch = vi.spyOn(r.db, "batch").mockImplementation(async (statements) => {
    batch.mockRestore();
    const p = detail.proposal;
    if (!p?.previewArtifacts) throw new Error("Missing preview");
    await r.db
      .update(schema.sourceRefinementProposals)
      .set({ previewArtifacts: { ...p.previewArtifacts, expiresAt: Date.now() - 1000 } })
      .where(eq(schema.sourceRefinementProposals.id, p.id));
    return originalBatch(statements);
  });
  await expect(r.reviewSourceRefinement(f.actor, request)).rejects.toMatchObject({
    code: "Conflict",
  });
  expect(
    (await r.inspectSourceRefinement(f.actor.ownerId, f.started.id)).proposal
      ?.acceptanceOperationId,
  ).toBeNull();
});

it("preserves a saved candidate across bounded preview retries without requiring the model profile", async () => {
  const f = await fixture(),
    r = f.repository;
  const initial = await r.inspectSourceRefinement(f.actor.ownerId, f.started.id);
  await r.publishSourceRefinementCandidate(
    f.actor.ownerId,
    f.started.id,
    initial.task.latestOperationId,
    f.output,
  );
  for (let attempt = 1; attempt < 3; attempt++) {
    const row = await r.inspectSourceRefinement(f.actor.ownerId, f.started.id);
    await r.cancelOperation(f.actor.ownerId, row.task.latestOperationId, `cancel-${attempt}`);
    await r.retrySourceRefinement(
      f.actor,
      { id: row.task.id, revision: row.task.revision, idempotencyKey: `retry-${attempt}` },
      null,
    );
  }
  const row = await r.inspectSourceRefinement(f.actor.ownerId, f.started.id);
  await r.cancelOperation(f.actor.ownerId, row.task.latestOperationId, "cancel-final");
  await expect(
    r.retrySourceRefinement(
      f.actor,
      { id: row.task.id, revision: row.task.revision, idempotencyKey: "retry-final" },
      null,
    ),
  ).rejects.toMatchObject({ code: "Unavailable" });
  expect(row.task.generationAttempts).toBe(1);
  expect(row.task.previewAttempts).toBe(3);
  expect(row.proposal?.payload?.source).toBe(f.output.source);
});

it("rejects publication after cancellation and removes the rejected candidate and comparison from live D1 storage", async () => {
  const f = await fixture(),
    r = f.repository;
  await f.candidate();
  const publication = await f.acceptance();
  await r.cancelOperation(f.actor.ownerId, publication.operationId, "cancel-publication");
  await expect(
    r.finalizeSourceRefinement(
      f.actor.ownerId,
      f.started.id,
      publication.operationId,
      publication.retained,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  await r.reviewSourceRefinement(f.actor, {
    ...(await f.review()),
    decision: "Rejected",
    idempotencyKey: "source-reject",
  });
  const row = await r.inspectSourceRefinement(f.actor.ownerId, f.started.id);
  expect(row.proposal).toMatchObject({ state: "Rejected", payload: null, comparison: null });
  await expect(
    r.finalizeSourceRefinement(
      f.actor.ownerId,
      f.started.id,
      publication.operationId,
      publication.retained,
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
});
