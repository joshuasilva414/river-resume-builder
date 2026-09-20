import { ApplicationError } from "@river/domain";
import { Effect } from "effect";
import { z } from "zod";
import type { Env } from "./env";
import { Actor, attempt, Store } from "./services";

const manifestSchema = z.object({
  createdAt: z.number(),
  input: z
    .object({
      preview: z
        .union([z.boolean(), z.object({ draftId: z.string(), revision: z.number() })])
        .optional(),
      type: z.string().optional(),
    })
    .passthrough(),
  artifacts: z
    .object({
      pdf: z.string().optional(),
      tex: z.string().optional(),
      text: z.string().optional(),
      report: z.string().optional(),
      expiresAt: z.number().optional(),
    })
    .passthrough(),
});
export const archiveFileKind = z.enum(["pdf", "tex", "text", "report"]);
const types = {
  pdf: "application/pdf",
  tex: "application/x-tex",
  text: "text/plain; charset=utf-8",
  report: "application/json",
};
export function archivedFiles(data: unknown, now = Date.now()) {
  const parsed = manifestSchema.safeParse(data);
  if (!parsed.success) return [];
  const { input, artifacts, createdAt } = parsed.data;
  const preview = input.preview || input.type === "source-refinement";
  const expiresAt = artifacts.expiresAt ?? (preview ? createdAt + 7 * 86400000 : null);
  return archiveFileKind.options.flatMap((kind) =>
    artifacts[kind]
      ? [
          {
            kind,
            key: artifacts[kind],
            expired: expiresAt !== null && expiresAt <= now,
            expiresAt,
            type: types[kind],
          },
        ]
      : [],
  );
}
/** Historical downloads read archived manifests only; no renderer, review gate, or active legacy mutation is involved. */
export const readArchivedFile = (env: Env, id: string, kind: z.infer<typeof archiveFileKind>) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const record = yield* attempt(() => store.readWorkspaceArchive(actor.ownerId, "artifacts", id));
    const file = archivedFiles(record.data).find((file) => file.kind === kind);
    if (!file)
      return yield* Effect.fail(
        new ApplicationError({ code: "NotFound", message: "This archived file is unavailable." }),
      );
    if (file.expired)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Conflict",
          message: "This temporary preview expired. Historical templates are not re-rendered.",
        }),
      );
    const object = yield* attempt(() => env.ARTIFACTS.get(file.key));
    if (!object)
      return yield* Effect.fail(
        new ApplicationError({
          code: "Unavailable",
          message:
            "The retained file is unavailable in artifact storage. Its historical record remains preserved.",
        }),
      );
    return { object, type: file.type };
  });
export const archivedFileStatus = (env: Env, id: string) =>
  Effect.gen(function* () {
    const actor = yield* Actor,
      store = yield* Store;
    const record = yield* attempt(() => store.readWorkspaceArchive(actor.ownerId, "artifacts", id));
    return yield* attempt(() =>
      Promise.all(
        archivedFiles(record.data).map(async (file) => ({
          kind: file.kind,
          status: file.expired
            ? ("Expired" as const)
            : (await env.ARTIFACTS.head(file.key))
              ? ("Available" as const)
              : ("Unavailable" as const),
          expiresAt: file.expiresAt,
        })),
      ),
    );
  });
