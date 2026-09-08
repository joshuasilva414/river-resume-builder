import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { schema } from "@river/db";
import {
  type Composition,
  canonicalJson,
  captureSchemaBundle,
  newId,
  type StructuredContent,
} from "@river/domain";
import { templateInventory } from "@river/templates";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { builtInSchemaBundleV1 } from "../../../packages/domain/src/content-defaults-v1";
import { compositionFixture } from "./fixtures/composition";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
async function fixture() {
  const fixture = await compositionFixture();
  const content: StructuredContent = {
    ...captureSchemaBundle(builtInSchemaBundleV1, { id: "contact-section", revision: 1 }),
    record: {
      id: newId(),
      schema: { id: "contact-section", revision: 1 },
      layout: { id: "contact-section-classic", revision: 1 },
      values: { name: "Synthetic Person", email: "synthetic@example.test" },
    },
    evidence: [],
  };
  const reference = await fixture.save(
    { kind: "section", type: "contact", heading: "", blocks: [], structured: content },
    "old-contact",
  );
  const data: Composition = {
    ...fixture.data,
    templateRevision: 1,
    sections: [
      {
        id: newId(),
        reference,
        type: "contact",
        heading: "",
        blocks: [],
        structured: content,
        reason: null,
      },
    ],
  };
  const draft = await fixture.create("old-draft", data);
  return { ...fixture, draft, data, reference };
}

it("upgrades editable drafts once and preserves the library, checkpoint, export, and previous draft revision", async () => {
  const { repository, actor, draft, data, reference } = await fixture();
  const identity = canonicalJson(templateInventory("classic", 1));
  const saved = await repository.captureCheckpoint(
    actor,
    { id: draft.id, revision: 0, idempotencyKey: "checkpoint" },
    identity,
  );
  const before = await repository.inspectCheckpoint(actor.id, saved.id);
  if (!before.operation) throw Error("Missing operation");
  const artifacts = {
    pdf: "retained/pdf",
    tex: "retained/tex",
    text: "retained/text",
    report: "retained/report",
    fingerprint: "unchanged-historical",
    durationMs: 1,
    validationPassed: true,
    rendererVersion: "river-tectonic-0.2.0",
    templateIdentity: identity,
  };
  await repository.updateOperation(before.operation.id, {
    state: "Succeeded",
    stage: "Complete",
    artifacts,
  });
  const request = {
    id: saved.id,
    revision: before.state.revision,
    reportId: before.report.id,
    digest: before.report.digest,
  };
  const acknowledged = await repository.acknowledgeCheckpoint(actor, {
    ...request,
    issueIds: before.report.issues.map((issue) => issue.id),
    idempotencyKey: "ack",
  });
  await repository.exportCheckpoint(actor, {
    ...request,
    revision: acknowledged.revision,
    idempotencyKey: "export",
  });
  const upgraded = await repository.upgradeResumeLayouts(actor, draft.id);
  expect(upgraded.revision).toBe(1);
  expect(await repository.upgradeResumeLayouts(actor, draft.id)).toEqual(upgraded);
  const current = await repository.inspectResume(actor.id, draft.id);
  expect(current.draft.data.sections[0]?.structured?.record.schema.revision).toBe(2);
  expect((await repository.getLibraryRevision(actor.id, reference))?.revision.data).toMatchObject({
    structured: data.sections[0]?.structured,
  });
  const retained = await repository.inspectCheckpoint(actor.id, saved.id);
  expect(retained.checkpoint.data).toEqual(data);
  expect(retained.operation?.artifacts).toEqual(artifacts);
  expect(retained.exported).not.toBeNull();
  const history = await repository.db
    .select()
    .from(schema.audit)
    .where(eq(schema.audit.entityId, draft.id));
  expect(history.filter((entry) => entry.command === "upgrade-resume-layouts")).toMatchObject([
    { before: { revision: 0, data }, after: { revision: 1 } },
  ]);
});

it("preserves a competing edit and rejects stale writes with the normal conflict response", async () => {
  const { repository, actor, draft, data } = await fixture();
  const [save, upgrade] = await Promise.allSettled([
    repository.saveResume(actor, {
      id: draft.id,
      revision: 0,
      data: { ...data, name: "Concurrent edit" },
      idempotencyKey: "edit",
    }),
    repository.upgradeResumeLayouts(actor, draft.id),
  ]);
  const current = await repository.inspectResume(actor.id, draft.id);
  if (save.status === "fulfilled") expect(current.draft.data.name).toBe("Concurrent edit");
  else expect(save.reason).toMatchObject({ code: "Conflict" });
  if (upgrade.status === "rejected") expect(upgrade.reason).toMatchObject({ code: "Conflict" });
  await repository.upgradeResumeLayouts(actor, draft.id);
  await expect(
    repository.saveResume(actor, { id: draft.id, revision: 0, data, idempotencyKey: "stale" }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
