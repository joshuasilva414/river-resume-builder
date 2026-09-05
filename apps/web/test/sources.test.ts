import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { CreateSourceRequest, ExtractionResult } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import { fingerprint, newId, type Principal } from "@river/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { beforeAll, expect, it } from "vitest";
import { Actor, recoverSourceUploads, Store } from "../src/server/services";
import {
  createSource,
  inspectSource,
  resumeSourceUpload,
  sourceDownload,
} from "../src/server/sources";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
async function fixture() {
  const repository = createRepository(env.DB);
  const id = newId();
  const actor: Principal = { kind: "owner", id, ownerId: id };
  await repository.db.insert(schema.user).values({
    id,
    email: `${id}@example.test`,
    name: "Source fixture",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const layer = Layer.merge(Layer.succeed(Store, repository), Layer.succeed(Actor, actor));
  return { repository, actor, layer };
}
const input: CreateSourceRequest = {
  idempotencyKey: "source-once",
  title: "Synthetic source fixture",
  filename: "notes.txt",
  mime: "text/plain",
  kind: "pasted",
  provenanceUrl: "https://example.test/notes",
  note: "Test-only provenance",
  contentBase64: btoa("Repeated text.\nRepeated text.\n"),
};

it("deduplicates concurrent uploads without combining separate provenance records", async () => {
  const { repository, actor, layer } = await fixture();
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      Effect.runPromise(createSource(env, input).pipe(Effect.provide(layer))),
    ),
  );
  expect(new Set(results.map((item) => item.id)).size).toBe(1);
  const [source] = await repository.listSources(actor.id);
  expect(source?.state).toBe("Processing");
  expect(source).toBeDefined();
  if (!source) throw Error("Missing source");
  const original = await env.ARTIFACTS.get(source.objectKey);
  expect(await original?.text()).toBe(atob(input.contentBase64));
  await expect(
    Effect.runPromise(
      createSource(env, { ...input, title: "Different request" }).pipe(Effect.provide(layer)),
    ),
  ).rejects.toMatchObject({ code: "Conflict" });
  const second = await Effect.runPromise(
    createSource(env, {
      ...input,
      idempotencyKey: "other-provenance",
      note: "A separately captured copy",
    }).pipe(Effect.provide(layer)),
  );
  expect(second.id).not.toBe(source.id);
  expect(await repository.listSources(actor.id)).toHaveLength(2);
  expect(await repository.listOperations(actor.id)).toHaveLength(2);
  expect(await repository.activity(actor.id)).toHaveLength(2);
  const download = await Effect.runPromise(
    sourceDownload(env, source.id).pipe(Effect.provide(layer)),
  );
  expect(download.headers.get("cache-control")).toBe("private, no-store");
  expect(await download.text()).toBe(atob(input.contentBase64));
  const stranger = await fixture();
  await expect(
    Effect.runPromise(sourceDownload(env, source.id).pipe(Effect.provide(stranger.layer))),
  ).rejects.toMatchObject({ code: "NotFound" });
});

it("recovers an uploaded original after interrupted finalization and keeps missing uploads undispatched", async () => {
  const { repository, actor } = await fixture();
  const { contentBase64, ...metadata } = input;
  const bytes = new TextEncoder().encode(atob(contentBase64));
  const digest = await fingerprint(bytes);
  const id = await repository.beginSource(actor, { ...metadata, digest, byteLength: bytes.length });
  const source = await repository.getSource(actor.id, id);
  if (!source) throw Error("Missing source");
  await recoverSourceUploads(env);
  expect((await repository.getSource(actor.id, id))?.state).toBe("Uploading");
  expect(await repository.pendingDispatches()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ operationId: source.operationId })]),
  );
  await env.ARTIFACTS.put(source.objectKey, bytes, { customMetadata: { sha256: digest } });
  await recoverSourceUploads(env);
  expect((await repository.getSource(actor.id, id))?.state).toBe("Processing");
  expect(await repository.pendingDispatches()).toEqual(
    expect.arrayContaining([expect.objectContaining({ operationId: source.operationId })]),
  );
});

