import { ApplicationError, fingerprint } from "@river/domain";
import {
  exportMetadataSchema,
  identitySchema,
  resolveDocument,
  validateRenderedText,
} from "@river/domain/workspace";
import { Effect } from "effect";
import { z } from "zod";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";

export const uploadExportSchema = z.object({
  id: identitySchema,
  versionId: identitySchema,
  idempotencyKey: z.string().min(1).max(128),
  metadata: exportMetadataSchema,
  pdfBase64: z
    .string()
    .min(8)
    .max(35 * 1024 * 1024),
});
export const archiveWorkspacePdf = (env: Env, input: z.infer<typeof uploadExportSchema>) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    return yield* attempt(async () => {
      const version = await store.getWorkspaceRecord(actor.ownerId, input.versionId);
      if (version.kind !== "version")
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Choose a saved résumé version.",
        });
      const document = resolveDocument(version.data.snapshot);
      if (!validateRenderedText(document.expectedText, input.metadata.text).ok)
        throw new ApplicationError({
          code: "InvalidInput",
          message: "Export text does not match the saved snapshot. Regenerate the PDF.",
        });
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(input.pdfBase64), (char) => char.charCodeAt(0));
      } catch {
        throw new ApplicationError({ code: "InvalidInput", message: "Provide valid PDF bytes." });
      }
      if (
        bytes.length !== input.metadata.byteLength ||
        new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-" ||
        (await fingerprint(bytes)) !== input.metadata.digest
      )
        throw new ApplicationError({
          code: "InvalidInput",
          message: "PDF bytes do not match the frozen export metadata.",
        });
      const objectKey = `workspace/${actor.ownerId}/exports/${input.id}/${input.metadata.digest}.pdf`;
      await store.prepareWorkspaceExport(actor, {
        id: input.id,
        versionId: input.versionId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
        objectKey,
      });
      // A retry reuses this immutable key and the exact original bytes.
      await env.ARTIFACTS.put(objectKey, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { sha256: input.metadata.digest },
      });
      const object = await env.ARTIFACTS.head(objectKey);
      if (object?.size !== bytes.length || object.customMetadata?.sha256 !== input.metadata.digest)
        throw new ApplicationError({
          code: "Unavailable",
          message: "PDF archival did not finish. Retry the retained file; do not regenerate it.",
        });
      const complete = await store.completeWorkspaceExport(actor.ownerId, input.id);
      return {
        id: complete.id,
        state: complete.state,
        versionId: complete.versionId,
        metadata: complete.metadata,
      };
    });
  });
export const workspaceExportHistory = (resumeId: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const resume = yield* attempt(() => store.getWorkspaceRecord(actor.ownerId, resumeId));
    if (resume.kind !== "resume")
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "Résumé unavailable." }),
      );
    return yield* attempt(() => store.listWorkspaceExports(actor.ownerId, resumeId));
  });
export const readWorkspacePdf = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const record = yield* attempt(() => store.getWorkspaceExport(actor.ownerId, id));
    if (record.state !== "Complete")
      return yield* Effect.fail(
        new ApplicationError({ code: "Conflict", message: "This PDF has not completed archival." }),
      );
    const object = yield* attempt(() => env.ARTIFACTS.get(record.objectKey));
    if (!object)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message: "The retained file is temporarily unavailable. Retry without re-rendering.",
        }),
      );
    return object;
  });
