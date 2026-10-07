import { ApplicationError, canonicalJson, fingerprint } from "@river/domain";
import type { ExtractedSource } from "@river/domain/workspace";
import { Effect } from "effect";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";
/** Exact originals and extracted text are private artifacts. No extraction operation is queued. */
export const storeExtractedSource = (env: Env, input: ExtractedSource) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(async () => {
      if (!input.text.trim())
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Provide extracted or pasted text. File-only extraction is no longer supported.",
        });
      let bytes: Uint8Array;
      try {
        bytes = input.originalBase64
          ? Uint8Array.from(atob(input.originalBase64), (character) => character.charCodeAt(0))
          : new TextEncoder().encode(input.text);
      } catch {
        throw new ApplicationError({
          code: "InvalidInput",
          message: "The original must contain valid base64 bytes.",
        });
      }
      if (bytes.length > 10 * 1024 * 1024 || !bytes.length)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Original files must be between 1 byte and 10 MiB.",
        });
      const text = canonicalJson({
        type: "extracted",
        text: input.text,
        segments: [],
        parser: input.parser,
        parserVersion: input.parserVersion,
      });
      const originalDigest = await fingerprint(bytes),
        textDigest = await fingerprint(text);
      const objects = {
        original: {
          key: `sources/${actor.ownerId}/${input.id}/${originalDigest}/original`,
          digest: originalDigest,
          size: bytes.length,
        },
        text: {
          key: `sources/${actor.ownerId}/${input.id}/${textDigest}/text.json`,
          digest: textDigest,
        },
      };
      const { originalBase64: _original, ...metadata } = input;
      const previous = await store.replayCommand(
        actor.id,
        "workspace.source",
        input.idempotencyKey,
        { input: metadata, objects },
      );
      if (previous) return previous;
      await env.ARTIFACTS.put(objects.original.key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: input.mime },
        customMetadata: { sha256: originalDigest },
      });
      await env.ARTIFACTS.put(objects.text.key, text, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json" },
        customMetadata: { sha256: textDigest },
      });
      const [original, extracted] = await Promise.all([
        env.ARTIFACTS.head(objects.original.key),
        env.ARTIFACTS.head(objects.text.key),
      ]);
      if (
        original?.customMetadata?.sha256 !== originalDigest ||
        original.size !== bytes.length ||
        extracted?.customMetadata?.sha256 !== textDigest
      )
        throw new ApplicationError({
          code: "Unavailable",
          message: "Source archival did not finish. Retry with the same source.",
        });
      return store.saveExtractedSource(actor, metadata, objects);
    });
  });