it("preserves exact historical extraction text and blocks stale retries and late publication", async () => {
  const { repository, actor, layer } = await fixture();
  const { id } = await Effect.runPromise(createSource(env, input).pipe(Effect.provide(layer)));
  const firstSource = await repository.getSource(actor.id, id);
  if (!firstSource) throw Error("Missing source");
  const firstOperation = await repository.getOperation(firstSource.operationId);
  if (!firstOperation || !("sourceId" in firstOperation.input)) throw Error("Missing input");
  const extraction: ExtractionResult = {
    type: "extracted",
    text: "Repeated text.\nRepeated text.\n",
    segments: [
      { text: "Repeated text.", start: 0, end: 14, line: 1 },
      { text: "Repeated text.", start: 15, end: 29, line: 2 },
    ],
    parser: "fixture",
    parserVersion: "1",
  };
  const objectKey = `fixture/${id}/first.json`;
  await env.ARTIFACTS.put(objectKey, JSON.stringify(extraction));
  const publication = {
    id: firstOperation.input.processingId,
    sourceId: id,
    operationId: firstOperation.id,
    objectKey,
    digest: await fingerprint(JSON.stringify(extraction)),
    extraction,
  };
  await repository.publishExtraction(publication);
  const request = { id, revision: 0, idempotencyKey: "retry-once" };
  const next = await repository.retrySource(actor, request);
  expect(await repository.retrySource(actor, request)).toBe(next);
  await expect(
    repository.retrySource(actor, { ...request, idempotencyKey: "stale-retry" }),
  ).rejects.toMatchObject({ code: "Conflict", observedRevision: 1 });
  await repository.publishExtraction(publication);
  expect((await repository.getSource(actor.id, id))?.state).toBe("Processing");
  await repository.failSource(next, "Fixture failure");
  await repository.updateOperation(next, { state: "Failed", stage: "Fixture failure" });
  const inspected = await Effect.runPromise(
    inspectSource(env, id, publication.id).pipe(Effect.provide(layer)),
  );
  expect(inspected.extraction).toEqual(extraction);
  expect(inspected.history).toHaveLength(1);
  expect(await repository.activity(actor.id)).toHaveLength(2);
  expect(
    await repository.db.select().from(schema.receipts).where(eq(schema.receipts.actorId, actor.id)),
  ).toHaveLength(2);
});

it("rejects malformed sources and prevents agents from impersonating Owner attestations", async () => {
  const { repository, actor, layer } = await fixture();
  for (const invalid of [
    { ...input, contentBase64: "!invalid" },
    { ...input, provenanceUrl: "javascript:alert(1)" },
    { ...input, title: "   " },
  ]) {
    await expect(
      Effect.runPromise(createSource(env, invalid).pipe(Effect.provide(layer))),
    ).rejects.toMatchObject({ code: "InvalidInput" });
  }
  const agent: Principal = {
    kind: "agent",
    id: newId(),
    ownerId: actor.id,
    scopes: ["source:write"],
  };
  const agentLayer = Layer.merge(Layer.succeed(Store, repository), Layer.succeed(Actor, agent));
  await expect(
    Effect.runPromise(
      createSource(env, { ...input, kind: "attestation" }).pipe(Effect.provide(agentLayer)),
    ),
  ).rejects.toMatchObject({ code: "Forbidden" });
  expect(await repository.listSources(actor.id)).toEqual([]);
});

it("resumes the exact original after a reload and rejects replacement content", async () => {
  const { repository, actor, layer } = await fixture();
  const { contentBase64, ...metadata } = input;
  const bytes = new TextEncoder().encode(atob(contentBase64));
  const id = await repository.beginSource(actor, {
    ...metadata,
    digest: await fingerprint(bytes),
    byteLength: bytes.length,
  });
  const resume = { id, revision: 0, idempotencyKey: "resume-after-reload", contentBase64 };
  await expect(
    Effect.runPromise(
      resumeSourceUpload(env, { ...resume, contentBase64: btoa("Different original") }).pipe(
        Effect.provide(layer),
      ),
    ),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect((await repository.getSource(actor.id, id))?.revision).toBe(0);
  expect(
    await Effect.runPromise(resumeSourceUpload(env, resume).pipe(Effect.provide(layer))),
  ).toEqual({ id });
  expect(
    await Effect.runPromise(resumeSourceUpload(env, resume).pipe(Effect.provide(layer))),
  ).toEqual({ id });
  expect((await repository.getSource(actor.id, id))?.state).toBe("Processing");
  expect(await repository.listSources(actor.id)).toHaveLength(1);
  expect(await repository.activity(actor.id)).toHaveLength(2);
});
