import { ApplicationError, RecordId } from "@river/domain";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { bindings } from "./env";
import { Actor, attempt, execute, Store } from "./services";

const Request = Schema.Struct({
  kind: Schema.Literals([
    "template",
    "job",
    "source",
    "wording",
    "duplicate",
    "refinement",
    "checkpoint",
  ]),
  id: RecordId,
});
export const getAdvancedRecord = createServerFn({ method: "GET" })
  .validator(Schema.decodeUnknownSync(Request))
  .handler(({ data }) =>
    execute(
      bindings(),
      getRequestHeaders(),
      Effect.gen(function* () {
        const actor = yield* Actor,
          store = yield* Store;
        const settings = yield* attempt(() => store.getWorkspacePreferences(actor.ownerId));
        if (!settings.preferences.advancedTools)
          return yield* Effect.fail(
            new ApplicationError({
              code: "Forbidden",
              message: "Enable Advanced tools in Settings to inspect technical details.",
            }),
          );
        return yield* attempt(async () => {
          switch (data.kind) {
            case "template":
              return {
                kind: "template" as const,
                detail: {
                  ...(await store.inspectTemplate(actor.ownerId, data.id)),
                  validationConfigured: Boolean(bindings().TEMPLATE_VALIDATION_WORKFLOW),
                },
              };
            case "job":
              return {
                kind: "job" as const,
                detail: await store.inspectJobAi(actor.ownerId, data.id),
              };
            case "source":
              return {
                kind: "source" as const,
                detail: await store.inspectSourceAi(actor.ownerId, data.id),
              };
            case "wording":
              return {
                kind: "wording" as const,
                detail: await store.inspectWording(actor.ownerId, data.id),
              };
            case "duplicate":
              return {
                kind: "duplicate" as const,
                detail: await store.inspectDuplicateAi(actor.ownerId, data.id),
              };
            case "refinement":
              return {
                kind: "refinement" as const,
                detail: await store.inspectSourceRefinement(actor.ownerId, data.id),
              };
            case "checkpoint":
              return {
                kind: "checkpoint" as const,
                detail: await store.inspectCheckpoint(actor.ownerId, data.id),
              };
          }
        });
      }),
    ),
  );
