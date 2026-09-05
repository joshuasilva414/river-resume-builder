import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { JobCommand } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import { newId, type Principal } from "@river/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { beforeAll, expect, it } from "vitest";
import { runJobCommand } from "../src/server/jobs";
import { Actor, Store } from "../src/server/services";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const details = { role: "Synthetic role", company: "Fixture company", location: "Test" };
const posting = {
  text: "Repeated requirement.\nRepeated requirement.\n",
  url: "https://example.test/job",
};
async function fixture() {
  const repository = createRepository(env.DB);
  const ownerId = newId();
  const actor: Principal = { kind: "owner", id: ownerId, ownerId };
  await repository.db.insert(schema.user).values({
    id: ownerId,
    email: `${ownerId}@example.test`,
    name: "Job fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const runAs = (principal: Principal, input: JobCommand) =>
    Effect.runPromise(
      runJobCommand(input).pipe(
        Effect.provide(
          Layer.merge(Layer.succeed(Store, repository), Layer.succeed(Actor, principal)),
        ),
      ),
    );
  const run = (input: JobCommand) => runAs(actor, input);
  const created = await run({ type: "create", details, posting, idempotencyKey: "create" });
  const inspect = () => repository.inspectJob(ownerId, { id: created.id });
  const current = await inspect();
  const fields = {
    text: "One requirement",
    category: "Skills",
    priority: "Unspecified" as const,
    keywords: ["fixture"],
    confidence: null,
    passages: [
      { snapshotId: current.snapshot.id, quote: "Repeated requirement.", start: 22, end: 43 },
    ],
  };
  const requirement = async (revision = 0) => {
    await run({
      type: "requirement",
      id: created.id,
      revision,
      snapshotId: current.snapshot.id,
      requirementId: null,
      fields,
      idempotencyKey: "requirement",
    });
    const workspace = (await inspect()).workspace;
    const value = workspace.data.requirements[0];
    if (!value) throw Error("Missing requirement");
    return value;
  };
  const material = { assertion: "Synthetic evidence assertion", citations: [], contexts: [] };
  const metadata = { label: "Fixture", tags: [], notes: "" };
  const evidence = await repository.createEvidence(
    actor,
    { material, metadata, idempotencyKey: "claim" },
    material,
  );
  if (!evidence.revisionId) throw Error("Missing evidence revision");
  const selection = {
    claimId: evidence.id,
    evidenceRevisionId: evidence.revisionId,
    requirementId: null,
  };
  return {
    repository,
    actor,
    run,
    runAs,
    created,
    inspect,
    current,
    fields,
    requirement,
    evidence,
    selection,
    material,
  };
}
it("retains captured details and exact creation outcomes after later edits", async () => {
  const { run, inspect, created, repository, actor } = await fixture();
  await run({
    type: "details",
    id: created.id,
    revision: 0,
    details: { ...details, company: "New 100% display" },
    idempotencyKey: "details",
  });
  expect((await inspect()).snapshot.details).toEqual(details);
  expect((await inspect()).job.details.company).toBe("New 100% display");
  expect(await run({ type: "create", details, posting, idempotencyKey: "create" })).toEqual(
    created,
  );
  expect(
    (await repository.listJobs(actor.id, { query: "100%", archived: false, offset: 0 })).items,
  ).toHaveLength(1);
  await expect(
    run({
      type: "create",
      details,
      posting: { ...posting, text: "Different" },
      idempotencyKey: "create",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("validates exact posting passages and preserves stable requirements and historical associations", async () => {
  const { run, created, inspect, fields, current, requirement, selection, repository, actor } =
    await fixture();
  const passage = fields.passages[0];
  if (!passage) throw Error("Missing fixture passage");
  await expect(
    run({
      type: "requirement",
      id: created.id,
      revision: 0,
      snapshotId: current.snapshot.id,
      requirementId: null,
      fields: { ...fields, passages: [{ ...passage, start: 0, end: 43 }] },
      idempotencyKey: "bad-passage",
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  const req = await requirement();
  await run({
    type: "selection",
    id: created.id,
    revision: 1,
    snapshotId: current.snapshot.id,
    selected: true,
    selection: { ...selection, requirementId: req.id },
    idempotencyKey: "link",
  });
  const historical = await inspect();
  await run({
    type: "requirement",
    id: created.id,
    revision: 2,
    snapshotId: current.snapshot.id,
    requirementId: req.id,
    fields: { ...fields, text: "Edited requirement", priority: "Required" },
    idempotencyKey: "edit",
  });
  expect((await inspect()).workspace.data.requirements[0]?.id).toBe(req.id);
  expect((await inspect()).selected).toHaveLength(1);
  expect(
    (
      await repository.inspectJob(actor.id, {
        id: created.id,
        workspaceRevisionId: historical.workspace.id,
      })
    ).workspace.data,
  ).toEqual(historical.workspace.data);
  await run({
    type: "selection",
    id: created.id,
    revision: 3,
    snapshotId: current.snapshot.id,
    selected: true,
    selection,
    idempotencyKey: "general",
  });
  await run({
    type: "remove-requirement",
    id: created.id,
    revision: 4,
    snapshotId: current.snapshot.id,
    requirementId: req.id,
    idempotencyKey: "remove",
  });
  expect((await inspect()).workspace.data).toEqual({ requirements: [], selections: [selection] });
  expect(
    (
      await repository.inspectJob(actor.id, {
        id: created.id,
        workspaceRevisionId: historical.workspace.id,
      })
    ).selected,
  ).toHaveLength(1);
});
it("pins evidence wording and review state while reporting later staleness and archival", async () => {
  const { run, repository, actor, created, current, inspect, selection, evidence, material } =
    await fixture();
  await run({
    type: "selection",
    id: created.id,
    revision: 0,
    snapshotId: current.snapshot.id,
    selection,
    selected: true,
    idempotencyKey: "select",
  });
  const edited = await repository.editEvidence(
    actor,
    {
      id: evidence.id,
      revision: 0,
      material: { ...material, assertion: "New wording" },
      idempotencyKey: "edit-evidence",
    },
    { ...material, assertion: "New wording" },
  );
  if (!edited.revisionId) throw Error("Missing edited revision");
  await repository.reviewEvidence(actor, {
    id: evidence.id,
    revision: 1,
    revisionId: edited.revisionId,
    state: "Needs clarification",
    rationale: "New revision only",
    idempotencyKey: "review",
  });
  await repository.archiveEvidence(actor, {
    id: evidence.id,
    revision: 2,
    archived: true,
    rationale: "Fixture archived",
    idempotencyKey: "archive",
  });
  const saved = (await inspect()).selected[0];
  expect(saved).toMatchObject({
    assertion: material.assertion,
    reviewState: "Draft",
    rationale: null,
    evidenceRevisionId: evidence.revisionId,
  });
  expect(saved?.issues).toEqual(["Draft", "Archived", "Stale", "Unsupported"]);
});
it("rejects concurrent aggregate writes before dependent rows and keeps old snapshot work", async () => {
  const { run, created, current, inspect, fields, repository, actor, requirement, selection } =
    await fixture();
  const req = await requirement();
  await run({
    type: "selection",
    id: created.id,
    revision: 1,
    snapshotId: current.snapshot.id,
    selection: { ...selection, requirementId: req.id },
    selected: true,
    idempotencyKey: "selection",
  });
  const before = await inspect();
  const results = await Promise.allSettled([
    run({
      type: "snapshot",
      id: created.id,
      revision: 2,
      posting: { ...posting, text: "New posting" },
      idempotencyKey: "snapshot",
    }),
    run({
      type: "requirement",
      id: created.id,
      revision: 2,
      snapshotId: current.snapshot.id,
      requirementId: req.id,
      fields: { ...fields, text: "Concurrent edit" },
      idempotencyKey: "race",
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const currentJob = await inspect();
  expect(currentJob.job.revision).toBe(3);
  const audit = await repository.db
    .select()
    .from(schema.audit)
    .where(eq(schema.audit.entityId, created.id));
  expect(audit).toHaveLength(4);
  if (currentJob.snapshot.id === before.snapshot.id)
    await run({
      type: "snapshot",
      id: created.id,
      revision: 3,
      posting: { ...posting, text: "New posting" },
      idempotencyKey: "new-snapshot",
    });
  expect((await inspect()).workspace.data).toEqual({ requirements: [], selections: [] });
  const old = await repository.inspectJob(actor.id, {
    id: created.id,
    snapshotId: before.snapshot.id,
    workspaceRevisionId: before.workspace.id,
  });
  expect(old.workspace.data).toEqual(before.workspace.data);
  await expect(
    run({
      type: "requirement",
      id: created.id,
      revision: (await inspect()).job.revision,
      snapshotId: before.snapshot.id,
      requirementId: req.id,
      fields,
      idempotencyKey: "old-posting-write",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
});
it("enforces owner isolation, scoped writes, and non-destructive archive and restoration", async () => {
  const { actor, runAs, run, created, inspect, repository } = await fixture();
  const command: JobCommand = {
    type: "archive",
    id: created.id,
    revision: 0,
    archived: true,
    rationale: "Archive synthetic fixture",
    idempotencyKey: "archive",
  };
  await expect(
    runAs({ kind: "agent", id: newId(), ownerId: actor.id, scopes: ["jobs:read"] }, command),
  ).rejects.toMatchObject({ code: "Forbidden" });
  await expect(repository.inspectJob(newId(), { id: created.id })).rejects.toMatchObject({
    code: "NotFound",
  });
  const before = await inspect();
  await run(command);
  await expect(
    run({ type: "details", id: created.id, revision: 1, details, idempotencyKey: "archived-edit" }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await run({
    ...command,
    revision: 1,
    archived: false,
    rationale: "Restore fixture",
    idempotencyKey: "restore",
  });
  expect((await inspect()).workspace.data).toEqual(before.workspace.data);
  expect((await inspect()).snapshot).toEqual(before.snapshot);
});
