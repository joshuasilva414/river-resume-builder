import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { EvidenceCommand, ExtractionResult } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import {
  type EvidenceMaterialInput,
  evidenceIsStale,
  fingerprint,
  newId,
  type Principal,
} from "@river/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { beforeAll, expect, it } from "vitest";
import { runEvidenceCommand } from "../src/server/evidence";
import { Actor, Store } from "../src/server/services";
import { createSource } from "../src/server/sources";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
const metadata = { label: "", tags: ["fixture"], notes: "Synthetic test data" };
const search = { query: "", status: "All" as const, archived: false, contextId: null, offset: 0 };
async function fixture() {
  const repository = createRepository(env.DB);
  const ownerId = newId();
  const actor: Principal = { kind: "owner", id: ownerId, ownerId };
  await repository.db.insert(schema.user).values({
    id: ownerId,
    email: `${ownerId}@example.test`,
    name: "Evidence fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const layer = Layer.merge(Layer.succeed(Store, repository), Layer.succeed(Actor, actor));
  const run = (input: EvidenceCommand) =>
    Effect.runPromise(runEvidenceCommand(env, input).pipe(Effect.provide(layer)));
  const text = "Repeated passage.\nRepeated passage.\n";
  const source = await Effect.runPromise(
    createSource(env, {
      idempotencyKey: newId(),
      title: "Synthetic attestation",
      filename: "fixture.txt",
      kind: "attestation",
      mime: "text/plain",
      provenanceUrl: null,
      note: "Not Owner biographical data",
      contentBase64: btoa(text),
    }).pipe(Effect.provide(layer)),
  );
  const record = await repository.getSource(ownerId, source.id);
  if (!record) throw Error("Missing source");
  const operation = await repository.getOperation(record.operationId);
  if (!operation || !("sourceId" in operation.input)) throw Error("Missing extraction operation");
  const extraction: ExtractionResult = {
    type: "extracted",
    text,
    parser: "fixture",
    parserVersion: "1",
    segments: [
      { text: "Repeated passage.", start: 0, end: 17, line: 1 },
      { text: "Repeated passage.", start: 18, end: 35, line: 2 },
    ],
  };
  const serialized = JSON.stringify(extraction);
  const digest = await fingerprint(serialized);
  const objectKey = `fixture/${source.id}/${digest}`;
  await env.ARTIFACTS.put(objectKey, serialized);
  await repository.publishExtraction({
    id: operation.input.processingId,
    sourceId: source.id,
    operationId: operation.id,
    digest,
    objectKey,
    extraction,
  });
  const material: EvidenceMaterialInput = {
    assertion: "Built a synthetic testing fixture for typed document storage.",
    contexts: [],
    citations: [
      {
        sourceId: source.id,
        processingId: operation.input.processingId,
        quote: "Repeated passage.",
        start: 18,
        end: 35,
      },
    ],
  };
  return { repository, actor, layer, run, material, sourceId: source.id };
}

it("anchors repeated quotations to the exact processing result and rejects mismatches", async () => {
  const { run, repository, actor, material } = await fixture();
  const created = await run({ type: "create", idempotencyKey: "create", material, metadata });
  const revision = await repository.getEvidenceRevision(actor.id, created.revisionId ?? "");
  expect(revision?.material.citations[0]).toMatchObject({
    start: 18,
    end: 35,
    locators: [{ line: 2 }],
    attestation: true,
  });
  const citation = material.citations[0];
  if (!citation) throw Error("Missing citation");
  await expect(
    run({
      type: "create",
      idempotencyKey: "bad-offset",
      metadata,
      material: { ...material, citations: [{ ...citation, start: 0, end: 35 }] },
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(
    run({
      type: "create",
      idempotencyKey: "bad-result",
      metadata,
      material: { ...material, citations: [{ ...citation, processingId: newId() }] },
    }),
  ).rejects.toMatchObject({ code: "NotFound" });
  expect((await repository.searchEvidence(actor.id, search)).items).toHaveLength(1);
});

it("preserves verification through metadata edits, invalidates material changes, and replays exact outcomes", async () => {
  const { run, repository, actor, material } = await fixture();
  const request: EvidenceCommand = {
    type: "create",
    idempotencyKey: "create-once",
    material,
    metadata,
  };
  const results = await Promise.all([run(request), run(request), run(request)]);
  expect(new Set(results.map((result) => result.id)).size).toBe(1);
  const created = results[0];
  if (!created?.revisionId) throw Error("Missing evidence revision");
  const review: EvidenceCommand = {
    type: "review",
    id: created.id,
    revision: 0,
    revisionId: created.revisionId,
    state: "Verified",
    rationale: "Fixture passage checked explicitly.",
    idempotencyKey: "verify-once",
  };
  const reviews = await Promise.all([run(review), run(review), run(review)]);
  expect(reviews.every((result) => result.revision === 1)).toBe(true);
  const labeled = await run({
    type: "metadata",
    id: created.id,
    revision: 1,
    metadata: { ...metadata, label: "Reviewed fixture", tags: ["storage"] },
    idempotencyKey: "metadata",
  });
  expect((await repository.getClaim(actor.id, created.id))?.reviewState).toBe("Verified");
  expect(labeled.revisionId).toBe(created.revisionId);
  const edited = await run({
    type: "edit",
    id: created.id,
    revision: labeled.revision,
    material: {
      ...material,
      assertion: "Built a synthetic fixture for typed storage and retrieval.",
    },
    idempotencyKey: "material-edit",
  });
  expect((await repository.getClaim(actor.id, created.id))?.reviewState).toBe("Draft");
  expect(evidenceIsStale(created.revisionId, edited.revisionId ?? "")).toBe(true);
  expect((await repository.evidenceHistory(actor.id, created.id)).decisions).toMatchObject([
    { revisionId: created.revisionId, state: "Verified" },
  ]);
  expect(await run(request)).toEqual(created);
  expect(await run(review)).toEqual(reviews[0]);
  await expect(run({ ...review, rationale: "Different content" })).rejects.toMatchObject({
    code: "Conflict",
  });
});

it("rolls back revision, reference, search, and audit changes after conflicts or a late SQL failure", async () => {
  const { run, repository, actor, material } = await fixture();
  const created = await run({ type: "create", idempotencyKey: "create", material, metadata });
  const results = await Promise.allSettled([
    run({
      type: "edit",
      id: created.id,
      revision: 0,
      material: { ...material, assertion: "Concurrency winner alpha" },
      idempotencyKey: "first",
    }),
    run({
      type: "edit",
      id: created.id,
      revision: 0,
      material: { ...material, assertion: "Concurrency winner beta" },
      idempotencyKey: "second",
    }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const before = await repository.getClaim(actor.id, created.id);
  if (!before) throw Error("Missing claim");
  const historyBefore = await repository.evidenceHistory(actor.id, created.id);
  const badMaterial = {
    ...material,
    assertion: "Mustneverappear",
    citations: [
      {
        sourceId: newId(),
        processingId: newId(),
        quote: "Absent source",
        start: 0,
        end: 13,
        locators: [],
        attestation: false,
      },
    ],
  };
  await expect(
    repository.editEvidence(
      actor,
      { id: created.id, revision: 1, material: badMaterial, idempotencyKey: "late-failure" },
      badMaterial,
    ),
  ).rejects.toThrow();
  expect(await repository.getClaim(actor.id, created.id)).toEqual(before);
  expect(await repository.evidenceHistory(actor.id, created.id)).toEqual(historyBefore);
  expect(
    (await repository.searchEvidence(actor.id, { ...search, query: "Mustneverappear" })).items,
  ).toEqual([]);
  expect(
    (await repository.searchEvidence(actor.id, { ...search, query: "concurrency" })).items,
  ).toHaveLength(1);
  expect(
    await repository.db
      .select()
      .from(schema.citationReferences)
      .where(eq(schema.citationReferences.revisionId, before.currentRevisionId)),
  ).toHaveLength(1);
});

it("reviews duplicates, merges atomically, and restores the original without rewriting the target", async () => {
  const { run, repository, actor, material } = await fixture();
  const first = await run({ type: "create", idempotencyKey: "first", material, metadata });
  const second = await run({ type: "create", idempotencyKey: "second", material, metadata });
  const [pair] = await repository.listDuplicates(actor.id);
  if (!pair) throw Error("Missing duplicate review");
  expect(pair.similarity).toBe(100);
  await run({
    type: "keep-separate",
    id: pair.id,
    revision: 0,
    idempotencyKey: "separate",
    rationale: "Separate test provenance.",
  });
  expect(await repository.listDuplicates(actor.id)).toEqual([]);
  await expect(
    run({
      type: "merge",
      id: first.id,
      revision: 0,
      sourceId: second.id,
      sourceRevision: 1,
      material,
      rationale: "Combine fixture assertions.",
      idempotencyKey: "stale-merge",
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect((await repository.getClaim(actor.id, first.id))?.revision).toBe(0);
  const merged = await run({
    type: "merge",
    id: first.id,
    revision: 0,
    sourceId: second.id,
    sourceRevision: 0,
    material,
    rationale: "Reviewed both citations and combined the fixture.",
    idempotencyKey: "merge",
  });
  expect((await repository.getClaim(actor.id, first.id))?.reviewState).toBe("Draft");
  expect((await repository.searchEvidence(actor.id, search)).items).toHaveLength(1);
  expect(
    (await repository.searchEvidence(actor.id, { ...search, archived: true })).items,
  ).toHaveLength(1);
  const target = await repository.getClaim(actor.id, first.id);
  await run({
    type: "archive",
    id: second.id,
    revision: 1,
    archived: false,
    rationale: "Restore the original fixture as a separate claim.",
    idempotencyKey: "restore",
  });
  expect(await repository.getClaim(actor.id, first.id)).toEqual(target);
  expect((await repository.getClaim(actor.id, second.id))?.currentRevisionId).toBe(
    second.revisionId,
  );
  expect(merged.revisionId).not.toBe(first.revisionId);
  expect((await repository.searchEvidence(actor.id, search)).items).toHaveLength(2);
});

it("pins context history and requires a cited revision plus rationale for verification", async () => {
  const { run, repository, actor, material } = await fixture();
  const data = {
    kind: "Project" as const,
    label: "Original project name",
    organization: "",
    role: "Contributor",
    startDate: "2025",
    endDate: "",
    details: "Synthetic context",
    contact: null,
  };
  const context = await run({
    type: "context",
    id: null,
    revision: null,
    idempotencyKey: "context",
    data,
  });
  if (!context.revisionId) throw Error("Missing context revision");
  const created = await run({
    type: "create",
    idempotencyKey: "claim",
    metadata,
    material: {
      ...material,
      contexts: [{ id: context.id, revisionId: context.revisionId }],
      citations: [],
    },
  });
  if (!created.revisionId) throw Error("Missing claim revision");
  await run({
    type: "context",
    id: context.id,
    revision: 0,
    idempotencyKey: "new-context",
    data: { ...data, label: "Current project name" },
  });
  expect(
    (await repository.getContextRevision(actor.id, context.id, context.revisionId))?.data.label,
  ).toBe("Original project name");
  expect(
    (await repository.searchEvidence(actor.id, { ...search, query: "original project" })).items.map(
      (item) => item.id,
    ),
  ).toContain(created.id);
  expect(
    (await repository.searchEvidence(actor.id, { ...search, query: "current project" })).items,
  ).toHaveLength(0);
  expect(
    (await repository.getEvidenceRevision(actor.id, created.revisionId))?.material.contexts[0]
      ?.revisionId,
  ).toBe(context.revisionId);
  await expect(
    run({
      type: "review",
      id: created.id,
      revision: 0,
      revisionId: created.revisionId,
      state: "Verified",
      rationale: "Unsupported assertion",
      idempotencyKey: "verify",
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await run({
    type: "review",
    id: created.id,
    revision: 0,
    revisionId: created.revisionId,
    state: "Needs clarification",
    rationale: "Please attach a source passage.",
    idempotencyKey: "clarify",
  });
  const stranger = await fixture();
  expect(
    await repository.getEvidenceRevision(stranger.actor.id, created.revisionId),
  ).toBeUndefined();
});

it("reconciles duplicate suggestions after simultaneous independent creates", async () => {
  const { run, repository, actor, material } = await fixture();
  await Promise.all([
    run({ type: "create", idempotencyKey: "first-concurrent", material, metadata }),
    run({ type: "create", idempotencyKey: "second-concurrent", material, metadata }),
  ]);
  const pairs = await repository.listDuplicates(actor.id);
  expect(pairs).toHaveLength(1);
  expect(pairs[0]?.similarity).toBe(100);
  expect(
    (await repository.searchEvidence(actor.id, { ...search, archived: null })).items,
  ).toHaveLength(2);
});
