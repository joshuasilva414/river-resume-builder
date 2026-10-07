import { type ArchiveSourceRequest, ExtractionResult } from "@river/contracts";
import { ApplicationError } from "@river/domain";
import { Effect, Schema } from "effect";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";
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
          message: "The original file is unavailable. Re-import a local copy through the browser.",
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
