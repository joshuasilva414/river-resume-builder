import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { CreateSourceRequest, ExtractionResult } from "@river/contracts";
import { createRepository, schema } from "@river/db";
import { fingerprint, newId, type Principal } from "@river/domain";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Actor, recoverSourceUploads, Store } from "../src/server/services";
import {
  createSource,
  inspectSource,
  resumeSourceUpload,
  sourceDownload,
} from "../src/server/sources";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
afterEach(() => vi.restoreAllMocks());
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

it("reaches uploaded originals beyond 50 abandoned reservations without changing retry history", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const { repository, actor } = await fixture();
  const { contentBase64, ...metadata } = input;
  const bytes = new TextEncoder().encode(atob(contentBase64));
  const digest = await fingerprint(bytes);
  const reservation = { ...metadata, digest, byteLength: bytes.length };
  const ids: string[] = [];
  for (let index = 0; index < 51; index++)
    ids.push(
      await repository.beginSource(actor, { ...reservation, idempotencyKey: `reserve-${index}` }),
    );
  const ordered = ids.toSorted();
  const firstId = ordered[0],
    lastId = ordered.at(-1);
  if (!firstId || !lastId) throw Error("Missing reservation identities");
  const first = await repository.getSource(actor.id, firstId);
  const last = await repository.getSource(actor.id, lastId);
  if (!first || !last) throw Error("Missing reservations");
  await env.ARTIFACTS.put(last.objectKey, bytes, { customMetadata: { sha256: digest } });
  // A same-size object with different provenance must not finalize or be overwritten.
  await env.ARTIFACTS.put(first.objectKey, bytes, { customMetadata: { sha256: "wrong" } });
  const head = vi.spyOn(env.ARTIFACTS, "head");
  await recoverSourceUploads(env);
  expect(head).toHaveBeenCalledTimes(50);
  expect((await repository.getSource(actor.id, last.id))?.state).toBe("Uploading");
  await recoverSourceUploads(env);
  expect(head).toHaveBeenCalledTimes(100);
  expect((await repository.getSource(actor.id, last.id))?.state).toBe("Processing");
  expect(await repository.getSource(actor.id, first.id)).toEqual(first);
  expect((await env.ARTIFACTS.head(first.objectKey))?.customMetadata?.sha256).toBe("wrong");
  expect(
    await repository.beginSource(actor, {
      ...reservation,
      idempotencyKey: `reserve-${ids.indexOf(first.id)}`,
    }),
  ).toBe(first.id);
  expect(await repository.pendingDispatches()).toEqual(
    expect.arrayContaining([expect.objectContaining({ operationId: last.operationId })]),
  );
  expect(await repository.pendingDispatches()).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ operationId: first.operationId })]),
  );
});

it("continues upload recovery after an R2 failure without logging its private cause", async () => {
  const { repository, actor } = await fixture();
  const { contentBase64, ...metadata } = input;
  const bytes = new TextEncoder().encode(atob(contentBase64));
  const digest = await fingerprint(bytes);
  const ids = [];
  for (const idempotencyKey of ["failing-head", "available-head"])
    ids.push(
      await repository.beginSource(actor, {
        ...metadata,
        digest,
        byteLength: bytes.length,
        idempotencyKey,
      }),
    );
  const [firstId, secondId] = ids;
  if (!firstId || !secondId) throw Error("Missing reservation identities");
  const first = await repository.getSource(actor.id, firstId);
  const second = await repository.getSource(actor.id, secondId);
  if (!first || !second) throw Error("Missing reservations");
  await env.ARTIFACTS.put(second.objectKey, bytes, { customMetadata: { sha256: digest } });
  const originalHead = env.ARTIFACTS.head.bind(env.ARTIFACTS);
  const privateCause = "PRIVATE_STORAGE_ERROR_AND_SIGNED_URL";
  const head = vi.spyOn(env.ARTIFACTS, "head").mockImplementation((key) => {
    if (key === first.objectKey) return Promise.reject(new Error(privateCause));
    return originalHead(key);
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await recoverSourceUploads(env);
  expect(head).toHaveBeenCalledWith(first.objectKey);
  expect(head).toHaveBeenCalledWith(second.objectKey);
  expect((await repository.getSource(actor.id, first.id))?.state).toBe("Uploading");
  expect((await repository.getSource(actor.id, second.id))?.state).toBe("Processing");
  expect(JSON.stringify(log.mock.calls)).not.toContain(privateCause);
  expect(JSON.stringify(log.mock.calls)).toContain("river.source-upload-recovery");
  expect(JSON.stringify(log.mock.calls)).toContain("failed");
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
