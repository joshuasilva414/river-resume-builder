import {
  type ArchiveSourceRequest,
  type CreateSourceRequest,
  ExtractionResult,
  type ResumeSourceRequest,
  type RetrySourceRequest,
} from "@river/contracts";
import { ApplicationError, fingerprint } from "@river/domain";
import { Effect, Schema } from "effect";
import { aiConfiguration } from "./ai-settings";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";

function decodeSource(input: CreateSourceRequest) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64))
    throw new ApplicationError({
      code: "InvalidInput",
      message: "Source content must use valid base64 encoding.",
    });
  const bytes = Uint8Array.from(atob(input.contentBase64), (character) => character.charCodeAt(0));
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024)
    throw new ApplicationError({
      code: "InvalidInput",
      message: "Sources must be between 1 byte and 10 MiB.",
    });
  if (input.provenanceUrl) {
    let url: URL;
    try {
      url = new URL(input.provenanceUrl);
    } catch {
      throw new ApplicationError({ code: "InvalidInput", message: "Enter a complete source URL." });
    }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
      throw new ApplicationError({
        code: "InvalidInput",
        message: "Source URLs must use HTTP or HTTPS without credentials.",
      });
  }
  if (!input.title.trim() || !input.filename.trim())
    throw new ApplicationError({
      code: "InvalidInput",
      message: "Give the source a title and filename.",
    });
  return bytes;
}

/** Reserve the original before writing R2. A retry or scheduled scan can finish publication. */
export const createSource = (env: Env, input: CreateSourceRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    if (input.kind === "attestation" && actor.kind !== "owner")
      return yield* Effect.fail(
        new ApplicationError({
          code: "Forbidden",
          message: "Only the Owner can record an Owner attestation.",
        }),
      );
    const bytes = yield* attempt(async () => decodeSource(input));
    const { contentBase64: _content, ...metadata } = input;
    const digest = yield* attempt(() => fingerprint(bytes));
    const sourceInput = { ...metadata, digest, byteLength: bytes.length };
    const replay = yield* attempt(() => store.replaySourceCreation(actor.id, sourceInput));
    const id =
      replay ??
      (yield* Effect.gen(function* () {
        const configuration = actor.kind === "owner" ? yield* aiConfiguration(env, input.ai) : null;
        if (input.ai && !configuration)
          return yield* Effect.fail(
            new ApplicationError({
              code: "Unavailable",
              message: "Choose an active personal AI connection before extracting evidence.",
            }),
          );
        const selectedAi = configuration?.connection
          ? { connectionId: configuration.connection.id, model: configuration.model }
          : undefined;
        return yield* attempt(() => store.beginSource(actor, sourceInput, selectedAi));
      }));
    const source = yield* attempt(() => store.getSource(actor.ownerId, id));
    if (!source)
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "Source not found." }),
      );
    if (source.state === "Uploading") {
      yield* attempt(async () => {
        await env.ARTIFACTS.put(source.objectKey, bytes, {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: source.mime },
          customMetadata: { sha256: digest },
          sha256: digest,
        });
        await store.finalizeSourceUpload(actor.ownerId, id);
      });
    }
    return { id };
  });

export const archiveSource = (input: ArchiveSourceRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(() => store.archiveSource(actor, input));
  });

export const listSources = Effect.gen(function* () {
  const actor = yield* Actor;
  const store = yield* Store;
  const sources = yield* attempt(() => store.listSources(actor.ownerId));
  return sources.map(({ objectKey: _key, ownerId: _owner, createdAt, updatedAt, ...source }) => ({
    ...source,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  }));
});

export const inspectSource = (env: Env, id: string, processingId?: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    const source = yield* attempt(() => store.getSource(actor.ownerId, id));
    if (!source)
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "Source not found." }),
      );
    const history = yield* attempt(() => store.sourceHistory(actor.ownerId, id));
    const selected = processingId ?? source.currentProcessingId;
    const result = selected
      ? yield* attempt(() => store.getProcessingResult(actor.ownerId, id, selected))
      : undefined;
    if (processingId && !result)
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "Processing result not found." }),
      );
    const extraction = result
      ? yield* attempt(async () => {
          const object = await env.ARTIFACTS.get(result.objectKey);
          if (!object)
            throw new ApplicationError({
              code: "Unavailable",
              message: "The extracted text is temporarily unavailable.",
            });
          return Schema.decodeUnknownSync(ExtractionResult)(await object.json());
        })
      : null;
    return {
      source: {
        id: source.id,
        revision: source.revision,
        state: source.state,
        currentProcessingId: source.currentProcessingId,
      },
      extraction,
      processingId: result?.id ?? null,
      history: history.map(({ result: { objectKey: _key, createdAt, ...item } }) => ({
        ...item,
        createdAt: new Date(createdAt).toISOString(),
      })),
    };
  });

export const retrySource = (input: RetrySourceRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    return { operationId: yield* attempt(() => store.retrySource(actor, input)) };
  });

/** Original downloads use the same authorization and ownership checks as source inspection. */
export const sourceDownload = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    const source = yield* attempt(() => store.getSource(actor.ownerId, id));
    if (!source)
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "Source not found." }),
      );
    const object = yield* attempt(() => env.ARTIFACTS.get(source.objectKey));
    if (!object)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message: "The original upload has not finished. Submit the same source again to resume.",
        }),
      );
    return new Response(object.body, {
      headers: {
        "Content-Type": source.mime,
        "Content-Disposition": `attachment; filename="source.${source.mime === "application/pdf" ? "pdf" : source.mime.includes("wordprocessingml") ? "docx" : "txt"}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

export const resumeSourceUpload = (env: Env, input: ResumeSourceRequest) =>
  Effect.gen(function* () {
    const actor = yield* Actor;
    const store = yield* Store;
    const source = yield* attempt(() => store.getSource(actor.ownerId, input.id));
    if (!source)
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "Source not found." }),
      );
    const bytes = yield* attempt(async () =>
      decodeSource({
        ...source,
        idempotencyKey: input.idempotencyKey,
        contentBase64: input.contentBase64,
      }),
    );
    const digest = yield* attempt(() => fingerprint(bytes));
    if (digest !== source.digest || bytes.length !== source.byteLength)
      return yield* Effect.fail(
        new ApplicationError({
          code: "InvalidInput",
          message:
            "This is different content. Select the exact original, or add it as a new source.",
        }),
      );
    const { contentBase64: _content, ...identity } = input;
    yield* attempt(() => store.reserveUploadResume(actor, identity));
    yield* attempt(async () => {
      await env.ARTIFACTS.put(source.objectKey, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        sha256: digest,
        httpMetadata: { contentType: source.mime },
        customMetadata: { sha256: digest },
      });
      await store.finalizeSourceUpload(actor.ownerId, source.id);
    });
    return { id: source.id };
  });
