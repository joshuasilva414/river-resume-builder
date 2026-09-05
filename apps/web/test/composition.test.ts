import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { schema } from "@river/db";
import { type Composition, newId, renderComposition } from "@river/domain";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
it("keeps local wording, copied sections, original library content and other drafts independent", async () => {
  const { repository, actor, data, draft, content, create } = await compositionFixture();
  const tailored: Composition = {
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
                contents: field.contents.map((item) => ({
                  ...item,
                  override: {
                    wording: "Tailored synthetic wording.",
                    evidence: [],
                    reason: "Focus for this role.",
                  },
                })),
              })),
            })),
          },
    ),
  };
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: tailored,
    idempotencyKey: "tailor",
  });
  const destination = await create("destination", {
    ...data,
    sections: data.sections.filter((section) => section.type === "contact"),
    theme: "technical",
  });
  const section = tailored.sections[1];
  if (!section) throw Error("Missing section");
  await repository.copyPlacement(actor, {
    sourceId: draft.id,
    sourceRevision: 1,
    destinationId: destination.id,
    destinationRevision: 0,
    sectionId: section.id,
    blockId: null,
    destinationSectionId: null,
    position: 1,
    idempotencyKey: "copy",
  });
  const copied = await repository.inspectResume(actor.id, destination.id);
  expect(copied.draft.data.theme).toBe("technical");
  expect(copied.draft.data.sections[1]?.id).not.toBe(section.id);
  expect(
    renderComposition(copied.draft.data, copied.graph).sections[0]?.blocks[0]?.paragraphs,
  ).toEqual(["Tailored synthetic wording."]);
  await repository.saveLibrary(actor, {
    id: content.itemId,
    revision: 0,
    idempotencyKey: "library-edit",
    label: "New wording",
    rationale: "New reusable version",
    data: { kind: "content", type: "summary", wording: "New library wording.", evidence: [] },
  });
  expect((await repository.getLibraryRevision(actor.id, content))?.revision.data).toMatchObject({
    wording: "Original synthetic wording.",
  });
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 1,
    data,
    idempotencyKey: "restore-local",
  });
  const after = await repository.inspectResume(actor.id, destination.id);
  expect(
    renderComposition(after.draft.data, after.graph).sections[0]?.blocks[0]?.paragraphs,
  ).toEqual(["Tailored synthetic wording."]);
});
it("rejects concurrent saves atomically and preserves conflicting local work in a separate branch", async () => {
  const { repository, actor, data, draft } = await compositionFixture();
  const saves = await Promise.allSettled(
    ["one", "two"].map((name) =>
      repository.saveResume(actor, {
        id: draft.id,
        revision: 0,
        data: { ...data, name },
        idempotencyKey: name,
      }),
    ),
  );
  expect(saves.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const before = await repository.inspectResume(actor.id, draft.id);
  expect(before.draft.revision).toBe(1);
  const branchInput = {
    id: draft.id,
    revision: 0,
    data: { ...data, name: "My retained local edits" },
    idempotencyKey: "branch",
  };
  const branch = await repository.branchResume(actor, branchInput);
  expect(await repository.branchResume(actor, branchInput)).toEqual(branch);
  const fork = await repository.inspectResume(actor.id, branch.id);
  expect(fork.draft).toMatchObject({ branchOf: draft.id, branchRevision: 0, revision: 0 });
  expect(fork.draft.data.name).toBe("My retained local edits");
  expect((await repository.inspectResume(actor.id, draft.id)).draft.data).toEqual(
    before.draft.data,
  );
  const audits = await repository.db
    .select()
    .from(schema.audit)
    .where(eq(schema.audit.entityId, draft.id));
  expect(audits.filter((entry) => entry.command === "save-resume")).toHaveLength(1);
});
it("checks ownership, exact child identities, local-override reasons and stale job creation", async () => {
  const { repository, actor, data, draft, jobDetail, create } = await compositionFixture();
  await expect(
    repository.saveResume(
      { ...actor, kind: "agent", scopes: ["jobs:write"] },
      { id: draft.id, revision: 0, data, idempotencyKey: "forbidden" },
    ),
  ).rejects.toMatchObject({ code: "Forbidden" });
  const section = data.sections[1];
  if (!section) throw Error("Missing section");
  await expect(
    repository.saveResume(actor, {
      id: draft.id,
      revision: 0,
      data: { ...data, sections: [{ ...section, heading: "Changed without an override" }] },
      idempotencyKey: "unattributed",
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(repository.inspectResume(newId(), draft.id)).rejects.toMatchObject({
    code: "NotFound",
  });
  await repository.runJobCommand(actor, {
    type: "details",
    id: jobDetail.job.id,
    revision: 0,
    details: { ...jobDetail.job.details, role: "Changed role" },
    idempotencyKey: "change-job",
  });
  await expect(create("stale-job")).rejects.toMatchObject({ code: "Conflict" });
});
it("coalesces identical preview requests, persists dispatch, and suppresses obsolete completion", async () => {
  const { repository, actor, data, draft } = await compositionFixture();
  const request = { id: draft.id, revision: 0, idempotencyKey: "preview" };
  const first = await repository.previewResume(actor, request);
  expect(await repository.previewResume(actor, request)).toEqual(first);
  expect(
    (await repository.previewResume(actor, { ...request, idempotencyKey: "another-tab" })).id,
  ).toBe(first.id);
  expect((await repository.pendingDispatches()).some((row) => row.operationId === first.id)).toBe(
    true,
  );
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: { ...data, name: "New draft revision" },
    idempotencyKey: "advance",
  });
  await repository.updateOperation(first.id, { state: "Succeeded", stage: "Fixture complete" });
  await repository.publishResumePreview(first.id);
  expect((await repository.getResume(actor.id, draft.id))?.lastPreviewId).toBeNull();
  const second = await repository.previewResume(actor, {
    ...request,
    revision: 1,
    idempotencyKey: "latest-preview",
  });
  await repository.updateOperation(second.id, { state: "Succeeded", stage: "Fixture complete" });
  await repository.publishResumePreview(second.id);
  expect((await repository.getResume(actor.id, draft.id))?.lastPreviewId).toBe(second.id);
  await repository.publishResumePreview(first.id);
  expect((await repository.getResume(actor.id, draft.id))?.lastPreviewId).toBe(second.id);
});
it("requires exact reviewed library and draft revisions before replacing local wording", async () => {
  const { repository, actor, data, draft, content } = await compositionFixture();
  const section = data.sections[1],
    block = section?.blocks[0],
    placement = block?.fields[0]?.contents[0];
  if (!section || !block || !placement) throw Error("Missing fixture placement");
  const local = {
    ...data,
    sections: data.sections.map((value) =>
      value.id !== section.id
        ? value
        : {
            ...section,
            blocks: [
              {
                ...block,
                fields: block.fields.map((field) => ({
                  ...field,
                  contents: field.contents.map((value) => ({
                    ...value,
                    override: {
                      wording: "Local complete wording",
                      evidence: [],
                      reason: "Local choice",
                    },
                  })),
                })),
              },
            ],
          },
    ),
  };
  await repository.saveResume(actor, {
    id: draft.id,
    revision: 0,
    data: local,
    idempotencyKey: "local",
  });
  const update = await repository.saveLibrary(actor, {
    id: content.itemId,
    revision: 0,
    data: {
      kind: "content",
      type: "summary",
      wording: "Reviewed new library wording",
      evidence: [],
    },
    label: "Library",
    rationale: "Update",
    idempotencyKey: "library",
  });
  if (!update.revisionId) throw Error("Missing revision");
  const request = {
    id: draft.id,
    revision: 1,
    sectionId: section.id,
    blockId: block.id,
    contentId: placement.id,
    reference: { itemId: update.id, revisionId: update.revisionId },
    libraryRevision: update.revision,
    replaceLocal: false,
    idempotencyKey: "apply",
  };
  await expect(repository.applyLibraryUpdate(actor, request)).rejects.toMatchObject({
    code: "InvalidInput",
  });
  expect((await repository.getResume(actor.id, draft.id))?.revision).toBe(1);
  await repository.applyLibraryUpdate(actor, { ...request, replaceLocal: true });
  const applied = await repository.inspectResume(actor.id, draft.id);
  expect(applied.draft.data.sections[1]?.blocks[0]?.fields[0]?.contents[0]?.override).toBeNull();
  expect(
    renderComposition(applied.draft.data, applied.graph).sections[0]?.blocks[0]?.paragraphs,
  ).toEqual(["Reviewed new library wording"]);
  await repository.saveLibrary(actor, {
    id: update.id,
    revision: update.revision,
    data: {
      kind: "content",
      type: "summary",
      wording: "Unreviewed later library wording",
      evidence: [],
    },
    label: "Later",
    rationale: "Later",
    idempotencyKey: "later",
  });
  await expect(
    repository.applyLibraryUpdate(actor, {
      ...request,
      revision: 2,
      replaceLocal: true,
      idempotencyKey: "stale-library",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await repository.getResume(actor.id, draft.id))?.revision).toBe(2);
});

it("refreshes expired or differently pinned previews without replacing the retained checkpoint path", async () => {
  const { repository, actor, draft } = await compositionFixture();
  const first = await repository.previewResume(
    actor,
    { id: draft.id, revision: 0, idempotencyKey: "first" },
    "templates-v1",
  );
  await repository.updateOperation(first.id, { state: "Succeeded", stage: "PDF ready" });
  const same = await repository.previewResume(
    actor,
    { id: draft.id, revision: 0, idempotencyKey: "same" },
    "templates-v1",
  );
  expect(same.id).toBe(first.id);
  const changed = await repository.previewResume(
    actor,
    { id: draft.id, revision: 0, idempotencyKey: "changed" },
    "templates-v2",
  );
  expect(changed.id).not.toBe(first.id);
  await repository.updateOperation(changed.id, {
    state: "Succeeded",
    stage: "PDF ready",
    artifacts: {
      pdf: "transient/previews/pdf",
      tex: "transient/previews/tex",
      text: "transient/previews/text",
      report: "transient/previews/report",
      fingerprint: "fixture",
      durationMs: 1,
      expiresAt: Date.now() - 1,
    },
  });
  const fresh = await repository.previewResume(
    actor,
    { id: draft.id, revision: 0, idempotencyKey: "fresh" },
    "templates-v2",
  );
  expect(fresh.id).not.toBe(changed.id);
});
